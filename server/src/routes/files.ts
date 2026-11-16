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
        return one(c, `insert into record_files (org_id, record_id, patient_id, kind, storage_path, name, mime, size_bytes, created_by)
                       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
          [m.org_id, recordId, p.id, kind, rel, part.filename?.slice(0, 200) ?? null, part.mimetype, size, m.user_id]);
      });
    } catch (e) { fs.rmSync(abs, { force: true }); throw e; }
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
