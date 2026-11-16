// Boshqaruv buyruqlari (serverda ishga tushiriladi):
//   node dist/cli.js setup --org "Tish Duxtir" --branches "Chilonzor,Yunusobod,Sergeli" --name "Ism Familiya" --login admin@example.com
//   node dist/cli.js reset-password --login admin@example.com
// Parol terminaldan so'raladi (buyruqlar tarixida qolmasligi uchun).
import readline from 'node:readline';
import { pool, tx, one } from './db.js';
import { migrate } from './migrate.js';
import { hashPassword, normalizePhone } from './auth.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = (s: string) => { if (s.includes(q)) w.call(rl, s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

async function password(): Promise<string> {
  const env = process.env.SETUP_PASSWORD;
  if (env) return env;
  const a = await askHidden('Parol (kamida 8 belgi): ');
  const b = await askHidden('Parolni takrorlang: ');
  if (a !== b) throw new Error('Parollar mos emas');
  if (a.length < 8) throw new Error('Parol kamida 8 belgi bo‘lishi kerak');
  return a;
}

const loginCols = (login: string) => login.includes('@')
  ? { email: login.toLowerCase(), phone: null } : { email: null, phone: normalizePhone(login) };

async function setup() {
  const org = arg('org'), name = arg('name'), login = arg('login');
  const branches = (arg('branches') ?? 'Asosiy filial').split(',').map((s) => s.trim()).filter(Boolean);
  if (!org || !name || !login) throw new Error('Kerak: --org, --name, --login (va ixtiyoriy --branches)');
  await migrate();
  const pw = await password();
  const { email, phone } = loginCols(login);
  await tx(null, async (c) => {
    const u = await one<any>(c, `insert into users (email, phone, password_hash, full_name) values ($1, $2, $3, $4) returning id`,
      [email, phone, await hashPassword(pw), name]);
    const o = await one<any>(c, 'insert into orgs (name) values ($1) returning id', [org]);
    await c.query(`insert into members (org_id, user_id, role, full_name, all_branches) values ($1, $2, 'owner', $3, true)`, [o.id, u.id, name]);
    let i = 0;
    for (const b of branches) await c.query('insert into branches (org_id, name, position) values ($1, $2, $3)', [o.id, b, i++]);
    console.log(`✓ Tashkilot "${org}" yaratildi: ${branches.length} ta filial. Egasi: ${login}`);
  });
}

async function resetPassword() {
  const login = arg('login');
  if (!login) throw new Error('Kerak: --login');
  const pw = await password();
  const { email, phone } = loginCols(login);
  const r = await pool.query(`update users set password_hash = $3, token_version = token_version + 1
                               where ($1::text is not null and lower(email) = $1) or ($2::text is not null and phone = $2)`,
    [email, phone, await hashPassword(pw)]);
  console.log(r.rowCount ? '✓ Parol yangilandi' : 'Foydalanuvchi topilmadi');
}

const cmd = process.argv[2];
const run = cmd === 'setup' ? setup : cmd === 'reset-password' ? resetPassword : null;
if (!run) { console.log('Buyruqlar: setup, reset-password'); process.exit(1); }
run().then(() => pool.end()).catch((e) => { console.error('Xato:', e.message); process.exit(1); });
