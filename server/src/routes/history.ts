// Davolash tarixi: kartalar (bosqichlar), ulardagi izohlar, stikerlar va rasmlar.
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { tx, one, many } from '../db.js';
import { requireMember } from '../auth.js';
import { can } from '../perms.js';
import { config } from '../config.js';
import { bad, forbidden, notFound } from '../errors.js';

const Comment = z.object({
  text: z.string().max(5000).nullable().optional(),
  sticker: z.string().max(16).nullable().optional(),
  files: z.boolean().optional(), // faqat rasmli izoh: rasmlar keyin yuklanadi
});

export async function historyRoutes(app: FastifyInstance) {
  // Bemorning butun tarixi bitta so'rovda.
  app.get<{ Params: { id: string } }>('/api/patients/:id/history', async (req) => {
    const m = requireMember(req);
    if (!can(m, 'patients.view')) throw forbidden();
    return tx(m.user_id, (c) => many(c, `
      select r.id, r.title, r.diagnosis, r.description, r.tooth, r.doctor_id, r.branch_id, r.created_at, r.act_id,
             a.status act_status,
             coalesce((select json_agg(json_build_object('name', p.name, 'unit', p.unit, 'qty', l.qty) order by l.position)
                         from stock_docs d join stock_doc_lines l on l.doc_id = d.id join products p on p.id = l.product_id
                        where r.act_id is not null and d.act_id = r.act_id and d.status = 'posted' and d.reversal_of is null), '[]') mats,
             coalesce((select json_agg(json_build_object('id', f.id, 'kind', f.kind, 'name', f.name) order by f.created_at)
                         from record_files f where f.record_id = r.id and f.comment_id is null), '[]') files,
             coalesce((select json_agg(json_build_object('id', k.id, 'author_id', k.author_id, 'text', k.text, 'sticker', k.sticker,
                                                         'created_at', k.created_at, 'edited_at', k.edited_at,
                                                         'files', coalesce((select json_agg(json_build_object('id', f.id, 'kind', f.kind, 'name', f.name) order by f.created_at)
                                                                              from record_files f where f.comment_id = k.id), '[]')) order by k.created_at)
                         from record_comments k where k.record_id = r.id), '[]') comments
        from treatment_records r left join acts a on a.id = r.act_id
       where r.patient_id = $1 and r.org_id = $2
       order by r.created_at desc`, [req.params.id, m.org_id]));
  });

  app.post<{ Params: { id: string } }>('/api/records/:id/comments', async (req) => {
    const m = requireMember(req);
    const b = Comment.parse(req.body);
    if (!b.text?.trim() && !b.sticker && !b.files) throw bad('Izoh, stiker yoki rasm qo‘shing');
    return tx(m.user_id, async (c) => {
      const r = await one<any>(c, 'select id, branch_id from treatment_records where id = $1 and org_id = $2', [req.params.id, m.org_id]);
      if (!r) throw notFound('Yozuv topilmadi');
      if (!can(m, 'patients.edit')) throw forbidden();
      return one(c, `insert into record_comments (org_id, record_id, author_id, text, sticker) values ($1, $2, $3, $4, $5) returning *`,
        [m.org_id, r.id, m.user_id, b.text?.trim() || null, b.sticker || null]);
    });
  });

  // Izohni faqat muallifi yoki rahbar o'zgartiradi/o'chiradi.
  const own = async (c: any, m: ReturnType<typeof requireMember>, id: string) => {
    const k = await one<any>(c, 'select * from record_comments where id = $1 and org_id = $2', [id, m.org_id]);
    if (!k) throw notFound('Izoh topilmadi');
    if (k.author_id !== m.user_id && m.role !== 'owner') throw forbidden();
    return k;
  };
  app.patch<{ Params: { id: string } }>('/api/comments/:id', async (req) => {
    const m = requireMember(req);
    const b = Comment.parse(req.body);
    return tx(m.user_id, async (c) => {
      const k = await own(c, m, req.params.id);
      return one(c, 'update record_comments set text = $2, sticker = $3, edited_at = now() where id = $1 returning *',
        [k.id, b.text === undefined ? k.text : b.text?.trim() || null, b.sticker === undefined ? k.sticker : b.sticker || null]);
    });
  });
  app.delete<{ Params: { id: string } }>('/api/comments/:id', async (req) => {
    const m = requireMember(req);
    const paths = await tx(m.user_id, async (c) => {
      const k = await own(c, m, req.params.id);
      const fs_ = await many<any>(c, 'select storage_path from record_files where comment_id = $1', [k.id]);
      await c.query('delete from record_comments where id = $1', [k.id]);
      return fs_.map((f) => f.storage_path as string);
    });
    for (const p of paths) fs.rmSync(path.join(config.filesDir, p), { force: true });
    return { ok: true };
  });
}
