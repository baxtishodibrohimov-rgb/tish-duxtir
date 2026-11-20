// Davolash rejasi qatorlarini bajarish / rejalashtirish.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, one } from '../db.js';
import { requireMember } from '../auth.js';
import { can } from '../perms.js';
import { bad, forbidden, notFound } from '../errors.js';

interface Row {
  id: string; price_item_id?: string | null; name: string; zone?: string; price: number; disc?: string | number; dtype?: string;
  status?: 'none' | 'planned' | 'done'; pdate?: string | null; ddate?: string | null; ddoc?: string | null; act_id?: string | null; note?: string | null;
}
interface Stage { id: string; name: string; doctor_id?: string | null; rows: Row[] }

/** Chegirmadan keyingi narx (UI dagi finalOf bilan bir xil). */
export function finalOf(r: Row) {
  const d = Number(r.disc) || 0;
  const off = r.dtype === '%' || !r.dtype ? Math.round((r.price * d) / 100) : d;
  return Math.max(0, Math.round(r.price - off));
}

const Done = z.object({
  rows: z.array(z.string()).min(1, 'Xizmatni tanlang'),
  branch_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  assistant_id: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  warehouse_id: z.string().uuid().nullable().optional(),
  note: z.string().max(1000).optional(),
});
const Mark = z.object({
  rows: z.array(z.string()).min(1, 'Xizmatni tanlang'),
  status: z.enum(['none', 'planned']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(1000).optional(),
});

export async function planRoutes(app: FastifyInstance) {
  // Tanlangan qatorlar bajarildi: akt yaratiladi va yopiladi (material avtomatik chiqadi), qatorlar "Bajarildi" bo'ladi.
  app.post<{ Params: { id: string } }>('/api/plans/:id/done', async (req) => {
    const m = requireMember(req);
    const b = Done.parse(req.body);
    if (!can(m, 'patients.edit', b.branch_id)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const p = await one<any>(c, 'select * from treatment_plans where id = $1 and org_id = $2 for update', [req.params.id, m.org_id]);
      if (!p) throw notFound('Reja topilmadi');
      const doc = await one(c, 'select 1 from members where user_id = $1 and org_id = $2', [b.doctor_id, m.org_id]);
      if (!doc) throw bad('Ijrochi topilmadi');
      if (b.warehouse_id) {
        const w = await one<any>(c, 'select branch_id from warehouses where id = $1 and org_id = $2', [b.warehouse_id, m.org_id]);
        if (!w || w.branch_id !== b.branch_id) throw bad('Ombor noto‘g‘ri');
      }
      const stages = p.stages as Stage[];
      const picked = stages.flatMap((s) => s.rows).filter((r) => b.rows.includes(r.id) && r.status !== 'done');
      if (!picked.length) throw bad('Tanlangan xizmatlar allaqachon bajarilgan');
      const act = await one<any>(c, `insert into acts (org_id, branch_id, patient_id, doctor_id, warehouse_id, act_date, created_by)
                                     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [m.org_id, b.branch_id, p.patient_id, b.doctor_id, b.warehouse_id ?? null, b.date, m.user_id]);
      for (const r of picked) {
        await c.query(`insert into act_items (act_id, price_item_id, name, tooth, qty, price)
                       values ($1, (select id from price_items where id::text = $2 and org_id = $3), $4, $5, 1, $6)`,
          [act.id, r.price_item_id ?? '', m.org_id, r.name, r.zone || null, finalOf(r)]);
      }
      await c.query('select close_act($1)', [act.id]);
      for (const s of stages) for (const r of s.rows) {
        if (picked.some((x) => x.id === r.id)) Object.assign(r, { status: 'done', ddate: b.date, ddoc: b.doctor_id, act_id: act.id, note: b.note || r.note || null });
      }
      await c.query('update treatment_plans set stages = $2 where id = $1', [p.id, JSON.stringify(stages)]);
      return { ok: true, act_id: act.id, count: picked.length };
    });
  });

  // Rejalashtirish yoki "bajarilmagan" holatiga qaytarish (akt o'zgarmaydi).
  app.post<{ Params: { id: string } }>('/api/plans/:id/mark', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.edit')) throw forbidden();
    const b = Mark.parse(req.body);
    return tx(m.user_id, async (c) => {
      const p = await one<any>(c, 'select * from treatment_plans where id = $1 and org_id = $2 for update', [req.params.id, m.org_id]);
      if (!p) throw notFound('Reja topilmadi');
      const stages = p.stages as Stage[];
      for (const s of stages) for (const r of s.rows) {
        if (!b.rows.includes(r.id) || r.status !== 'done' || !r.act_id) continue;
        const a = await one<any>(c, 'select status from acts where id = $1', [r.act_id]);
        if (a?.status === 'closed') throw bad(`«${r.name}» akt bilan bajarilgan. Avval aktni Moliya bo‘limida bekor qiling.`);
      }
      for (const s of stages) for (const r of s.rows) {
        if (!b.rows.includes(r.id)) continue;
        if (b.status === 'planned') Object.assign(r, { status: 'planned', pdate: b.date ?? null, note: b.note || r.note || null });
        else Object.assign(r, { status: 'none', pdate: null, ddate: null, ddoc: null, act_id: null });
      }
      await c.query('update treatment_plans set stages = $2 where id = $1', [p.id, JSON.stringify(stages)]);
      return { ok: true };
    });
  });
}
