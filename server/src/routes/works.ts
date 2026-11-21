// "Bajarilgan ish": jadvaldagi qabul uchun ishlar va ishlatilgan materiallar.
// Qabul qilinganda akt yaratilib yopiladi (summa bemor qarziga qo'shiladi) va materiallar
// tanlangan miqdorda ombordan chiqariladi (kalkulyatsiya kartasi emas, shifokor belgilagan son).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, one, many } from '../db.js';
import { requireMember } from '../auth.js';
import { can } from '../perms.js';
import { bad, forbidden, notFound } from '../errors.js';

const Body = z.object({
  items: z.array(z.string().uuid()).min(1, 'Ishni tanlang').max(50),
  materials: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().positive().max(100000) })).max(200),
  warehouse_id: z.string().uuid().nullable().optional(),
});

export async function workRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/api/visits/:id/works', async (req) => {
    const m = requireMember(req);
    const b = Body.parse(req.body);
    return tx(m.user_id, async (c) => {
      const v = await one<any>(c, 'select * from visits where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!v) throw notFound('Qabul topilmadi');
      if (!can(m, 'patients.edit', v.branch_id)) throw forbidden();
      const items = await many<any>(c, 'select id, name, price from price_items where org_id = $1 and id = any($2)', [m.org_id, b.items]);
      if (items.length !== new Set(b.items).size) throw bad('Ish praysda topilmadi');

      const wh = b.warehouse_id
        ? await one<any>(c, 'select id, branch_id from warehouses where id = $1 and org_id = $2 and not archived', [b.warehouse_id, m.org_id])
        : await one<any>(c, 'select id, branch_id from warehouses where branch_id = $1 and is_main and not archived', [v.branch_id]);
      if (b.materials.length && (!wh || wh.branch_id !== v.branch_id)) throw bad('Filialning ombori topilmadi');

      const act = await one<any>(c, `insert into acts (org_id, branch_id, patient_id, visit_id, doctor_id, warehouse_id, act_date, created_by)
                                     values ($1, $2, $3, $4, $5, $6, ($7::timestamptz at time zone 'Asia/Tashkent')::date, $8) returning id`,
        [m.org_id, v.branch_id, v.patient_id, v.id, v.doctor_id, wh?.id ?? null, v.starts_at, m.user_id]);
      for (const id of b.items) {
        const it = items.find((x) => x.id === id)!;
        await c.query('insert into act_items (act_id, price_item_id, name, qty, price) values ($1, $2, $3, 1, $4)', [act.id, it.id, it.name, it.price]);
      }
      // Akt yopiladi. close_act() kalkulyatsiya kartasi bo'yicha chiqaradi — bu yerda esa shifokor belgilagan miqdor.
      await c.query(`update acts set status = 'closed' where id = $1`, [act.id]);

      let doc: string | null = null;
      const mats = new Map<string, number>();
      for (const x of b.materials) mats.set(x.product_id, (mats.get(x.product_id) ?? 0) + x.qty);
      if (mats.size) {
        const prods = await many<any>(c, 'select id from products where org_id = $1 and id = any($2)', [m.org_id, [...mats.keys()]]);
        if (prods.length !== mats.size) throw bad('Material omborda topilmadi');
        const d = await one<any>(c, `insert into stock_docs (org_id, type, warehouse_id, reason, note, act_id)
                                     values ($1, 'writeoff', $2, 'act', 'Bajarilgan ish (jadvaldan)', $3) returning id`, [m.org_id, wh.id, act.id]);
        let i = 0;
        for (const [pid, q] of mats) await c.query('insert into stock_doc_lines (doc_id, product_id, qty, position) values ($1, $2, $3, $4)', [d.id, pid, q, i++]);
        await c.query('select post_stock_doc($1)', [d.id]);
        doc = d.id;
      }
      if (v.status !== 'completed') await c.query(`update visits set status = 'completed' where id = $1`, [v.id]);
      await c.query(`insert into audit_log (org_id, entity, entity_id, action, details) values ($1, 'act', $2, 'works', $3)`,
        [m.org_id, act.id, JSON.stringify({ visit: v.id, items: b.items.length, materials: mats.size })]);

      const left = mats.size ? await many<any>(c, `select p.id product_id, p.name, p.unit, coalesce(sb.qty, 0) qty from products p
                                                   left join stock_balances sb on sb.product_id = p.id and sb.warehouse_id = $2 where p.id = any($1)`, [[...mats.keys()], wh.id]) : [];
      return { act_id: act.id, stock_doc_id: doc, left };
    });
  });

  // Bemor tarixi: yopilgan aktlar (ishlar) va ular bo'yicha ombordan chiqarilgan materiallar.
  app.get<{ Params: { id: string } }>('/api/patients/:id/works', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    return tx(m.user_id, (c) => many(c, `
      select a.id act_id, a.act_date, a.doctor_id, a.created_at,
             coalesce((select array_agg(ai.name order by ai.id) from act_items ai where ai.act_id = a.id), '{}') works,
             coalesce((select json_agg(json_build_object('name', p.name, 'unit', p.unit, 'qty', l.qty) order by l.position)
                         from stock_docs d join stock_doc_lines l on l.doc_id = d.id join products p on p.id = l.product_id
                        where d.act_id = a.id and d.status = 'posted' and d.reversal_of is null), '[]') mats
        from acts a where a.patient_id = $1 and a.org_id = $2 and a.status = 'closed'
       order by a.act_date desc, a.created_at desc`, [req.params.id, m.org_id]));
  });

  // Kassa: bugungi kartalarning tafsilotlari va shifokorlar bo'yicha tushum.
  const Period = z.object({ branch_id: z.string().uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
  app.get<{ Querystring: Record<string, string> }>('/api/cash/details', async (req) => {
    const m = requireMember(req);
    const q = Period.parse(req.query);
    if (!can(m, 'cashbox.view', q.branch_id)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const p = [m.org_id, q.branch_id, q.from, q.to];
      const MEM = (col: string) => `(select full_name from members where user_id = ${col} and org_id = $1)`;
      const [work, income, expense, org] = await Promise.all([
        many(c, `select pt.id patient_id, pt.full_name who, ${MEM('min(a.doctor_id::text)::uuid')} doc,
                        sum((select coalesce(sum(qty * price), 0) from act_items where act_id = a.id) - a.discount) work,
                        coalesce((select sum(case when kind = 'income' then amount else -amount end) from money_moves mm
                                   where mm.patient_id = pt.id and mm.kind in ('income', 'refund') and mm.branch_id = $2
                                     and mm.moved_at >= $3::date and mm.moved_at < $4::date + 1), 0) paid
                   from acts a join patients pt on pt.id = a.patient_id
                  where a.org_id = $1 and a.branch_id = $2 and a.status = 'closed' and a.act_date between $3 and $4
                  group by pt.id order by work desc`, p),
        many(c, `select m.id, m.moved_at at, m.kind, m.amount, pt.full_name who, cb.name box, ${MEM('m.created_by')} by_name,
                        coalesce(m.doctor_id, a.doctor_id) doctor_id, ${MEM('coalesce(m.doctor_id, a.doctor_id)')} doc
                   from money_moves m join cashboxes cb on cb.id = m.cashbox_id
                   left join patients pt on pt.id = m.patient_id left join acts a on a.id = m.act_id
                  where m.org_id = $1 and m.branch_id = $2 and m.kind in ('income', 'refund')
                    and m.moved_at >= $3::date and m.moved_at < $4::date + 1 order by m.moved_at`, p),
        many(c, `select m.id, m.moved_at at, m.amount, cb.name box, ${MEM('m.created_by')} by_name,
                        concat_ws(' · ', nullif(ec.name, ''), nullif(k.name, ''), nullif(m.note, '')) who
                   from money_moves m join cashboxes cb on cb.id = m.cashbox_id
                   left join expense_categories ec on ec.id = m.category_id left join counterparties k on k.id = m.counterparty_id
                  where m.org_id = $1 and m.branch_id = $2 and m.kind = 'expense'
                    and m.moved_at >= $3::date and m.moved_at < $4::date + 1 order by m.moved_at`, p),
        one(c, 'select doctor_share_percent from orgs where id = $1', [m.org_id]),
      ]);
      return { work, income, expense, share_percent: Number(org?.doctor_share_percent ?? 30) };
    });
  });
}
