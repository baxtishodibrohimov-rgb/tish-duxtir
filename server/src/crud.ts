// Umumiy CRUD: har bir jadval uchun oq ro'yxat (ustunlar, filtrlar) va ruxsatlar.
// Tashkilot (org_id) har doim serverda qo'yiladi; filial jadvallarida
// foydalanuvchining shu filialga kirishi ham tekshiriladi.
import type { FastifyInstance } from 'fastify';
import { tx, one, many, type Db } from './db.js';
import { requireMember } from './auth.js';
import { can, type MemberCtx, type Perm } from './perms.js';
import { bad, forbidden, notFound } from './errors.js';

interface Resource {
  table: string;
  /** org: faqat org_id; branch: org_id + branch_id; child: ota jadval orqali */
  scope: 'org' | 'branch' | 'child';
  parent?: { resource: string; fk: string };
  read: Perm | null;          // null — tashkilotning istalgan a'zosi
  write: Perm | null;         // null — yozib bo'lmaydi
  columns: string[];          // yoziladigan ustunlar
  filters?: string[];         // filtrlanadigan ustunlar (id, org_id avtomatik)
  search?: string[];          // ?q= qidiruv ustunlari
  order?: string;
  /** Qo'shimcha shart: masalan omborda faqat yetkazib beruvchilar */
  extraWrite?: { perm: Perm; when: (row: Record<string, unknown>) => boolean };
  /** Bemor umumiy bo'lgani uchun: bemor kartasidagi tarix barcha filiallardan ko'rinadi */
  crossBranchRead?: 'always' | 'patient';
  /** Kompozit kalitli jadvallar (id ustuni yo'q) */
  key?: string[];
}

