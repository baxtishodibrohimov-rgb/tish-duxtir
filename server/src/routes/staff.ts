import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, one } from '../db.js';
import { requireMember, hashPassword, normalizePhone } from '../auth.js';
import { can, PERMS, ROLES, type Perm } from '../perms.js';
import { bad, forbidden, notFound } from '../errors.js';

const permsSchema = z.record(z.string(), z.boolean()).refine((o) => Object.keys(o).every((k) => PERMS.includes(k as Perm)), 'Noma’lum ruxsat');
const roleSchema = z.enum(ROLES as [string, ...string[]]).refine((r) => r !== 'owner', 'Egasini bu yerda qo‘shib bo‘lmaydi');

const Create = z.object({
  full_name: z.string().trim().min(2),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  password: z.string().min(8, 'Parol kamida 8 belgi'),
  role: roleSchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  all_branches: z.boolean().default(false),
  branch_ids: z.array(z.string().uuid()).default([]),
  permissions: permsSchema.default({}),
});

const Update = z.object({
  full_name: z.string().trim().min(2).optional(),
  role: roleSchema.optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  is_active: z.boolean().optional(),
  all_branches: z.boolean().optional(),
  branch_ids: z.array(z.string().uuid()).optional(),
  permissions: permsSchema.optional(),
});

export async function staffRoutes(app: FastifyInstance) {
  app.post('/api/staff', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'staff.manage')) throw forbidden();
    const b = Create.parse(req.body);
    if (!b.email && !b.phone) throw bad('Email yoki telefon kiriting');
    return tx(m.user_id, async (c) => {
      const email = b.email ? b.email.toLowerCase() : null;
      const phone = b.phone ? normalizePhone(b.phone) : null;
      // Foydalanuvchi boshqa klinikada bo'lsa — mavjud akkauntga biriktiramiz.
      let u = await one<any>(c, 'select id from users where ($1::text is not null and lower(email) = $1) or ($2::text is not null and phone = $2)', [email, phone]);
      if (!u) {
        u = await one<any>(c, 'insert into users (email, phone, password_hash, full_name) values ($1, $2, $3, $4) returning id',
          [email, phone, await hashPassword(b.password), b.full_name]);
      }
      const exists = await one(c, 'select 1 from members where org_id = $1 and user_id = $2', [m.org_id, u.id]);
      if (exists) throw bad('Bu xodim allaqachon qo‘shilgan');
      const mem = await one<any>(c, `insert into members (org_id, user_id, role, full_name, color, all_branches, permissions)
                                     values ($1, $2, $3, $4, coalesce($5, '#0ea5e9'), $6, $7) returning *`,
        [m.org_id, u.id, b.role, b.full_name, b.color ?? null, b.all_branches, JSON.stringify(b.permissions)]);
      await setBranches(c, m.org_id, mem.id, b.branch_ids);
      return mem;
    });
  });

  app.patch<{ Params: { id: string } }>('/api/staff/:id', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'staff.manage')) throw forbidden();
    const b = Update.parse(req.body);
    return tx(m.user_id, async (c) => {
      const cur = await one<any>(c, 'select * from members where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!cur) throw notFound();
      if (cur.role === 'owner') throw bad('Egasining huquqlarini o‘zgartirib bo‘lmaydi');
      await c.query(`update members set full_name = coalesce($2, full_name), role = coalesce($3, role), color = coalesce($4, color),
                       is_active = coalesce($5, is_active), all_branches = coalesce($6, all_branches),
                       permissions = coalesce($7, permissions) where id = $1`,
        [cur.id, b.full_name ?? null, b.role ?? null, b.color ?? null, b.is_active ?? null, b.all_branches ?? null,
          b.permissions ? JSON.stringify(b.permissions) : null]);
      if (b.branch_ids) await setBranches(c, m.org_id, cur.id, b.branch_ids);
      return one(c, 'select * from members where id = $1', [cur.id]);
    });
  });

  // Xodim parolini tiklash (egasi yoki xodimlarni boshqaruvchi).
  app.post<{ Params: { id: string }; Body: { password: string } }>('/api/staff/:id/password', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'staff.manage')) throw forbidden();
    const pw = z.string().min(8, 'Parol kamida 8 belgi').parse(req.body?.password);
    return tx(m.user_id, async (c) => {
      const cur = await one<any>(c, 'select user_id, role from members where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!cur) throw notFound();
      if (cur.role === 'owner' && cur.user_id !== m.user_id) throw forbidden();
      await c.query('update users set password_hash = $2, token_version = token_version + 1 where id = $1', [cur.user_id, await hashPassword(pw)]);
      return { ok: true };
    });
  });
}

async function setBranches(c: import('../db.js').Db, orgId: string, memberId: string, ids: string[]) {
  const valid = await c.query('select id from branches where org_id = $1 and id = any($2)', [orgId, ids]);
  await c.query('delete from member_branches where member_id = $1 and not (branch_id = any($2))', [memberId, valid.rows.map((r) => r.id)]);
  for (const r of valid.rows) {
    await c.query('insert into member_branches (member_id, branch_id) values ($1, $2) on conflict do nothing', [memberId, r.id]);
  }
}
