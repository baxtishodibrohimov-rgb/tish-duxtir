import pg from 'pg';
import { config } from './config.js';

// numeric va bigint ustunlarni JS raqamiga aylantiramiz (summalar so'mda, xavfsiz diapazonda).
pg.types.setTypeParser(20, (v) => Number(v));     // int8
pg.types.setTypeParser(1700, (v) => Number(v));   // numeric
pg.types.setTypeParser(1082, (v) => v);           // date -> 'YYYY-MM-DD' matn sifatida

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });

export type Db = pg.PoolClient;

/** Tranzaksiya ichida ishlaydi; `app.user_id` bazadagi funksiyalar (has_perm, audit) uchun o'rnatiladi. */
export async function tx<T>(userId: string | null, fn: (c: Db) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (userId) await c.query(`select set_config('app.user_id', $1, true)`, [userId]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function one<T = any>(c: Db | pg.Pool, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await c.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = any>(c: Db | pg.Pool, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await c.query(sql, params);
  return r.rows as T[];
}
