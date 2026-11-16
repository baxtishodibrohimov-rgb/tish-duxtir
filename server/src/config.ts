import path from 'node:path';

function need(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Muhit o'zgaruvchisi yo'q: ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: need('DATABASE_URL', isProd ? undefined : 'postgres://postgres@localhost:5432/tishduxtir'),
  // Ishlab chiqarishda albatta uzun tasodifiy qiymat bo'lishi kerak.
  jwtSecret: need('JWT_SECRET', isProd ? undefined : 'dev-secret-faqat-mahalliy-uchun-dev-secret'),
  cookieSecure: (process.env.COOKIE_SECURE ?? (isProd ? 'true' : 'false')) === 'true',
  filesDir: path.resolve(process.env.FILES_DIR ?? './data/files'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
};

if (isProd && config.jwtSecret.length < 32) throw new Error('JWT_SECRET kamida 32 belgi bo‘lishi kerak');
