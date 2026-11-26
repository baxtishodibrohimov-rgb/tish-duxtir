// "Bajarilgan ish": jadvaldagi qabul uchun ishlar va ishlatilgan materiallar.
// Qabul qilinganda akt yaratilib yopiladi (summa bemor qarziga qo'shiladi) va materiallar
// tanlangan miqdorda ombordan chiqariladi (kalkulyatsiya kartasi emas, shifokor belgilagan son).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, one, many, type Db } from '../db.js';
import { requireMember } from '../auth.js';
import { can, type MemberCtx } from '../perms.js';
import { bad, forbidden, notFound } from '../errors.js';

const Body = z.object({
  items: z.array(z.string().uuid()).min(1, 'Ishni tanlang').max(50),
  tooth: z.string().max(300).nullable().optional(), // "36, 37" yoki "Barcha tishlar"
  qty: z.number().int().min(1).max(64).optional(),     // nechta tish — narx shunga ko'payadi
  discount: z.number().int().min(0).optional(),        // chegirma, so'm
  discount_pct: z.number().min(0).max(100).nullable().optional(), // foizda berilgan bo'lsa (ko'rsatish uchun)
  materials: z.array(z.object({ product_id: z.string().uuid(), qty: z.number().positive().max(100000), group: z.string().max(120).nullable().optional() })).max(200),
  warehouse_id: z.string().uuid().nullable().optional(),
});
type WorkBody = z.infer<typeof Body>;
interface Ctx { org_id: string; branch_id: string; patient_id: string; visit_id: string | null; doctor_id: string | null; date: string | Date }

/**
 * Akt yaratib yopadi (summa bemor qarziga qo'shiladi) va materiallarni tanlangan miqdorda ombordan chiqaradi
 * (kalkulyatsiya kartasi emas — shifokor belgilagan son).
 */
async function recordWorks(c: Db, m: MemberCtx, x: Ctx, b: WorkBody) {
  const items = await many<any>(c, 'select id, name, price from price_items where org_id = $1 and id = any($2)', [m.org_id, b.items]);
  if (items.length !== new Set(b.items).size) throw bad('Ish praysda topilmadi');

  const wh = b.warehouse_id
    ? await one<any>(c, 'select id, branch_id from warehouses where id = $1 and org_id = $2 and not archived', [b.warehouse_id, m.org_id])
    : await one<any>(c, 'select id, branch_id from warehouses where branch_id = $1 and is_main and not archived', [x.branch_id]);
  if (b.materials.length && (!wh || wh.branch_id !== x.branch_id)) throw bad('Filialning ombori topilmadi');

  const act = await one<any>(c, `insert into acts (org_id, branch_id, patient_id, visit_id, doctor_id, warehouse_id, act_date, created_by)
                                 values ($1, $2, $3, $4, $5, $6, ($7::timestamptz at time zone 'Asia/Tashkent')::date, $8) returning id`,
    [m.org_id, x.branch_id, x.patient_id, x.visit_id, x.doctor_id, wh?.id ?? null, x.date, m.user_id]);
  const tooth = b.tooth?.trim() || null;
  // Narx har doim tishlar soniga ko'payadi; chegirma jami summadan oshmaydi.
  const qty = b.qty ?? 1;
  const gross = items.reduce((a, it) => a + Number(it.price) * qty, 0);
  const discount = Math.min(b.discount ?? 0, gross);
  if (discount) await c.query('update acts set discount = $2 where id = $1', [act.id, discount]);
  for (const id of b.items) {
    const it = items.find((r) => r.id === id)!;
    await c.query('insert into act_items (act_id, price_item_id, name, tooth, qty, price) values ($1, $2, $3, $4, $5, $6)', [act.id, it.id, it.name, tooth, qty, it.price]);
  }
  // Akt yopiladi. close_act() kalkulyatsiya kartasi bo'yicha chiqaradi — bu yerda esa shifokor belgilagan miqdor.
  await c.query(`update acts set status = 'closed' where id = $1`, [act.id]);

  let doc: string | null = null;
  const mats = new Map<string, number>();
  for (const r of b.materials) mats.set(r.product_id, (mats.get(r.product_id) ?? 0) + r.qty);
  if (mats.size) {
    const prods = await many<any>(c, 'select id from products where org_id = $1 and id = any($2)', [m.org_id, [...mats.keys()]]);
    if (prods.length !== mats.size) throw bad('Material omborda topilmadi');
    const d = await one<any>(c, `insert into stock_docs (org_id, type, warehouse_id, reason, note, act_id)
                                 values ($1, 'writeoff', $2, 'act', 'Material xarajat', $3) returning id`, [m.org_id, wh.id, act.id]);
    let i = 0;
    for (const [pid, q] of mats) await c.query('insert into stock_doc_lines (doc_id, product_id, qty, position) values ($1, $2, $3, $4)', [d.id, pid, q, i++]);
    await c.query('select post_stock_doc($1)', [d.id]);
    doc = d.id;
  }
  if (x.visit_id) await c.query(`update visits set status = 'completed' where id = $1 and status <> 'completed'`, [x.visit_id]);
  await c.query(`insert into audit_log (org_id, entity, entity_id, action, details) values ($1, 'act', $2, 'works', $3)`,
    [m.org_id, act.id, JSON.stringify({ visit: x.visit_id, items: b.items.length, tooth, materials: mats.size })]);

  const left = mats.size ? await many<any>(c, `select p.id product_id, p.name, p.unit, coalesce(sb.qty, 0) qty from products p
                                               left join stock_balances sb on sb.product_id = p.id and sb.warehouse_id = $2 where p.id = any($1)`, [[...mats.keys()], wh.id]) : [];
  // Tarix kartasi (akt yopilganda trigger yaratgan) — to'liq tafsilot: kategoriya, ish, narx, guruhlar bo'yicha materiallar.
  const info = await many<any>(c, `select i.id, i.name, i.price, pc.name cat from price_items i left join price_categories pc on pc.id = i.category_id where i.id = any($1)`, [b.items]);
  const pinfo = mats.size ? await many<any>(c, 'select id, name, unit from products where id = any($1)', [[...mats.keys()]]) : [];
  const groups = new Map<string, { name: string; qty: number; unit: string }[]>();
  for (const r of b.materials) {
    const pr = pinfo.find((x) => x.id === r.product_id);
    const g = r.group?.trim() || 'Materiallar';
    const list = groups.get(g) ?? [];
    const same = list.find((x) => x.name === pr?.name);
    if (same) same.qty += r.qty; else list.push({ name: pr?.name ?? '', qty: r.qty, unit: pr?.unit ?? '' });
    groups.set(g, list);
  }
  const details = {
    kind: 'works', category: info[0]?.cat ?? null, works: info.map((x) => ({ name: x.name, price: Number(x.price), qty })),
    gross, discount, discount_pct: b.discount_pct ?? null, total: gross - discount, tooth,
    groups: [...groups.entries()].map(([name, items]) => ({ name, items })),
  };
  await c.query('update treatment_records set details = $2 where act_id = $1', [act.id, JSON.stringify(details)]);
  return { act_id: act.id, stock_doc_id: doc, left };
}

