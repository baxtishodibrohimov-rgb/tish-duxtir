import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config } from './config.js';
import { registerAuth, COOKIE } from './auth.js';
import { registerCrud } from './crud.js';
import { warehouseRoutes } from './routes/warehouse.js';
import { clinicRoutes } from './routes/clinic.js';
import { staffRoutes } from './routes/staff.js';
import { fileRoutes } from './routes/files.js';
import { planRoutes } from './routes/plans.js';
import { reportRoutes } from './routes/reports.js';
import { workRoutes } from './routes/works.js';
import { HttpError, pgMessage } from './errors.js';
import { pool } from './db.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'warn', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  // Bo'sh tanali JSON so'rovlarga ham ruxsat (masalan POST /stock-docs/:id/post).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined) return done(null, {});
    try { done(null, JSON.parse(body as string)); } catch { done(new HttpError(400, 'JSON noto‘g‘ri'), undefined); }
  });

  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, cookie: { cookieName: COOKIE, signed: false } });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

  // CSRF himoyasi: o'zgartiruvchi so'rovlar faqat o'z saytimizdan (JSON yoki multipart).
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (req.url.startsWith('/api/telegram/')) return;
    const ct = req.headers['content-type'] ?? '';
    if (req.headers['x-requested-with'] !== 'tishduxtir' && !ct.startsWith('application/json')) {
      throw new HttpError(403, 'So‘rov rad etildi');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ error: err.issues[0]?.message ?? 'Noto‘g‘ri ma’lumot' });
    const pgm = pgMessage(err);
    if (pgm) return reply.status(pgm.status).send({ error: pgm.message });
    const status = (err as any).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: status === 429 ? 'Juda ko‘p urinish, birozdan keyin qayta urinib ko‘ring' : err.message });
    req.log.error(err);
    return reply.status(500).send({ error: 'Serverda xatolik yuz berdi' });
  });

  app.get('/api/health', async () => {
    await pool.query('select 1');
    return { ok: true };
  });

  await registerAuth(app);
  await registerCrud(app);
  await warehouseRoutes(app);
  await clinicRoutes(app);
  await staffRoutes(app);
  await fileRoutes(app);
  await planRoutes(app);
  await reportRoutes(app);
  await workRoutes(app);

  return app;
}
