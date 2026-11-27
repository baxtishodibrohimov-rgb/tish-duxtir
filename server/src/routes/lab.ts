// Laboratoriya: buyurtmalar, holatlar, qo'ng'iroqcha xabarlari va texniklar hisob-kitobi.
// Buyurtma "Material xarajat"da yaratiladi (works.ts). Holatni faqat ma'sul shaxs (yoki rahbar) o'zgartiradi.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, one, many, type Db } from '../db.js';
import { requireMember } from '../auth.js';
import { can, type MemberCtx } from '../perms.js';
import { bad, forbidden, notFound } from '../errors.js';

export const LAB_STATUSES = ['to_send', 'at_lab', 'remake', 'ready', 'delivered', 'cancelled'] as const;

const TODAY = `(now() at time zone 'Asia/Tashkent')::date`;
const MEM = (col: string) => `(select full_name from members where user_id = ${col} and org_id = o.org_id)`;

/** Buyurtma ro'yxati uchun umumiy SELECT (bemor, texnik, ma'sul, texnikka tegadigan summa). */
const ORDER_SELECT = `
  select o.*, p.full_name patient_name, p.card_number, p.phone patient_phone, k.name technician_name,
         ${MEM('o.responsible_id')} responsible_name, ${MEM('o.doctor_id')} doctor_name,
         e.earned, e.act_total, e.act_paid,
         (o.status in ('to_send', 'at_lab', 'remake', 'ready') and o.due_date < ${TODAY}) overdue
    from lab_orders o
    join patients p on p.id = o.patient_id
    join counterparties k on k.id = o.technician_id
    left join lab_order_earned e on e.order_id = o.id`;

/** Ma'sul shaxs yoki rahbar — boshqalar faqat ko'radi. */
function canDrive(m: MemberCtx, o: { responsible_id: string; branch_id: string }) {
  return (m.role === 'owner' || o.responsible_id === m.user_id) && m.branch_ids.includes(o.branch_id);
}

async function loadOrder(c: Db, m: MemberCtx, id: string) {
  const o = await one<any>(c, 'select * from lab_orders where id = $1 and org_id = $2 for update', [id, m.org_id]);
  if (!o) throw notFound('Buyurtma topilmadi');
  return o;
}

