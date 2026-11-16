export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const forbidden = (m = 'Bu amal uchun ruxsatingiz yo‘q') => new HttpError(403, m);
export const notFound = (m = 'Topilmadi') => new HttpError(404, m);
export const bad = (m: string) => new HttpError(400, m);

/** Postgres xatolarini foydalanuvchiga tushunarli xabarga aylantiradi. */
export function pgMessage(e: any): { status: number; message: string } | null {
  if (!e || typeof e.code !== 'string') return null;
  switch (e.code) {
    case 'P0001': return { status: 400, message: e.message };            // raise exception (o'zbekcha matn)
    case '23505': return { status: 409, message: 'Bunday yozuv allaqachon mavjud' };
    case '23503': return { status: 400, message: 'Bog‘liq yozuv topilmadi yoki bu yozuv boshqa joyda ishlatilgan' };
    case '23514': return { status: 400, message: 'Qiymat noto‘g‘ri' };
    case '23502': return { status: 400, message: `Majburiy maydon to‘ldirilmagan: ${e.column ?? ''}` };
    case '22P02': return { status: 400, message: 'Qiymat formati noto‘g‘ri' };
    default: return null;
  }
}
