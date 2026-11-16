import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, one, many } from './db.js';
import { config } from './config.js';
import { HttpError } from './errors.js';
import type { MemberCtx } from './perms.js';

export const COOKIE = 'td_session';

export interface UserCtx { id: string; full_name: string; email: string | null; phone: string | null; avatar_url: string | null }

declare module 'fastify' {
  interface FastifyRequest { user_: UserCtx | null; member: MemberCtx | null }
}
declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { uid: string; tv: number } }
}

export function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 9) return '998' + d;
  return d;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 11);

async function loadMember(userId: string, orgId?: string): Promise<MemberCtx | null> {
  const m = await one<any>(pool,
    `select m.id, m.org_id, m.user_id, m.role, m.full_name, m.permissions, m.all_branches
       from members m where m.user_id = $1 and m.is_active and ($2::uuid is null or m.org_id = $2)
      order by m.created_at limit 1`, [userId, orgId ?? null]);
  if (!m) return null;
  const branches = (m.role === 'owner' || m.all_branches)
    ? await many<{ id: string }>(pool, 'select id from branches where org_id = $1 and not archived', [m.org_id])
    : await many<{ id: string }>(pool,
        `select b.id from member_branches mb join branches b on b.id = mb.branch_id
          where mb.member_id = $1 and not b.archived`, [m.id]);
  return { ...m, branch_ids: branches.map((b) => b.id) };
}

export async function registerAuth(app: FastifyInstance) {
  app.decorateRequest('user_', null);
  app.decorateRequest('member', null);

  // Har bir so'rovda sessiyani tekshiramiz (agar cookie bo'lsa).
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE];
    if (!token) return;
    try {
      const p = app.jwt.verify<{ uid: string; tv: number }>(token);
      const u = await one<any>(pool,
        'select id, full_name, email, phone, avatar_url, token_version, is_active from users where id = $1', [p.uid]);
      if (!u || !u.is_active || u.token_version !== p.tv) return;
      req.user_ = { id: u.id, full_name: u.full_name, email: u.email, phone: u.phone, avatar_url: u.avatar_url };
      const orgHeader = req.headers['x-org-id'];
      req.member = await loadMember(u.id, typeof orgHeader === 'string' && orgHeader ? orgHeader : undefined);
    } catch { /* yaroqsiz token — mehmon sifatida davom etadi */ }
  });

  const setSession = (reply: FastifyReply, uid: string, tv: number) => {
    const token = app.jwt.sign({ uid, tv }, { expiresIn: '30d' });
    reply.setCookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/', maxAge: 60 * 60 * 24 * 30,
    });
  };

  const LoginBody = z.object({ login: z.string().trim().min(3), password: z.string().min(1) });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { login, password } = LoginBody.parse(req.body);
    const isEmail = login.includes('@');
    const u = await one<any>(pool,
      `select id, password_hash, token_version, is_active from users where ${isEmail ? 'lower(email) = lower($1)' : 'phone = $1'}`,
      [isEmail ? login : normalizePhone(login)]);
    // Vaqt bo'yicha farqni kamaytirish uchun foydalanuvchi bo'lmasa ham hash tekshiramiz.
    const ok = await bcrypt.compare(password, u?.password_hash ?? '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!u || !ok || !u.is_active) throw new HttpError(401, 'Login yoki parol noto‘g‘ri');
    setSession(reply, u.id, u.token_version);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  // Barcha qurilmalardan chiqish.
  app.post('/api/auth/logout-all', async (req, reply) => {
    const u = requireUser(req);
    await pool.query('update users set token_version = token_version + 1 where id = $1', [u.id]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  const PwBody = z.object({ current: z.string().min(1), next: z.string().min(8, 'Parol kamida 8 belgi') });
  app.post('/api/auth/password', async (req, reply) => {
    const u = requireUser(req);
    const { current, next } = PwBody.parse(req.body);
    const row = await one<any>(pool, 'select password_hash, token_version from users where id = $1', [u.id]);
    if (!row || !(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, 'Joriy parol noto‘g‘ri');
    const r = await one<any>(pool,
      'update users set password_hash = $2, token_version = token_version + 1 where id = $1 returning token_version',
      [u.id, await hashPassword(next)]);
    setSession(reply, u.id, r.token_version);
    return { ok: true };
  });

  // Joriy foydalanuvchi, tashkilot, filiallar, xodimlar.
  app.get('/api/me', async (req) => {
    const u = requireUser(req);
    const m = req.member;
    if (!m) return { user: u, member: null, org: null, branches: [], members: [], orgs: [] };
    const [org, branches, members, orgs] = await Promise.all([
      one(pool, 'select * from orgs where id = $1', [m.org_id]),
      many(pool, 'select * from branches where org_id = $1 and not archived and id = any($2) order by position, created_at', [m.org_id, m.branch_ids]),
      many(pool, `select m.id, m.user_id, m.role, m.full_name, m.color, m.is_active, m.all_branches, m.permissions,
                         coalesce(array_agg(mb.branch_id) filter (where mb.branch_id is not null), '{}') as branch_ids
                    from members m left join member_branches mb on mb.member_id = m.id
                   where m.org_id = $1 group by m.id order by m.created_at`, [m.org_id]),
      many(pool, 'select o.id, o.name from members m join orgs o on o.id = m.org_id where m.user_id = $1 and m.is_active', [u.id]),
    ]);
    return { user: u, member: m, org, branches, members, orgs };
  });

  app.patch('/api/me', async (req) => {
    const u = requireUser(req);
    const b = z.object({ full_name: z.string().trim().min(1).max(120).optional(), avatar_url: z.string().max(500).nullable().optional() }).parse(req.body);
    await pool.query('update users set full_name = coalesce($2, full_name), avatar_url = case when $3 then $4 else avatar_url end where id = $1',
      [u.id, b.full_name ?? null, b.avatar_url !== undefined, b.avatar_url ?? null]);
    if (b.full_name) await pool.query('update members set full_name = $2 where user_id = $1', [u.id, b.full_name]);
    return { ok: true };
  });
}

export function requireUser(req: FastifyRequest): UserCtx {
  if (!req.user_) throw new HttpError(401, 'Tizimga kiring');
  return req.user_;
}

export function requireMember(req: FastifyRequest): MemberCtx {
  requireUser(req);
  if (!req.member) throw new HttpError(403, 'Siz hech qaysi klinikaga biriktirilmagansiz');
  return req.member;
}
