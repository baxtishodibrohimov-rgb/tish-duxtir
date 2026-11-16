// Eski (Lovable/Supabase) bazadan CSV orqali ma'lumot ko'chirish.
//
// Supabase jadval muharriridan har bir jadvalni CSV qilib yuklab oling va bitta papkaga qo'ying:
//   patients.csv, patient_visits.csv, price_categories.csv, price_items.csv,
//   acts.csv, payments.csv, treatment_records.csv   (bor bo'lganlari yetarli)
//
// Ishga tushirish (serverda):
//   docker compose run --rm -v /root/export:/import api node dist/import.js --dir /import --branch "Chilonzor"
//
// Eski id'lar saqlanadi, shuning uchun bog'lanishlar buzilmaydi. Qayta ishga tushirsa — mavjudlari o'tkazib yuboriladi.
// Xodimlar (shifokorlar) yangi tizimda qaytadan qo'shiladi, shuning uchun eski doctor_id ko'chirilmaydi.
import fs from 'node:fs';
import path from 'node:path';
import { pool, tx, one, type Db } from './db.js';
import { migrate } from './migrate.js';

function arg(name: string) { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; }

/** RFC 4180 CSV o'qish (qo'shtirnoq ichidagi vergul va yangi qatorlar bilan). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function load(dir: string, name: string) {
  const f = path.join(dir, `${name}.csv`);
  if (!fs.existsSync(f)) { console.log(`– ${name}.csv yo'q, o'tkazib yuborildi`); return []; }
  const rows = parseCsv(fs.readFileSync(f, 'utf8'));
  console.log(`· ${name}.csv: ${rows.length} qator`);
  return rows;
}

const v = (x: string | undefined) => (x === undefined || x === '' || x === 'NULL' ? null : x);
const num = (x: string | undefined) => Math.round(Number(x || 0)) || 0;
const VISIT_ST = new Set(['planned', 'confirmed', 'arrived', 'completed', 'no_show', 'cancelled']);

function splitName(full: string) {
  const p = full.trim().split(/\s+/);
  return { last_name: p[0] ?? '', first_name: p[1] ?? '', middle_name: p.slice(2).join(' ') };
}

async function main() {
  const dir = arg('dir');
  const branchName = arg('branch');
  if (!dir || !branchName) throw new Error('Kerak: --dir <papka> --branch "<filial nomi>"');
  await migrate();

  await tx(null, async (c: Db) => {
    const b = await one<{ id: string; org_id: string }>(c, 'select id, org_id from branches where name = $1', [branchName]);
    if (!b) throw new Error(`Filial topilmadi: ${branchName}. Avval "node dist/cli.js setup" bilan yarating.`);
    const org = b.org_id;
    let n = 0;

    // Narxlar
    for (const r of load(dir, 'price_categories')) {
      n += (await c.query(`insert into price_categories (id, org_id, name, position, color_idx) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
        [r.id, org, r.name || 'Kategoriya', num(r.position), num(r.position) % 6])).rowCount ?? 0;
    }
    let fallbackCat: string | null = null;
    for (const r of load(dir, 'price_items')) {
      let cat = v(r.category_id);
      if (!cat) {
        fallbackCat ??= (await one<{ id: string }>(c, `insert into price_categories (org_id, name) values ($1, 'Boshqa') returning id`, [org]))!.id;
        cat = fallbackCat;
      }
      n += (await c.query(`insert into price_items (id, org_id, category_id, name, code, price, position) values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing`,
        [r.id, org, cat, r.name ?? '', v(r.code), num(r.price), num(r.position)])).rowCount ?? 0;
    }

    // Bemorlar
    for (const r of load(dir, 'patients')) {
      const nm = r.last_name || r.first_name ? { last_name: r.last_name ?? '', first_name: r.first_name ?? '', middle_name: r.middle_name ?? '' } : splitName(r.full_name ?? '');
      const statusIds = (r.status_ids ?? '').replace(/[{}"]/g, '').split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x));
      // Karta raqami band bo'lsa (masalan boshqa filialdan ko'chirilgan), yangi raqam beriladi.
      let card = v(r.card_number);
      if (card && await one(c, 'select 1 from patients where org_id = $1 and card_number = $2 and id <> $3', [org, card, r.id])) card = null;
      const known = statusIds.length ? (await c.query('select id from patient_statuses where id = any($1)', [statusIds])).rows.map((x) => x.id) : [];
      n += (await c.query(`insert into patients (id, org_id, home_branch_id, card_number, last_name, first_name, middle_name, phone, birth_date, gender,
                             address, source, notes, status_ids, legacy_id, created_at, deleted_at)
                           values ($1::uuid, $2, $3, coalesce($4, ''), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $1::text, coalesce($15::timestamptz, now()), $16)
                           on conflict (id) do nothing`,
        [r.id, org, b.id, card, nm.last_name, nm.first_name, nm.middle_name, v(r.phone), v(r.birth_date),
          ['male', 'female'].includes(r.gender ?? '') ? r.gender : null, v(r.address), v(r.source), v(r.notes), known, v(r.created_at), v(r.deleted_at)])).rowCount ?? 0;
    }

    // Tashriflar (kabinet nomi bo'yicha topiladi yoki yaratiladi)
    const rooms = new Map<string, string>();
    for (const r of load(dir, 'patient_visits')) {
      let room: string | null = null;
      const rn = (r.room ?? '').trim();
      if (rn) {
        if (!rooms.has(rn)) {
          const ex = await one<{ id: string }>(c, 'select id from rooms where branch_id = $1 and name = $2', [b.id, rn]);
          rooms.set(rn, ex?.id ?? (await one<{ id: string }>(c, 'insert into rooms (org_id, branch_id, name) values ($1, $2, $3) returning id', [org, b.id, rn]))!.id);
        }
        room = rooms.get(rn)!;
      }
      n += (await c.query(`insert into visits (id, org_id, branch_id, patient_id, room_id, starts_at, ends_at, status, comment, created_at)
                           select $1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::timestamptz, now())
                            where exists (select 1 from patients where id = $4) and $7::timestamptz > $6::timestamptz
                           on conflict (id) do nothing`,
        [r.id, org, b.id, r.patient_id, room, r.starts_at, r.ends_at, VISIT_ST.has(r.status ?? '') ? r.status : 'planned', v(r.comment), v(r.created_at)])).rowCount ?? 0;
    }

    // Aktlar: items JSON -> act_items, yopilgan holatda
    for (const r of load(dir, 'acts')) {
      const ok = await c.query(`insert into acts (id, org_id, branch_id, patient_id, act_date, status, discount, created_at)
                                select $1, $2, $3, $4, $5, 'closed', $6, coalesce($7::timestamptz, now())
                                 where exists (select 1 from patients where id = $4) on conflict (id) do nothing`,
        [r.id, org, b.id, r.patient_id, v(r.date) ?? new Date().toISOString().slice(0, 10), num(r.discount), v(r.created_at)]);
      if (!ok.rowCount) continue;
      n++;
      let items: any[] = [];
      try { items = JSON.parse(r.items || '[]'); } catch { /* bo'sh */ }
      if (!items.length && num(r.total_amount) > 0) items = [{ name: 'Bajarilgan ishlar', price: num(r.total_amount) + num(r.discount), qty: 1 }];
      for (const it of items) {
        const pid = it.price_item_id ?? it.priceItemId ?? null;
        await c.query(`insert into act_items (act_id, price_item_id, name, tooth, qty, price)
                       values ($1, (select id from price_items where id::text = $2), $3, $4, $5, $6)`,
          [r.id, pid, String(it.name ?? it.title ?? 'Xizmat'), it.tooth ? String(it.tooth) : null, Math.max(1, Math.round(Number(it.qty ?? it.quantity ?? 1))), Math.round(Number(it.price ?? 0))]);
      }
    }

    // To'lovlar -> kassa kirimi (usul bo'yicha kassa)
    const boxes = new Map((await c.query('select id, method from cashboxes where branch_id = $1', [b.id])).rows.map((x) => [x.method, x.id]));
    for (const r of load(dir, 'payments')) {
      const method = ['cash', 'terminal', 'click', 'bank'].includes(r.method ?? '') ? r.method! : r.method === 'card' ? 'terminal' : 'cash';
      const box = boxes.get(method) ?? boxes.get('cash');
      const amount = num(r.amount);
      if (!box || amount === 0) continue;
      n += (await c.query(`insert into money_moves (id, org_id, branch_id, kind, cashbox_id, amount, patient_id, act_id, note, moved_at, created_by)
                           select $1, $2, $3, $4, $5, $6, $7, (select id from acts where id::text = $8), $9, coalesce($10::timestamptz, now()), null
                            where exists (select 1 from patients where id = $7) on conflict (id) do nothing`,
        [r.id, org, b.id, amount > 0 ? 'income' : 'refund', box, Math.abs(amount), r.patient_id, r.act_id ?? '', v(r.comment), v(r.date) ? `${r.date}T12:00:00+05:00` : v(r.created_at)])).rowCount ?? 0;
    }

    // Kasallik tarixi
    for (const r of load(dir, 'treatment_records')) {
      n += (await c.query(`insert into treatment_records (id, org_id, branch_id, patient_id, tooth, diagnosis, description, created_at)
                           select $1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now())
                            where exists (select 1 from patients where id = $4) on conflict (id) do nothing`,
        [r.id, org, b.id, r.patient_id, v(r.tooth), v(r.diagnosis), v(r.description), v(r.created_at)])).rowCount ?? 0;
    }

    console.log(`✓ Import tugadi: ${n} ta yozuv qo'shildi (filial: ${branchName}).`);
  });
}

main().then(() => pool.end()).catch((e) => { console.error('Xato:', e.message); process.exit(1); });
