import type { VisitStatus } from './types';

/** Qabul holatlari: nomi va rangi (jadval, bemor kartasi). */
export const VISIT_STATUS: Record<VisitStatus, { label: string; color: string }> = {
  planned: { label: 'Rejalashtirilgan', color: '#0ea5e9' },
  confirmed: { label: 'Tasdiqlangan', color: '#10b981' },
  arrived: { label: 'Kelgan', color: '#f59e0b' },
  completed: { label: 'Bajarildi', color: '#64748b' },
  no_show: { label: 'Kelmadi', color: '#ef4444' },
  moved: { label: 'Ko‘chirildi', color: '#a855f7' },
  cancelled: { label: 'Bekor qilindi', color: '#cbd5e1' },
  booked: { label: 'Bron (onlayn)', color: '#06b6d4' },
};

/** Tugagan (jadvalda shaffof ko'rinadigan) holatlar. */
export const DEAD_STATUS: VisitStatus[] = ['completed', 'no_show', 'moved', 'cancelled'];

/** Bemor belgilari (qabul kartochkasida ko'rinadi). */
export const MOODS: [string, string][] = [
  ['🙂', 'Belgisiz'], ['💬', 'Qo‘ng‘iroq qilish kerak'], ['🍎', 'Birinchi tashrif'], ['🔔', 'Eslatma bor'], ['💎', 'VIP bemor'], ['☂️', 'Sug‘urta'],
];

export const WD_LOWER = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

/** Bemor belgisi uchun to'liq to'plam (qabul oynasidagi belgilar panjarasi). */
export const MOOD_GRID: string[] = ["🙂", "😀", "😁", "😊", "😐", "😕", "😢", "😡", "😷", "🤒", "😎", "🤔", "😴", "😬", "🥰", "😇", "🦷", "👄", "👅", "💉", "💊", "🩺", "🩹", "🩻", "🔬", "🪥", "🧪", "✂️", "🔧", "🔨", "👶", "🧒", "👦", "👧", "👨", "👩", "👴", "👵", "👨‍👩‍👧", "🤰", "❤️", "💔", "⭐", "👑", "💎", "💰", "💳", "💵", "🎁", "🎂", "🍎", "🍏", "☕", "🔔", "⚠️", "❗", "❓", "⛔", "✅", "🔑", "🔒", "🔗", "📷", "📞", "📝", "📋", "📅", "⏰", "🌐", "💬", "💭", "💡", "🌈", "☂️", "🌻", "🏁", "⚙️", "🚗", "🅿️", "✈️", "🎓", "🏆", "🔥", "⚡"];