export async function workRoutes(app: FastifyInstance) {
  // Jadvaldagi qabuldan.
  app.post<{ Params: { id: string } }>('/api/visits/:id/works', async (req) => {
    const m = requireMember(req);
    const b = Body.parse(req.body);
    return tx(m.user_id, async (c) => {
      const v = await one<any>(c, 'select * from visits where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!v) throw notFound('Qabul topilmadi');
      if (!can(m, 'patients.edit', v.branch_id)) throw forbidden();
      return recordWorks(c, m, { org_id: m.org_id, branch_id: v.branch_id, patient_id: v.patient_id, visit_id: v.id, doctor_id: v.doctor_id, date: v.starts_at }, b);
    });
  });

  // Bemor kartasidan (qabulsiz): shifokor — shu foydalanuvchi, sana — bugun.
  app.post<{ Params: { id: string } }>('/api/patients/:id/works', async (req) => {
    const m = requireMember(req);
    const b = Body.extend({ branch_id: z.string().uuid() }).parse(req.body);
    if (!can(m, 'patients.edit', b.branch_id)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const p = await one<any>(c, 'select id from patients where id = $1 and org_id = $2 and deleted_at is null', [req.params.id, m.org_id]);
      if (!p) throw notFound('Bemor topilmadi');
      const br = await one<any>(c, 'select id from branches where id = $1 and org_id = $2', [b.branch_id, m.org_id]);
      if (!br) throw bad('Filial topilmadi');
      return recordWorks(c, m, { org_id: m.org_id, branch_id: b.branch_id, patient_id: p.id, visit_id: null, doctor_id: m.user_id, date: new Date() }, b);
    });
  });

  // "Material xarajat" oynasi uchun hammasi bitta so'rovda (ombor huquqi bo'lmagan shifokorga ham kerak).
  app.get<{ Querystring: { branch_id?: string } }>('/api/works/catalog', async (req) => {
    const m = requireMember(req);
    const br = z.string().uuid().parse(req.query.branch_id);
    if (!can(m, 'patients.view', br)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const wh = await one<any>(c, 'select id from warehouses where branch_id = $1 and org_id = $2 and is_main and not archived', [br, m.org_id]);
      const [cats, items, groups, cards, products] = await Promise.all([
        many(c, 'select id, name, icon, ask_teeth, position from price_categories where org_id = $1 order by position, name', [m.org_id]),
        many(c, 'select id, category_id, name, price, position from price_items where org_id = $1 and not archived order by position, name', [m.org_id]),
        many(c, 'select id, price_item_id, name, position from work_mat_groups where org_id = $1 order by position, name', [m.org_id]),
        many(c, 'select price_item_id, product_id, qty, group_id, position from calc_cards where org_id = $1 order by position', [m.org_id]),
        many(c, `select p.id, p.name, p.unit, p.image_path is not null as has_image, p.image_path, b.name brand,
                        coalesce((select qty from stock_balances where product_id = p.id and warehouse_id = $2), 0) qty
                   from products p left join brands b on b.id = p.brand_id
                  where p.org_id = $1 and not p.archived and p.id in (select product_id from calc_cards where org_id = $1)`, [m.org_id, wh?.id ?? null]),
      ]);
      return { warehouse_id: wh?.id ?? null, cats, items, groups, cards, products };
    });
  });

  // Bemor tarixi: yopilgan aktlar (ishlar) va ular bo'yicha ombordan chiqarilgan materiallar.
  app.get<{ Params: { id: string } }>('/api/patients/:id/works', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    return tx(m.user_id, (c) => many(c, `
      select a.id act_id, a.act_date, a.doctor_id, a.created_at,
             coalesce((select array_agg(ai.name order by ai.id) from act_items ai where ai.act_id = a.id), '{}') works,
             (select string_agg(distinct ai.tooth, '; ') from act_items ai where ai.act_id = a.id and ai.tooth is not null) tooth,
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