const R: Record<string, Resource> = {
  branches: { table: 'branches', scope: 'org', read: null, write: 'settings.edit',
    columns: ['name', 'address', 'phone', 'slot_minutes', 'work_start', 'work_end', 'days_visible', 'position', 'archived'],
    filters: ['archived'], order: 'position, created_at' },
  rooms: { table: 'rooms', scope: 'branch', read: null, write: 'settings.edit',
    columns: ['branch_id', 'name', 'color', 'position', 'is_active'], filters: ['branch_id', 'is_active'], order: 'position, name' },
  patient_statuses: { table: 'patient_statuses', scope: 'org', read: null, write: 'settings.edit',
    columns: ['name', 'color', 'kind', 'reminder_months', 'position'], filters: ['kind'], order: 'position, name' },
  patients: { table: 'patients', scope: 'org', read: 'patients.view', write: 'patients.edit',
    columns: ['home_branch_id', 'last_name', 'first_name', 'middle_name', 'phone', 'phone2', 'birth_date', 'gender', 'address',
      'source', 'referrer', 'important_info', 'notes', 'status_ids', 'deleted_at'],
    filters: ['home_branch_id', 'deleted_at', 'card_number', 'phone'], search: ['full_name', 'phone', 'card_number'], order: 'created_at desc' },
  visits: { table: 'visits', scope: 'branch', read: 'schedule.view', write: 'schedule.edit',
    columns: ['branch_id', 'patient_id', 'doctor_id', 'assistant_id', 'room_id', 'starts_at', 'ends_at', 'status', 'is_first_visit', 'comment'],
    filters: ['branch_id', 'patient_id', 'doctor_id', 'room_id', 'status', 'starts_at'], order: 'starts_at', crossBranchRead: 'patient' },
  time_reservations: { table: 'time_reservations', scope: 'branch', read: 'schedule.view', write: 'schedule.edit',
    columns: ['branch_id', 'room_id', 'starts_at', 'ends_at', 'reason', 'color'], filters: ['branch_id', 'room_id', 'starts_at'], order: 'starts_at' },
  staff_shifts: { table: 'staff_shifts', scope: 'branch', read: 'schedule.view', write: 'schedule.edit',
    columns: ['branch_id', 'member_id', 'room_id', 'shift_date', 'starts_at', 'ends_at'], filters: ['branch_id', 'member_id', 'shift_date'], order: 'shift_date, starts_at' },
  price_categories: { table: 'price_categories', scope: 'org', read: null, write: 'settings.edit',
    columns: ['name', 'color_idx', 'position'], order: 'position, name' },
  price_items: { table: 'price_items', scope: 'org', read: null, write: 'settings.edit',
    columns: ['category_id', 'name', 'code', 'price', 'position', 'archived'], filters: ['category_id', 'archived'],
    search: ['name', 'code'], order: 'position, name' },
  treatment_plans: { table: 'treatment_plans', scope: 'org', read: 'patients.view', write: 'patients.edit',
    columns: ['patient_id', 'doctor_id', 'title', 'status', 'discount_percent'], filters: ['patient_id', 'status'], order: 'created_at desc' },
  treatment_plan_items: { table: 'treatment_plan_items', scope: 'child', parent: { resource: 'treatment_plans', fk: 'plan_id' },
    read: 'patients.view', write: 'patients.edit', columns: ['plan_id', 'price_item_id', 'name', 'tooth', 'qty', 'price'], filters: ['plan_id'], order: 'id' },
  treatment_records: { table: 'treatment_records', scope: 'org', read: 'patients.view', write: 'patients.edit',
    columns: ['branch_id', 'patient_id', 'visit_id', 'doctor_id', 'tooth', 'diagnosis', 'description'], filters: ['patient_id', 'visit_id'], order: 'created_at desc' },
  record_files: { table: 'record_files', scope: 'org', read: 'patients.view', write: 'patients.edit',
    columns: ['record_id', 'kind', 'name'], filters: ['patient_id', 'record_id'], order: 'created_at desc' },
  acts: { table: 'acts', scope: 'branch', read: 'patients.view', write: 'patients.edit',
    columns: ['branch_id', 'patient_id', 'visit_id', 'doctor_id', 'warehouse_id', 'act_date', 'discount'],
    filters: ['branch_id', 'patient_id', 'doctor_id', 'status', 'act_date'], order: 'act_date desc, created_at desc', crossBranchRead: 'patient' },
  act_items: { table: 'act_items', scope: 'child', parent: { resource: 'acts', fk: 'act_id' }, read: 'patients.view', write: 'patients.edit',
    columns: ['act_id', 'price_item_id', 'name', 'tooth', 'qty', 'price'], filters: ['act_id'], order: 'id' },
  reminders: { table: 'reminders', scope: 'org', read: 'patients.view', write: 'patients.edit',
    columns: ['patient_id', 'assigned_to', 'remind_at', 'comment', 'status'], filters: ['patient_id', 'status', 'assigned_to', 'remind_at'], order: 'remind_at' },

  cashboxes: { table: 'cashboxes', scope: 'branch', read: null, write: 'settings.edit',
    columns: ['branch_id', 'name', 'method', 'position', 'archived'], filters: ['branch_id', 'archived'], order: 'position, name' },
  counterparties: { table: 'counterparties', scope: 'org', read: null, write: 'cashbox.edit',
    columns: ['type', 'name', 'phone', 'email', 'address', 'contact_person', 'inn', 'bank_name', 'bank_account', 'mfo', 'note', 'archived'],
    filters: ['type', 'archived'], search: ['name', 'phone', 'inn'], order: 'name',
    extraWrite: { perm: 'warehouse.admin', when: (r) => r.type === 'supplier' } },
  expense_categories: { table: 'expense_categories', scope: 'org', read: null, write: 'cashbox.edit',
    columns: ['name', 'archived'], filters: ['archived'], order: 'name' },
  currency_rates: { table: 'currency_rates', scope: 'org', read: null, write: 'cashbox.edit',
    columns: ['currency', 'rate', 'rate_date'], filters: ['currency', 'rate_date'], order: 'rate_date desc' },
  money_moves: { table: 'money_moves', scope: 'branch', read: 'cashbox.view', write: 'cashbox.edit',
    columns: ['kind', 'cashbox_id', 'to_cashbox_id', 'amount', 'patient_id', 'doctor_id', 'act_id', 'counterparty_id', 'category_id', 'stock_doc_id', 'note', 'moved_at'],
    filters: ['branch_id', 'kind', 'cashbox_id', 'patient_id', 'doctor_id', 'counterparty_id', 'category_id', 'created_by', 'moved_at', 'stock_doc_id'],
    order: 'moved_at desc' },

  warehouses: { table: 'warehouses', scope: 'branch', read: null, write: 'warehouse.admin',
    columns: ['branch_id', 'name', 'responsible_id', 'is_main', 'note', 'archived'], filters: ['branch_id', 'archived', 'is_main'], order: 'is_main desc, name' },
  product_categories: { table: 'product_categories', scope: 'org', read: 'warehouse.view', write: 'warehouse.admin',
    columns: ['parent_id', 'name', 'position'], filters: ['parent_id'], order: 'position, name' },
  brands: { table: 'brands', scope: 'org', read: 'warehouse.view', write: 'warehouse.admin',
    columns: ['name', 'logo_url', 'archived'], filters: ['archived'], search: ['name'], order: 'name' },
  products: { table: 'products', scope: 'org', read: 'warehouse.view', write: 'warehouse.admin',
    columns: ['category_id', 'brand_id', 'name', 'sku', 'barcode', 'unit', 'pack_unit', 'pack_qty', 'note', 'archived'],
    filters: ['category_id', 'brand_id', 'archived'], search: ['name', 'sku', 'barcode'], order: 'name' },
  product_wh_settings: { table: 'product_wh_settings', scope: 'org', read: 'warehouse.view', write: 'warehouse.admin',
    columns: ['product_id', 'warehouse_id', 'visible', 'min_qty', 'order_qty', 'location'], filters: ['product_id', 'warehouse_id'],
    order: 'product_id', key: ['product_id', 'warehouse_id'] },
  calc_cards: { table: 'calc_cards', scope: 'org', read: 'warehouse.view', write: 'warehouse.admin',
    columns: ['price_item_id', 'product_id', 'qty'], filters: ['price_item_id', 'product_id'], order: 'price_item_id' },
  stock_docs: { table: 'stock_docs', scope: 'org', read: 'warehouse.view', write: 'warehouse.edit',
    columns: ['type', 'doc_date', 'warehouse_id', 'to_warehouse_id', 'counterparty_id', 'responsible_id', 'reason', 'note'],
    filters: ['type', 'status', 'warehouse_id', 'to_warehouse_id', 'counterparty_id', 'responsible_id', 'doc_date', 'act_id'],
    search: ['number', 'note'], order: 'doc_date desc, number desc' },
  stock_doc_lines: { table: 'stock_doc_lines', scope: 'child', parent: { resource: 'stock_docs', fk: 'doc_id' },
    read: 'warehouse.view', write: 'warehouse.edit', columns: ['doc_id', 'product_id', 'qty', 'price', 'position'], filters: ['doc_id', 'product_id'], order: 'position, id' },
  stock_balances: { table: 'stock_balances', scope: 'org', read: 'warehouse.view', write: null, columns: [],
    filters: ['product_id', 'warehouse_id'], order: 'product_id', key: ['product_id', 'warehouse_id'] },
};

