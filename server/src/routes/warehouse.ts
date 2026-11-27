import type { FastifyInstance } from 'fastify';
import { tx, one, many, type Db } from '../db.js';
import { requireMember } from '../auth.js';
import { can, type MemberCtx } from '../perms.js';
import { z } from 'zod';
import { bad, forbidden, notFound } from '../errors.js';

async function docFor(c: Db, m: MemberCtx, id: string) {
  const d = await one<any>(c, `select d.*, w.branch_id from stock_docs d join warehouses w on w.id = d.warehouse_id
                                where d.id = $1 and d.org_id = $2`, [id, m.org_id]);
  if (!d) throw notFound('Hujjat topilmadi');
  return d;
}

const Uuid = z.string().uuid();
const DraftBody = z.object({
  doc_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), warehouse_id: Uuid, to_warehouse_id: Uuid.nullable().optional(),
  counterparty_id: Uuid.nullable().optional(), responsible_id: Uuid.nullable().optional(),
  reason: z.string().max(40).nullable().optional(), note: z.string().max(2000).nullable().optional(),
  lines: z.array(z.object({ product_id: Uuid, qty: z.number().min(0).max(1e9), price: z.number().min(0).max(1e12) })).max(500),
});

export async function warehouseRoutes(app: FastifyInstance) {
  // O'tkazish (draft -> posted). Bazadagi post_stock_doc ruxsat va qoldiqni o'zi tekshiradi.
  app.post<{ Params: { id: string } }>('/api/stock-docs/:id/post', async (req) => {
    const m = requireMember(req);
    return tx(m.user_id, async (c) => {
      const d = await docFor(c, m, req.params.id);
      if (!can(m, 'warehouse.edit', d.branch_id)) throw forbidden();
      if (d.type === 'transfer') {
        const to = await one<any>(c, 'select org_id from warehouses where id = $1', [d.to_warehouse_id]);
        if (!to || to.org_id !== m.org_id) throw bad('Qabul ombori noto‘g‘ri');
      }
      // Bo'sh qatorlarni tozalaymiz
      await c.query('delete from stock_doc_lines where doc_id = $1 and qty <= 0', [d.id]);
      await c.query('select post_stock_doc($1)', [d.id]);
      return one(c, 'select * from stock_docs where id = $1', [d.id]);
    });
  });

  // Qoralamani saqlash (avtomatik saqlash): sarlavha va qatorlar bitta tranzaksiyada almashtiriladi.
  // Bitta tovar ikki qatorda kelsa — bitta qatorga birlashtiriladi (miqdor qo'shiladi, narx o'rtacha).
  app.put<{ Params: { id: string } }>('/api/stock-docs/:id/draft', async (req) => {
    const m = requireMember(req);
    const b = DraftBody.parse(req.body);
    return tx(m.user_id, async (c) => {
      const d = await docFor(c, m, req.params.id);
      if (!can(m, 'warehouse.edit', d.branch_id)) throw forbidden();
      if (d.status !== 'draft') throw bad('Hujjat allaqachon o‘tkazilgan');
      for (const w of [b.warehouse_id, b.to_warehouse_id]) {
        if (!w) continue;
        const r = await one<any>(c, 'select branch_id from warehouses where id = $1 and org_id = $2', [w, m.org_id]);
        if (!r) throw bad('Ombor topilmadi');
        if (w === b.warehouse_id && !can(m, 'warehouse.edit', r.branch_id)) throw forbidden();
      }
      await c.query(`update stock_docs set doc_date = $2, warehouse_id = $3, to_warehouse_id = $4, counterparty_id = $5,
                            responsible_id = coalesce($6, responsible_id), reason = $7, note = $8 where id = $1`,
        [d.id, b.doc_date, b.warehouse_id, b.to_warehouse_id ?? null, b.counterparty_id ?? null, b.responsible_id ?? null, b.reason ?? null, b.note ?? null]);
      const merged = new Map<string, { qty: number; sum: number }>();
      for (const l of b.lines) {
        if (!(l.qty > 0)) continue;
        const x = merged.get(l.product_id) ?? { qty: 0, sum: 0 };
        x.qty += l.qty; x.sum += l.qty * l.price;
        merged.set(l.product_id, x);
      }
      if (merged.size) {
        const ok = await many<any>(c, 'select id from products where org_id = $1 and id = any($2)', [m.org_id, [...merged.keys()]]);
        if (ok.length !== merged.size) throw bad('Tovar topilmadi');
      }
      await c.query('delete from stock_doc_lines where doc_id = $1', [d.id]);
      let i = 0;
      for (const [pid, x] of merged) {
        await c.query('insert into stock_doc_lines (doc_id, product_id, qty, price, position) values ($1, $2, $3, $4, $5)',
          [d.id, pid, +x.qty.toFixed(3), x.qty ? +(x.sum / x.qty).toFixed(4) : 0, i++]);
      }
      return { ok: true, lines: merged.size };
    });
  });

  app.post<{ Params: { id: string } }>('/api/stock-docs/:id/reverse', async (req) => {
    const m = requireMember(req);
    return tx(m.user_id, async (c) => {
      const d = await docFor(c, m, req.params.id);
      if (!can(m, 'warehouse.edit', d.branch_id)) throw forbidden();
      const r = await one<{ id: string }>(c, 'select reverse_stock_doc($1) as id', [d.id]);
      return one(c, 'select * from stock_docs where id = $1', [r!.id]);
    });
  });

  // Nusxa: yangi qoralama, xuddi shu qatorlar bilan.
  app.post<{ Params: { id: string } }>('/api/stock-docs/:id/copy', async (req) => {
    const m = requireMember(req);
    return tx(m.user_id, async (c) => {
      const d = await docFor(c, m, req.params.id);
      if (!can(m, 'warehouse.edit', d.branch_id)) throw forbidden();
      const n = await one<any>(c, `insert into stock_docs (org_id, type, warehouse_id, to_warehouse_id, counterparty_id, reason, note)
                                   values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [m.org_id, d.type, d.warehouse_id, d.to_warehouse_id, d.counterparty_id, d.reason, d.note]);
      await c.query(`insert into stock_doc_lines (doc_id, product_id, qty, price, position)
                     select $1, product_id, qty, price, position from stock_doc_lines where doc_id = $2`, [n.id, d.id]);
      return n;
    });
  });

  // Tovar harakati tarixi (kartochkadagi "Tarix").
  app.get<{ Querystring: { product_id: string; warehouse_id?: string } }>('/api/stock/history', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.view')) throw forbidden();
    return tx(m.user_id, (c) => many(c,
      `select mv.id, mv.qty, mv.cost, mv.moved_at, mv.warehouse_id, d.id as doc_id, d.type, d.number, d.reason, d.status,
              d.counterparty_id, d.to_warehouse_id, d.warehouse_id as doc_warehouse_id,
              pt.full_name as act_patient,
              (select string_agg(ai.name, ', ' order by ai.id) from act_items ai where ai.act_id = a.id) as act_works
         from stock_moves mv join stock_docs d on d.id = mv.doc_id
         left join acts a on a.id = d.act_id left join patients pt on pt.id = a.patient_id
         join warehouses w on w.id = mv.warehouse_id
        where mv.org_id = $1 and mv.product_id = $2 and ($3::uuid is null or mv.warehouse_id = $3)
          and w.branch_id = any($4)
        order by mv.moved_at desc, mv.id desc limit 300`,
      [m.org_id, req.query.product_id, req.query.warehouse_id || null, m.branch_ids]));
  });

  // Hisobot: aylanma (davr boshi / kirim / chiqim / davr oxiri).
  app.get<{ Querystring: { warehouse_id?: string; from: string; to: string } }>('/api/stock/turnover', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.view')) throw forbidden();
    return tx(m.user_id, async (c) => {
      if (req.query.warehouse_id) {
        const w = await one<any>(c, 'select branch_id from warehouses where id = $1 and org_id = $2', [req.query.warehouse_id, m.org_id]);
        if (!w || !m.branch_ids.includes(w.branch_id)) throw forbidden();
        return many(c, 'select * from stock_turnover($1, $2, $3, $4)', [m.org_id, req.query.warehouse_id, req.query.from, req.query.to]);
      }
      if (!can(m, 'warehouse.view') || m.branch_ids.length === 0) throw forbidden();
      // Barcha omborlar: faqat barcha filiallarga kirishi borlar uchun
      const all = await one<any>(c, 'select count(*)::int n from branches where org_id = $1 and not archived', [m.org_id]);
      if (all.n !== m.branch_ids.length) throw bad('Omborni tanlang');
      return many(c, 'select * from stock_turnover($1, null, $2, $3)', [m.org_id, req.query.from, req.query.to]);
    });
  });

  // Hisobot: hisobdan chiqarishlar sabab bo'yicha.
  app.get<{ Querystring: { from: string; to: string; branch_id?: string } }>('/api/stock/writeoffs', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.view')) throw forbidden();
    return tx(m.user_id, (c) => many(c,
      `select coalesce(d.reason, 'other') reason, p.id product_id, p.name, p.unit, w.name warehouse,
              -sum(mv.qty) qty, -sum(mv.cost) cost
         from stock_moves mv join stock_docs d on d.id = mv.doc_id and d.type = 'writeoff' and d.status = 'posted' and d.reversal_of is null
         join products p on p.id = mv.product_id join warehouses w on w.id = mv.warehouse_id
        where mv.org_id = $1 and w.branch_id = any($2) and d.doc_date between $3 and $4 and ($5::uuid is null or w.branch_id = $5)
        group by 1, 2, 3, 4, 5 order by cost desc`, [m.org_id, m.branch_ids, req.query.from, req.query.to, uuidOrNull(req.query.branch_id)]));
  });

  // branch_id berilsa — faqat shu filial (ombor kirimlari va shu filial kassasidan to'lovlar).
  app.get<{ Querystring: { branch_id?: string } }>('/api/stock/supplier-debts', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.view') && !can(m, 'cashbox.view')) throw forbidden();
    const br = uuidOrNull(req.query.branch_id);
    if (br && !m.branch_ids.includes(br)) throw forbidden();
    return tx(m.user_id, (c) => br
      ? many(c, 'select * from supplier_debts_branch($1, $2) order by purchased - paid desc', [m.org_id, br])
      : many(c, 'select * from supplier_debts where org_id = $1 order by purchased - paid desc', [m.org_id]));
  });

  app.get<{ Querystring: { branch_id?: string } }>('/api/stock/low', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.view')) throw forbidden();
    return tx(m.user_id, (c) => many(c,
      `select l.* from low_stock l join warehouses w on w.id = l.warehouse_id
        where l.org_id = $1 and w.branch_id = any($2) and ($3::uuid is null or w.branch_id = $3)
        order by l.warehouse_name, l.name`, [m.org_id, m.branch_ids, uuidOrNull(req.query.branch_id)]));
  });

  // Buyurtma ro'yxatidan kirim qoralamasi yaratish.
  app.post<{ Body: { warehouse_id: string; counterparty_id?: string; lines: { product_id: string; qty: number }[] } }>(
    '/api/stock/order-to-receipt', async (req) => {
      const m = requireMember(req);
      const b = req.body;
      return tx(m.user_id, async (c) => {
        const w = await one<any>(c, 'select branch_id from warehouses where id = $1 and org_id = $2', [b.warehouse_id, m.org_id]);
        if (!w) throw bad('Ombor topilmadi');
        if (!can(m, 'warehouse.edit', w.branch_id)) throw forbidden();
        const d = await one<any>(c, `insert into stock_docs (org_id, type, warehouse_id, counterparty_id, note)
                                     values ($1, 'receipt', $2, $3, 'Buyurtma asosida') returning *`, [m.org_id, b.warehouse_id, b.counterparty_id || null]);
        let i = 0;
        for (const l of b.lines ?? []) {
          if (!(l.qty > 0)) continue;
          const p = await one<any>(c, 'select last_cost from products where id = $1 and org_id = $2', [l.product_id, m.org_id]);
          if (!p) continue;
          await c.query('insert into stock_doc_lines (doc_id, product_id, qty, price, position) values ($1, $2, $3, $4, $5)',
            [d.id, l.product_id, l.qty, p.last_cost, i++]);
        }
        return d;
      });
    });
}

/** So'rovdagi ixtiyoriy uuid: noto'g'ri qiymat filtrsiz deb olinmaydi, xato beradi. */
function uuidOrNull(v?: string) {
  if (!v) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw bad('Noto‘g‘ri filial');
  return v;
}
