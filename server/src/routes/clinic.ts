import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, one, many } from '../db.js';
import { requireMember } from '../auth.js';
import { can } from '../perms.js';
import { bad, forbidden, notFound } from '../errors.js';

const Period = z.object({ branch_id: z.string().uuid().optional(), from: z.string(), to: z.string() });

export async function clinicRoutes(app: FastifyInstance) {
  // ---------- Aktlar ----------
  app.get<{ Params: { id: string } }>('/api/acts/:id/shortage', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    return tx(m.user_id, async (c) => {
      const a = await one<any>(c, 'select id from acts where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!a) throw notFound();
      return many(c, 'select * from act_stock_shortage($1)', [a.id]);
    });
  });

  app.post<{ Params: { id: string } }>('/api/acts/:id/close', async (req) => {
    const m = requireMember(req);
    return tx(m.user_id, async (c) => {
      const a = await one<any>(c, 'select * from acts where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!a) throw notFound();
      if (!can(m, 'patients.edit', a.branch_id)) throw forbidden();
      const items = await one<any>(c, 'select count(*)::int n from act_items where act_id = $1', [a.id]);
      if (!items.n) throw bad('Aktda xizmat yo‘q');
      const r = await one<{ doc: string | null }>(c, 'select close_act($1) as doc', [a.id]);
      return { ok: true, stock_doc_id: r?.doc ?? null };
    });
  });

  app.post<{ Params: { id: string } }>('/api/acts/:id/cancel', async (req) => {
    const m = requireMember(req);
    return tx(m.user_id, async (c) => {
      const a = await one<any>(c, 'select * from acts where id = $1 and org_id = $2 for update', [req.params.id, m.org_id]);
      if (!a) throw notFound();
      if (!can(m, 'patients.edit', a.branch_id)) throw forbidden();
      if (a.status === 'draft') { await c.query('delete from acts where id = $1', [a.id]); return { ok: true, deleted: true }; }
      if (a.status !== 'closed') throw bad('Akt allaqachon bekor qilingan');
      // Yopilgan aktni bekor qilish: material chiqimi storno qilinadi.
      const doc = await one<any>(c, `select id from stock_docs where act_id = $1 and status = 'posted' and reversal_of is null`, [a.id]);
      if (doc) await c.query('select reverse_stock_doc($1)', [doc.id]);
      await c.query(`update acts set status = 'cancelled' where id = $1`, [a.id]);
      await c.query(`insert into audit_log (org_id, entity, entity_id, action) values ($1, 'act', $2, 'cancel')`, [m.org_id, a.id]);
      return { ok: true };
    });
  });

  // ---------- Bemor ----------
  app.get<{ Params: { id: string } }>('/api/patients/:id/summary', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    return tx(m.user_id, async (c) => {
      const p = await one<any>(c, 'select * from patients where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!p) throw notFound('Bemor topilmadi');
      const bal = await one<any>(c, 'select billed, paid from patient_balances where patient_id = $1', [p.id]);
      const last = await one<any>(c, `select starts_at from visits where patient_id = $1 and starts_at < now() and status <> 'cancelled' order by starts_at desc limit 1`, [p.id]);
      const next = await one<any>(c, `select starts_at from visits where patient_id = $1 and starts_at >= now() and status <> 'cancelled' order by starts_at limit 1`, [p.id]);
      return { patient: p, billed: bal?.billed ?? 0, paid: bal?.paid ?? 0, last_visit: last?.starts_at ?? null, next_visit: next?.starts_at ?? null };
    });
  });

  // Bemorlar ro'yxati uchun balanslar (qarzdorlar).
  app.post<{ Body: { ids: string[] } }>('/api/patients/balances', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    const ids = (req.body?.ids ?? []).slice(0, 2000);
    return tx(m.user_id, (c) => many(c, 'select patient_id, billed, paid from patient_balances where org_id = $1 and patient_id = any($2)', [m.org_id, ids]));
  });

  // ---------- Kassa ----------
  app.get<{ Querystring: Record<string, string> }>('/api/cash/summary', async (req) => {
    const m = requireMember(req);
    const q = Period.parse(req.query);
    const branches = q.branch_id ? [q.branch_id] : m.branch_ids;
    for (const b of branches) if (!can(m, 'cashbox.view', b)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const work = await one<any>(c,
        `select coalesce(sum(t.total), 0) total from (
           select (select coalesce(sum(qty * price), 0) from act_items where act_id = a.id) - a.discount as total
             from acts a where a.org_id = $1 and a.branch_id = any($2) and a.status = 'closed' and a.act_date between $3 and $4) t`,
        [m.org_id, branches, q.from, q.to]);
      const money = await one<any>(c,
        `select coalesce(sum(amount) filter (where kind = 'income'), 0) income,
                coalesce(sum(amount) filter (where kind = 'refund'), 0) refund,
                coalesce(sum(amount) filter (where kind = 'expense'), 0) expense
           from money_moves where org_id = $1 and branch_id = any($2)
            and moved_at >= $3::date and moved_at < $4::date + 1`, [m.org_id, branches, q.from, q.to]);
      const boxes = await many(c,
        `select b.cashbox_id, b.name, b.method, b.branch_id, b.balance,
                coalesce((select sum(case when kind = 'income' then amount when kind = 'refund' then -amount else 0 end)
                            from money_moves mm where mm.cashbox_id = b.cashbox_id
                             and mm.moved_at >= $3::date and mm.moved_at < $4::date + 1), 0) as period_income
           from cashbox_balances b join cashboxes cb on cb.id = b.cashbox_id
          where b.org_id = $1 and b.branch_id = any($2) and not cb.archived order by cb.position`,
        [m.org_id, branches, q.from, q.to]);
      const income = money.income - money.refund;
      return { work_done: work.total, income, expense: money.expense, profit: income - money.expense, cashboxes: boxes };
    });
  });

  // ---------- Hisobotlar ----------
  app.get<{ Querystring: Record<string, string> }>('/api/reports/overview', async (req) => {
    const m = requireMember(req);
    const q = Period.parse(req.query);
    const branches = q.branch_id ? [q.branch_id] : m.branch_ids;
    for (const b of branches) if (!can(m, 'reports.view', b)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const p = [m.org_id, branches, q.from, q.to];
      const [byDoctor, byDay, byService, visits, newPatients, byBranch] = await Promise.all([
        many(c, `select a.doctor_id, coalesce(mem.full_name, '—') name, count(distinct a.id)::int acts,
                        coalesce(sum(ai.qty * ai.price), 0) - coalesce((select sum(discount) from acts a2 where a2.doctor_id is not distinct from a.doctor_id
                          and a2.org_id = $1 and a2.branch_id = any($2) and a2.status = 'closed' and a2.act_date between $3 and $4), 0) total
                   from acts a left join act_items ai on ai.act_id = a.id
                   left join members mem on mem.user_id = a.doctor_id and mem.org_id = a.org_id
                  where a.org_id = $1 and a.branch_id = any($2) and a.status = 'closed' and a.act_date between $3 and $4
                  group by a.doctor_id, mem.full_name order by total desc`, p),
        many(c, `select d::date as day,
                        coalesce((select sum(case when kind = 'income' then amount when kind = 'refund' then -amount else 0 end) from money_moves
                                   where org_id = $1 and branch_id = any($2) and moved_at >= d and moved_at < d + interval '1 day'), 0) income,
                        coalesce((select sum(amount) from money_moves where kind = 'expense'
                                   and org_id = $1 and branch_id = any($2) and moved_at >= d and moved_at < d + interval '1 day'), 0) expense
                   from generate_series($3::date, $4::date, interval '1 day') d order by d`, p),
        many(c, `select ai.name, sum(ai.qty)::int qty, sum(ai.qty * ai.price) total
                   from acts a join act_items ai on ai.act_id = a.id
                  where a.org_id = $1 and a.branch_id = any($2) and a.status = 'closed' and a.act_date between $3 and $4
                  group by ai.name order by total desc limit 20`, p),
        one(c, `select count(*)::int total, count(*) filter (where status = 'completed')::int completed,
                       count(*) filter (where status = 'no_show')::int no_show, count(*) filter (where status = 'cancelled')::int cancelled
                  from visits where org_id = $1 and branch_id = any($2) and starts_at >= $3::date and starts_at < $4::date + 1`, p),
        one(c, `select count(*)::int n from patients where org_id = $1 and (home_branch_id = any($2) or home_branch_id is null)
                   and created_at >= $3::date and created_at < $4::date + 1`, p),
        many(c, `select b.id, b.name,
                        coalesce((select sum(case when kind = 'income' then amount when kind = 'refund' then -amount else 0 end) from money_moves mm
                                   where mm.branch_id = b.id and mm.moved_at >= $3::date and mm.moved_at < $4::date + 1), 0) income,
                        coalesce((select sum(amount) from money_moves mm where mm.kind = 'expense'
                                   and mm.branch_id = b.id and mm.moved_at >= $3::date and mm.moved_at < $4::date + 1), 0) expense
                   from branches b where b.org_id = $1 and b.id = any($2) order by b.position`, p),
      ]);
      return { byDoctor, byDay, byService, visits, newPatients: newPatients.n, byBranch };
    });
  });
}