// Havola ustunlari: qiymat albatta shu tashkilotga tegishli bo'lishi kerak.
const REFS: Record<string, string> = {
  patient_id: 'patients', room_id: 'rooms', branch_id: 'branches', home_branch_id: 'branches', visit_id: 'visits',
  act_id: 'acts', price_item_id: 'price_items', plan_id: 'treatment_plans', record_id: 'treatment_records',
  cashbox_id: 'cashboxes', to_cashbox_id: 'cashboxes', counterparty_id: 'counterparties', stock_doc_id: 'stock_docs',
  warehouse_id: 'warehouses', to_warehouse_id: 'warehouses', product_id: 'products', brand_id: 'brands',
  parent_id: 'product_categories', member_id: 'members', doc_id: 'stock_docs',
};
const CATEGORY_REF: Record<string, string> = {
  price_items: 'price_categories', products: 'product_categories', money_moves: 'expense_categories',
};
const USER_REFS = ['doctor_id', 'assistant_id', 'assigned_to', 'responsible_id'];

async function checkRefs(c: Db, m: MemberCtx, res: Resource, row: Record<string, unknown>) {
  for (const [col, val] of Object.entries(row)) {
    if (val === null || val === undefined) continue;
    let table = REFS[col];
    if (col === 'category_id') table = CATEGORY_REF[res.table];
    if (table) {
      const ok = await one(c, `select 1 from ${qi(table)} where id = $1 and org_id = $2`, [val, m.org_id]);
      if (!ok) throw bad(`Noto‘g‘ri havola: ${col}`);
    } else if (USER_REFS.includes(col)) {
      const ok = await one(c, 'select 1 from members where user_id = $1 and org_id = $2', [val, m.org_id]);
      if (!ok) throw bad(`Xodim topilmadi: ${col}`);
    }
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
const qi = (s: string) => { if (!IDENT.test(s)) throw bad('Noto‘g‘ri ustun'); return `"${s}"`; };

function getRes(name: string): Resource {
  const r = R[name];
  if (!r) throw notFound('Bunday bo‘lim yo‘q');
  return r;
}

/** Ombor jadvallarida filial — ombor orqali aniqlanadi. */
async function warehouseBranch(c: Db, whId: unknown): Promise<string | null> {
  if (!whId) return null;
  const w = await one<{ branch_id: string }>(c, 'select branch_id from warehouses where id = $1', [whId]);
  return w?.branch_id ?? null;
}

/** Yozuv uchun ruxsatni tekshiradi (filial bilan). */
async function checkWrite(c: Db, m: MemberCtx, res: Resource, row: Record<string, any>) {
  let branch: string | null = null;
  if (res.scope === 'branch') branch = row.branch_id ?? null;
  if (res.table === 'stock_docs') branch = await warehouseBranch(c, row.warehouse_id);
  if (res.table === 'money_moves') {
    const cb = await one<{ branch_id: string; org_id: string }>(c, 'select branch_id, org_id from cashboxes where id = $1', [row.cashbox_id]);
    if (!cb || cb.org_id !== m.org_id) throw bad('Kassa topilmadi');
    branch = cb.branch_id;
  }
  const ok = (res.write && can(m, res.write, branch)) || (res.extraWrite && res.extraWrite.when(row) && can(m, res.extraWrite.perm));
  if (!ok) throw forbidden();
}

/** Ota yozuvni olib, tashkilot va ruxsatni tekshiradi (child jadvallar uchun). */
async function parentRow(c: Db, m: MemberCtx, res: Resource, parentId: unknown) {
  const pres = getRes(res.parent!.resource);
  const p = await one<any>(c, `select * from ${qi(pres.table)} where id = $1 and org_id = $2`, [parentId, m.org_id]);
  if (!p) throw notFound('Asosiy hujjat topilmadi');
  if (pres.table === 'acts' && p.status !== 'draft') throw bad('Yopilgan aktni o‘zgartirib bo‘lmaydi');
  if (pres.table === 'stock_docs' && p.status !== 'draft') throw bad('O‘tkazilgan hujjatni o‘zgartirib bo‘lmaydi');
  await checkWrite(c, m, pres, p);     // ota hujjatning filiali bo'yicha ruxsat
  return { p, pres };
}

function buildWhere(m: MemberCtx, res: Resource, query: Record<string, string>, params: unknown[]): string[] {
  const where: string[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (res.scope !== 'child') where.push(`t.org_id = ${add(m.org_id)}`);
  const cross = res.crossBranchRead === 'always' || (res.crossBranchRead === 'patient' && query['f.patient_id']);
  if (res.scope === 'branch' && !cross) where.push(`t.branch_id = any(${add(m.branch_ids)})`);
  if (res.table === 'stock_docs') {
    where.push(`(t.warehouse_id in (select id from warehouses where branch_id = any(${add(m.branch_ids)}))
              or t.to_warehouse_id in (select id from warehouses where branch_id = any($${params.length})))`);
  }
  if (res.table === 'stock_balances') where.push(`t.warehouse_id in (select id from warehouses where branch_id = any(${add(m.branch_ids)}))`);

  const allowed = new Set(['id', ...(res.filters ?? [])]);
  for (const [k, raw] of Object.entries(query)) {
    if (!k.startsWith('f.')) continue;
    const [, col, op = 'eq'] = k.split('.');
    if (!col || !allowed.has(col)) throw bad(`Filtr mumkin emas: ${col}`);
    const c = `t.${qi(col)}`;
    if (raw === 'null') { where.push(op === 'not' ? `${c} is not null` : `${c} is null`); continue; }
    switch (op) {
      case 'eq': where.push(`${c} = ${add(raw)}`); break;
      case 'not': where.push(`${c} is distinct from ${add(raw)}`); break;
      case 'gte': where.push(`${c} >= ${add(raw)}`); break;
      case 'gt': where.push(`${c} > ${add(raw)}`); break;
      case 'lte': where.push(`${c} <= ${add(raw)}`); break;
      case 'lt': where.push(`${c} < ${add(raw)}`); break;
      case 'in': where.push(`${c}::text = any(${add(raw.split(',').filter(Boolean))})`); break;
      case 'has': where.push(`${add(raw)} = any(${c})`); break;
      default: throw bad(`Noma'lum operator: ${op}`);
    }
  }
  if (query.q && res.search?.length) {
    const p = add(`%${query.q.trim()}%`);
    where.push('(' + res.search.map((s) => `t.${qi(s)}::text ilike ${p}`).join(' or ') + ')');
  }
  return where;
}

function pick(res: Resource, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const c of res.columns) if (c in body) out[c] = body[c] === '' ? null : body[c];
  return out;
}

export async function registerCrud(app: FastifyInstance) {
  app.get<{ Params: { name: string }; Querystring: Record<string, string> }>('/api/r/:name', async (req) => {
    const m = requireMember(req);
    const res = getRes(req.params.name);
    if (res.read && !can(m, res.read)) throw forbidden();
    return tx(m.user_id, async (c) => {
      const params: unknown[] = [];
      const where = buildWhere(m, res, req.query, params);
      if (res.scope === 'child') {
        const fk = res.parent!.fk;
        const pid = req.query[`f.${fk}`] ?? req.query[`f.${fk}.in`];
        if (!pid) throw bad(`${fk} filtri majburiy`);
        const pres = getRes(res.parent!.resource);
        params.push(m.org_id);
        where.push(`t.${qi(fk)} in (select id from ${qi(pres.table)} where org_id = $${params.length})`);
      }
      const limit = Math.min(Number(req.query.limit ?? 1000) || 1000, 5000);
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
      const order = (req.query.order && /^[a-z_]+( (asc|desc))?(, ?[a-z_]+( (asc|desc))?)*$/.test(req.query.order))
        ? req.query.order : res.order ?? 'id';
      const sql = `select t.* from ${qi(res.table)} t ${where.length ? 'where ' + where.join(' and ') : ''}
                   order by ${order.split(',').map((o) => 't.' + o.trim()).join(', ')} limit ${limit} offset ${offset}`;
      return many(c, sql, params);
    });
  });

  app.post<{ Params: { name: string }; Body: Record<string, unknown> | Record<string, unknown>[] }>('/api/r/:name', async (req) => {
    const m = requireMember(req);
    const res = getRes(req.params.name);
    if (!res.write) throw forbidden();
    const rows = Array.isArray(req.body) ? req.body : [req.body ?? {}];
    if (rows.length > 500) throw bad('Juda ko‘p yozuv');
    return tx(m.user_id, async (c) => {
      const out = [];
      for (const body of rows) {
        const row = pick(res, body);
        if (res.scope === 'child') {
          await parentRow(c, m, res, row[res.parent!.fk]);
        } else {
          row.org_id = m.org_id;
          await checkWrite(c, m, res, row);
        }
        await checkRefs(c, m, res, row);
        if (['patients', 'visits', 'acts', 'treatment_records', 'time_reservations'].includes(res.table)) row.created_by = m.user_id;
        const cols = Object.keys(row);
        const sql = res.key
          ? `insert into ${qi(res.table)} (${cols.map(qi).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
             on conflict (${res.key.map(qi).join(', ')}) do update set ${cols.filter((k) => !res.key!.includes(k)).map((k) => `${qi(k)} = excluded.${qi(k)}`).join(', ') || `${qi(res.key[0]!)} = excluded.${qi(res.key[0]!)}`}
             returning *`
          : `insert into ${qi(res.table)} (${cols.map(qi).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`;
        out.push(await one(c, sql, cols.map((k) => row[k])));
      }
      return Array.isArray(req.body) ? out : out[0];
    });
  });

  app.patch<{ Params: { name: string; id: string }; Body: Record<string, unknown> }>('/api/r/:name/:id', async (req) => {
    const m = requireMember(req);
    const res = getRes(req.params.name);
    if (!res.write || res.key) throw forbidden();
    return tx(m.user_id, async (c) => {
      const cur = await one<any>(c, `select * from ${qi(res.table)} where id = $1 for update`, [req.params.id]);
      if (!cur) throw notFound();
      if (res.scope === 'child') await parentRow(c, m, res, cur[res.parent!.fk]);
      else {
        if (cur.org_id !== m.org_id) throw notFound();
        await checkWrite(c, m, res, cur);
      }
      const patch = pick(res, req.body ?? {});
      if (res.scope === 'child') delete patch[res.parent!.fk];
      if (res.scope !== 'child') await checkWrite(c, m, res, { ...cur, ...patch });   // yangi filialga ham ruxsat bo'lsin
      await checkRefs(c, m, res, patch);
      const cols = Object.keys(patch);
      if (!cols.length) return cur;
      return one(c, `update ${qi(res.table)} set ${cols.map((k, i) => `${qi(k)} = $${i + 2}`).join(', ')} where id = $1 returning *`,
        [req.params.id, ...cols.map((k) => patch[k])]);
    });
  });

  app.delete<{ Params: { name: string; id: string }; Querystring: Record<string, string> }>('/api/r/:name/:id', async (req) => {
    const m = requireMember(req);
    const res = getRes(req.params.name);
    if (!res.write) throw forbidden();
    return tx(m.user_id, async (c) => {
      if (res.key) {
        // kompozit kalit: /api/r/product_wh_settings/<product_id>?warehouse_id=...
        const [k1, k2] = res.key;
        const r = await one<any>(c, `delete from ${qi(res.table)} where ${qi(k1!)} = $1 and ${qi(k2!)} = $2 and org_id = $3 returning *`,
          [req.params.id, req.query[k2!], m.org_id]);
        if (!r) throw notFound();
        return { ok: true };
      }
      const cur = await one<any>(c, `select * from ${qi(res.table)} where id = $1 for update`, [req.params.id]);
      if (!cur) throw notFound();
      if (res.scope === 'child') await parentRow(c, m, res, cur[res.parent!.fk]);
      else { if (cur.org_id !== m.org_id) throw notFound(); await checkWrite(c, m, res, cur); }
      await c.query(`delete from ${qi(res.table)} where id = $1`, [req.params.id]);
      await c.query(`insert into audit_log (org_id, entity, entity_id, action, details) values ($1, $2, $3, 'delete', $4)`,
        [m.org_id, res.table, req.params.id, JSON.stringify(cur)]);
      return { ok: true };
    });
  });
}