export async function labRoutes(app: FastifyInstance) {
  // Ro'yxat: filial bo'yicha (bemor kartasida — bemor bo'yicha, barcha filiallardan).
  app.get<{ Querystring: Record<string, string> }>('/api/lab/orders', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    const q = z.object({
      branch_id: z.string().uuid().optional(), patient_id: z.string().uuid().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.query);
    if (!q.branch_id && !q.patient_id) throw bad('Filial yoki bemor kerak');
    if (q.branch_id && !m.branch_ids.includes(q.branch_id)) throw forbidden();
    return tx(m.user_id, (c) => {
      const p: unknown[] = [m.org_id];
      const w = ['o.org_id = $1'];
      if (q.branch_id) { p.push(q.branch_id); w.push(`o.branch_id = $${p.length}`); }
      if (q.patient_id) { p.push(q.patient_id); w.push(`o.patient_id = $${p.length}`); }
      if (q.from) { p.push(q.from); w.push(`(o.created_at at time zone 'Asia/Tashkent')::date >= $${p.length}`); }
      if (q.to) { p.push(q.to); w.push(`(o.created_at at time zone 'Asia/Tashkent')::date <= $${p.length}`); }
      return many(c, `${ORDER_SELECT} where ${w.join(' and ')} order by o.number desc limit 2000`, p);
    });
  });

  app.get<{ Params: { id: string } }>('/api/lab/orders/:id', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    return tx(m.user_id, async (c) => {
      const o = await one<any>(c, `${ORDER_SELECT} where o.id = $1 and o.org_id = $2`, [req.params.id, m.org_id]);
      if (!o) throw notFound('Buyurtma topilmadi');
      const events = await many(c, `select ev.*, (select full_name from members where user_id = ev.by_user and org_id = ev.org_id) by_name
                                      from lab_order_events ev where ev.order_id = $1 order by ev.at`, [o.id]);
      return { ...o, events, can_drive: canDrive(m, o) };
    });
  });

  // Holat va tafsilotlarni o'zgartirish — faqat ma'sul shaxs yoki rahbar.
  app.patch<{ Params: { id: string } }>('/api/lab/orders/:id', async (req) => {
    const m = requireMember(req);
    const b = z.object({
      status: z.enum(LAB_STATUSES).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      technician_id: z.string().uuid().optional(),
      responsible_id: z.string().uuid().optional(),
      shade: z.string().trim().min(1).max(20).optional(),
      impression: z.enum(['scan', 'cast']).optional(),
      note: z.string().max(1000).nullable().optional(),
      comment: z.string().max(500).optional(),     // holat o'zgarishiga izoh (tarixga yoziladi)
    }).parse(req.body);
    return tx(m.user_id, async (c) => {
      const o = await loadOrder(c, m, req.params.id);
      if (!canDrive(m, o)) throw forbidden('Buyurtmani faqat ma’sul shaxs o‘zgartiradi');
      if (b.technician_id) {
        const t = await one(c, `select 1 from counterparties where id = $1 and org_id = $2 and type = 'technician'`, [b.technician_id, m.org_id]);
        if (!t) throw bad('Texnik topilmadi');
      }
      if (b.responsible_id) {
        const r = await one(c, 'select 1 from members where user_id = $1 and org_id = $2 and is_active', [b.responsible_id, m.org_id]);
        if (!r) throw bad('Ma’sul shaxs topilmadi');
      }
      if (b.status && b.status !== o.status && o.act_id) {
        const a = await one<any>(c, 'select status from acts where id = $1', [o.act_id]);
        if (a?.status === 'cancelled' && b.status !== 'cancelled') throw bad('Akt bekor qilingan — buyurtmani tiklab bo‘lmaydi');
      }

      const sets: string[] = ['updated_at = now()'];
      const params: unknown[] = [o.id];
      const set = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
      for (const k of ['technician_id', 'responsible_id', 'shade', 'impression', 'note'] as const) if (b[k] !== undefined && b[k] !== o[k]) set(k, b[k]);
      if (b.due_date && b.due_date !== o.due_date) { set('due_date', b.due_date); sets.push('checked_at = null'); }
      const st = b.status && b.status !== o.status ? b.status : null;
      if (st) {
        set('status', st);
        if (st === 'at_lab' && !o.sent_at) sets.push('sent_at = now()');
        if (st === 'at_lab' || st === 'remake') sets.push('checked_at = null');
        if (st === 'ready') sets.push('ready_at = now()');
        if (st === 'delivered') sets.push('delivered_at = now()');
      }
      if (sets.length === 1) return { ok: true };
      await c.query(`update lab_orders set ${sets.join(', ')} where id = $1`, params);
      const edits = ['technician_id', 'responsible_id', 'shade', 'impression', 'note', 'due_date'].filter((k) => (b as any)[k] !== undefined && (b as any)[k] !== o[k]);
      if (st) await c.query(`insert into lab_order_events (org_id, order_id, status, action, note, by_user) values ($1, $2, $3, 'status', $4, $5)`, [m.org_id, o.id, st, b.comment?.trim() || null, m.user_id]);
      if (edits.length) {
        const label: Record<string, string> = { technician_id: 'texnik', responsible_id: 'ma’sul', shade: 'rang', impression: 'qolip', note: 'izoh', due_date: 'muddat' };
        await c.query(`insert into lab_order_events (org_id, order_id, action, note, by_user) values ($1, $2, 'edit', $3, $4)`,
          [m.org_id, o.id, 'O‘zgartirildi: ' + edits.map((k) => label[k]).join(', ') + (b.due_date && edits.includes('due_date') ? ` → ${b.due_date}` : ''), m.user_id]);
      }
      return { ok: true };
    });
  });

  // "Texnikdan xabar oldim" — muddat yaqinlashgandagi eslatmani yopadi.
  app.post<{ Params: { id: string } }>('/api/lab/orders/:id/checked', async (req) => {
    const m = requireMember(req);
    const b = z.object({ comment: z.string().max(500).optional() }).parse(req.body ?? {});
    return tx(m.user_id, async (c) => {
      const o = await loadOrder(c, m, req.params.id);
      if (!canDrive(m, o)) throw forbidden('Faqat ma’sul shaxs belgilaydi');
      await c.query('update lab_orders set checked_at = now(), updated_at = now() where id = $1', [o.id]);
      await c.query(`insert into lab_order_events (org_id, order_id, action, note, by_user) values ($1, $2, 'checked', $3, $4)`,
        [m.org_id, o.id, b.comment?.trim() || 'Texnikdan xabar olindi', m.user_id]);
      return { ok: true };
    });
  });

  // Qo'ng'iroqcha: filialdagi hamma ko'radi; tugmani faqat ma'sul bosadi.
  //   send    — qolipni jo'natish kerak
  //   soon    — muddatga N kun qoldi: texnikdan xabar oling
  //   overdue — muddat o'tdi
  //   ready   — ish tayyor: bemorni chaqiring
  app.get<{ Querystring: Record<string, string> }>('/api/lab/alerts', async (req) => {
    const m = requireMember(req);
    const br = z.string().uuid().parse(req.query.branch_id);
    if (!m.branch_ids.includes(br) || !can(m, 'patients.view')) return [];
    return tx(m.user_id, async (c) => {
      const rows = await many<any>(c, `
        select o.id, o.number, o.status, o.work_name, o.tooth, o.due_date, o.responsible_id, o.patient_id,
               p.full_name patient_name, k.name technician_name, ${MEM('o.responsible_id')} responsible_name,
               case
                 when o.status = 'to_send' then 'send'
                 when o.status = 'ready' then 'ready'
                 when o.due_date < ${TODAY} then 'overdue'
                 else 'soon'
               end kind,
               (o.due_date - ${TODAY}) days_left
          from lab_orders o join patients p on p.id = o.patient_id join counterparties k on k.id = o.technician_id
          join orgs g on g.id = o.org_id
         where o.org_id = $1 and o.branch_id = $2 and (
               o.status in ('to_send', 'ready')
            or (o.status in ('at_lab', 'remake') and o.due_date - g.lab_warn_days <= ${TODAY}
                and (o.checked_at is null
                     or (o.due_date < ${TODAY} and (o.checked_at at time zone 'Asia/Tashkent')::date <= o.due_date))))
         order by case when o.status = 'to_send' then 0 when o.due_date < ${TODAY} then 1 when o.status = 'ready' then 3 else 2 end, o.due_date`, [m.org_id, br]);
      return rows.map((r) => ({ ...r, can_drive: r.responsible_id === m.user_id || m.role === 'owner' }));
    });
  });

  // ---------- Texniklar hisob-kitobi (Kassa → Kontragentlar → Texniklar) ----------
  // branch_id berilsa — summalar faqat shu filial bo'yicha (buyurtma filiali, to'lov kassasi filiali).
  const branchOf = (m: MemberCtx, v: unknown) => {
    if (v === undefined || v === '') return null;
    const br = z.string().uuid().parse(v);
    if (!m.branch_ids.includes(br)) throw forbidden();
    return br;
  };
  app.get<{ Querystring: Record<string, string> }>('/api/lab/technicians', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'cashbox.view') && !can(m, 'patients.view')) throw forbidden();
    const br = branchOf(m, req.query.branch_id);
    // Kassa ruxsati yo'q (masalan shifokor) — faqat ro'yxat (buyurtma oynasidagi tanlov uchun), summalarsiz.
    const money = can(m, 'cashbox.view');
    return tx(m.user_id, async (c) => (await many<any>(c, `
      select k.id, k.name, k.phone, k.archived,
             (select count(*) from lab_orders o where o.technician_id = k.id and o.status <> 'cancelled' and ($2::uuid is null or o.branch_id = $2))::int orders,
             (select count(*) from lab_orders o where o.technician_id = k.id and o.status in ('to_send', 'at_lab', 'remake', 'ready') and ($2::uuid is null or o.branch_id = $2))::int active,
             coalesce((select sum(o.tech_amount) from lab_orders o where o.technician_id = k.id and o.status <> 'cancelled' and ($2::uuid is null or o.branch_id = $2)), 0)::bigint planned,
             coalesce((select sum(e.earned) from lab_order_earned e join lab_orders o on o.id = e.order_id where e.technician_id = k.id and ($2::uuid is null or o.branch_id = $2)), 0)::bigint earned,
             coalesce((select sum(mm.amount) from money_moves mm where mm.counterparty_id = k.id and mm.kind = 'expense' and ($2::uuid is null or mm.branch_id = $2)), 0)::bigint paid
        from counterparties k
       where k.org_id = $1 and k.type = 'technician'
       order by k.archived, k.name`, [m.org_id, br])).map((r) => (money ? r : { ...r, planned: 0, earned: 0, paid: 0 })));
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>('/api/lab/technicians/:id', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'cashbox.view')) throw forbidden();
    const br = branchOf(m, req.query.branch_id);
    return tx(m.user_id, async (c) => {
      const k = await one<any>(c, `select id, name, phone, note from counterparties where id = $1 and org_id = $2 and type = 'technician'`, [req.params.id, m.org_id]);
      if (!k) throw notFound('Texnik topilmadi');
      const [orders, payments] = await Promise.all([
        many(c, `${ORDER_SELECT} where o.technician_id = $1 and o.org_id = $2 and ($3::uuid is null or o.branch_id = $3) order by o.number desc`, [k.id, m.org_id, br]),
        many(c, `select mm.id, mm.moved_at, mm.amount, mm.note, cb.name box,
                        (select full_name from members where user_id = mm.created_by and org_id = mm.org_id) by_name
                   from money_moves mm join cashboxes cb on cb.id = mm.cashbox_id
                  where mm.counterparty_id = $1 and mm.kind = 'expense' and ($2::uuid is null or mm.branch_id = $2) order by mm.moved_at desc`, [k.id, br]),
      ]);
      return { ...k, orders, payments };
    });
  });
}
