const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfq = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });

/** 1 600 000 */
export const money = (n: number | null | undefined) => nf0.format(Math.round(Number(n) || 0));
/** 1 600 000 so‘m */
export const som = (n: number | null | undefined) => `${money(n)} so‘m`;
/** 1 600 000,00 */
export const money2 = (n: number | null | undefined) => nf2.format(Number(n) || 0);
/** Miqdor: 12,5 */
export const qty = (n: number | null | undefined) => nfq.format(Number(n) || 0);

export const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
export const WD_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];

export const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD (mahalliy vaqt bo'yicha) */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a: Date, b: Date) => isoDate(a) === isoDate(b);
/** 16.11.2026 */
export const dmy = (s: string | Date | null | undefined) => {
  if (!s) return '';
  const d = typeof s === 'string' ? new Date(s.length === 10 ? s + 'T00:00:00' : s) : s;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
export const hm = (s: string | Date) => { const d = typeof s === 'string' ? new Date(s) : s; return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dmyhm = (s: string) => `${dmy(s)} ${hm(s)}`;
/** 16-noyabr, Dushanba */
export const dayLabel = (d: Date) => `${d.getDate()}-${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export const phoneFmt = (p: string | null | undefined) => {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return p;
};

export const ageOf = (birth: string | null) => {
  if (!birth) return null;
  const b = new Date(birth), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
};

/** 9 xonali raqam -> +998(90)123-45-67 (kiritish niqobi) */
export const phoneMask = (d: string) => {
  if (!d) return '';
  let o = '+998(' + d.slice(0, 2);
  if (d.length > 2) o += ')' + d.slice(2, 5);
  if (d.length > 5) o += '-' + d.slice(5, 7);
  if (d.length > 7) o += '-' + d.slice(7, 9);
  return o;
};
/** Kiritilgan matndan 9 ta raqam (998 siz) */
export const phoneDigits = (s: string) => s.replace(/\D/g, '').replace(/^998/, '').slice(0, 9);
/** Saqlangan raqam -> +998(90)123-45-67 */
export const phoneShow = (p: string | null | undefined) => (p ? phoneMask(phoneDigits(p)) : '');
