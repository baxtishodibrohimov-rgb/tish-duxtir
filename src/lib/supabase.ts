import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Supabase javobidan ma'lumotni oladi yoki o'zbekcha xato tashlaydi. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateError(res.error.message));
  return res.data as T;
}

export function translateError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'Email yoki parol noto‘g‘ri';
  if (/row-level security|permission denied/i.test(msg)) return 'Bu amal uchun ruxsatingiz yo‘q';
  if (/duplicate key/i.test(msg)) return 'Bunday yozuv allaqachon mavjud';
  if (/Failed to fetch/i.test(msg)) return 'Server bilan aloqa yo‘q';
  return msg;
}
