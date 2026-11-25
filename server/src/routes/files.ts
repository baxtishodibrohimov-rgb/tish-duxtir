import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { tx, one, pool } from '../db.js';
import { requireMember } from '../auth.js';
import { can } from '../perms.js';
import { config } from '../config.js';
import { bad, forbidden, notFound } from '../errors.js';

const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic)|audio\/(webm|ogg|mpeg|mp4|wav|x-m4a)|application\/pdf|application\/dicom)$/;

export async function fileRoutes(app: FastifyInstance) {
  // Bemor fayli yuklash: multipart, maydonlar: patient_id, record_id?, kind?
  app.post('/api/files', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.edit')) throw forbidden();
    const part = await req.file();
    if (!part) throw bad('Fayl yo‘q');
    if (!ALLOWED.test(part.mimetype)) throw bad('Bu turdagi faylni yuklab bo‘lmaydi');
    const f = (k: string) => { const v = (part.fields[k] as any)?.value; return typeof v === 'string' && v ? v : null; };
    const patientId = f('patient_id');
    const recordId = f('record_id');
    const commentId = f('comment_id');
    const kind = ['image', 'audio', 'xray', 'file'].includes(f('kind') ?? '') ? f('kind')! : part.mimetype.startsWith('image/') ? 'image' : part.mimetype.startsWith('audio/') ? 'audio' : 'file';
    const p = await one<any>(pool, 'select id from patients where id = $1 and org_id = $2', [patientId, m.org_id]);
    if (!p) throw bad('Bemor topilmadi');

    const ext = path.extname(part.filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
    const rel = path.join(m.org_id, `${crypto.randomUUID()}${ext}`);
    const abs = path.join(config.filesDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    await pipeline(part.file, fs.createWriteStream(abs));
    if (part.file.truncated) { fs.rmSync(abs, { force: true }); throw bad(`Fayl ${config.maxUploadMb} MB dan katta`); }
    const size = fs.statSync(abs).size;
    try {
      return await tx(m.user_id, async (c) => {
        if (recordId) {
          const r = await one(c, 'select 1 from treatment_records where id = $1 and patient_id = $2', [recordId, p.id]);
          if (!r) throw bad('Yozuv topilmadi');
        }
        if (commentId) {
          const k = await one(c, 'select 1 from record_comments where id = $1 and record_id = $2', [commentId, recordId]);
          if (!k) throw bad('Izoh topilmadi');
        }
        return one(c, `insert into record_files (org_id, record_id, comment_id, patient_id, kind, storage_path, name, mime, size_bytes, created_by)
                       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
          [m.org_id, recordId, commentId, p.id, kind, rel, part.filename?.slice(0, 200) ?? null, part.mimetype, size, m.user_id]);
      });
    } catch (e) { fs.rmSync(abs, { force: true }); throw e; }
  });

  // Tovar rasmi (Ombor → tovar oynasidan yuklanadi, "Material xarajat"da ko'rinadi).
  app.post<{ Params: { id: string } }>('/api/products/:id/image', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.admin')) throw forbidden();
    const prod = await one<any>(pool, 'select id, image_path from products where id = $1 and org_id = $2', [req.params.id, m.org_id]);
    if (!prod) throw notFound('Tovar topilmadi');
    const part = await req.file();
    if (!part) throw bad('Fayl yo‘q');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(part.mimetype)) throw bad('Faqat rasm (JPG, PNG, WEBP) yuklash mumkin');
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[part.mimetype] ?? '';
    const rel = path.join(m.org_id, 'products', `${crypto.randomUUID()}${ext}`);
    const abs = path.join(config.filesDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    await pipeline(part.file, fs.createWriteStream(abs));
    if (part.file.truncated) { fs.rmSync(abs, { force: true }); throw bad(`Fayl ${config.maxUploadMb} MB dan katta`); }
    try {
      await tx(m.user_id, (c) => c.query('update products set image_path = $2, image_mime = $3 where id = $1', [prod.id, rel, part.mimetype]));
    } catch (e) { fs.rmSync(abs, { force: true }); throw e; }
    if (prod.image_path) fs.rmSync(path.join(config.filesDir, prod.image_path), { force: true });
    return { ok: true, image_path: rel };
  });

  app.get<{ Params: { id: string } }>('/api/products/:id/image', async (req, reply) => {
    const m = requireMember(req);
    const prod = await one<any>(pool, 'select image_path, image_mime from products where id = $1 and org_id = $2', [req.params.id, m.org_id]);
    if (!prod?.image_path) throw notFound('Rasm yo‘q');
    const abs = path.join(config.filesDir, prod.image_path);
    if (!abs.startsWith(config.filesDir + path.sep) || !fs.existsSync(abs)) throw notFound('Rasm serverda topilmadi');
    reply.header('content-type', prod.image_mime || 'image/jpeg');
    reply.header('cache-control', 'private, max-age=86400');
    reply.header('x-content-type-options', 'nosniff');
    return reply.send(fs.createReadStream(abs));
  });

  app.delete<{ Params: { id: string } }>('/api/products/:id/image', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'warehouse.admin')) throw forbidden();
    const prod = await tx(m.user_id, (c) => one<any>(c, `update products p set image_path = null, image_mime = null from (select image_path old from products where id = $1 and org_id = $2) o
                                                           where p.id = $1 and p.org_id = $2 returning o.old`, [req.params.id, m.org_id]));
    if (!prod) throw notFound();
    if (prod.old) fs.rmSync(path.join(config.filesDir, prod.old), { force: true });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/files/:id', async (req, reply) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    const f = await one<any>(pool, 'select * from record_files where id = $1 and org_id = $2', [req.params.id, m.org_id]);
    if (!f) throw notFound();
    const abs = path.join(config.filesDir, f.storage_path);
    if (!abs.startsWith(config.filesDir + path.sep) || !fs.existsSync(abs)) throw notFound('Fayl serverda topilmadi');
    reply.header('content-type', f.mime || 'application/octet-stream');
    reply.header('cache-control', 'private, max-age=3600');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name || 'fayl')}`);
    return reply.send(fs.createReadStream(abs));
  });

  app.delete<{ Params: { id: string } }>('/api/files/:id', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.edit')) throw forbidden();
    const f = await tx(m.user_id, (c) => one<any>(c, 'delete from record_files where id = $1 and org_id = $2 returning storage_path', [req.params.id, m.org_id]));
    if (!f) throw notFound();
    fs.rmSync(path.join(config.filesDir, f.storage_path), { force: true });
    return { ok: true };
  });
}
