// Laboratoriya: umumiy turlar, holatlar va tish ranglari (Vita).
export type LabStatus = 'to_send' | 'at_lab' | 'remake' | 'ready' | 'delivered' | 'cancelled';
export type Impression = 'scan' | 'cast';

export interface LabOrder {
  id: string; org_id: string; branch_id: string; number: number; patient_id: string; act_id: string | null; price_item_id: string | null;
  work_name: string; tooth: string | null; qty: number; technician_id: string; responsible_id: string; doctor_id: string | null;
  shade: string | null; impression: Impression; due_date: string; status: LabStatus; tech_amount: number; note: string | null;
  sent_at: string | null; ready_at: string | null; delivered_at: string | null; checked_at: string | null; created_at: string; created_by: string | null;
  patient_name: string; card_number: string; patient_phone: string | null; technician_name: string; responsible_name: string | null; doctor_name: string | null;
  earned: number; act_total: number | null; act_paid: number | null; overdue: boolean;
}
export interface LabEvent { id: string; status: LabStatus | null; action: 'created' | 'status' | 'checked' | 'edit'; note: string | null; by_name: string | null; at: string }
export interface LabAlert {
  id: string; number: number; status: LabStatus; work_name: string; tooth: string | null; due_date: string; responsible_id: string; patient_id: string;
  patient_name: string; technician_name: string; responsible_name: string | null; kind: 'send' | 'soon' | 'overdue' | 'ready'; days_left: number; can_drive: boolean;
}
export interface TechRow { id: string; name: string; phone: string | null; archived: boolean; orders: number; active: number; planned: number; earned: number; paid: number }

/** Kanban tartibi (bekor qilinganlar alohida). */
export const LAB_FLOW: LabStatus[] = ['to_send', 'at_lab', 'remake', 'ready', 'delivered'];
export const LAB_ACTIVE: LabStatus[] = ['to_send', 'at_lab', 'remake', 'ready'];

export const LAB_STATUS: Record<LabStatus, { label: string; dot: string; tone: string }> = {
  to_send: { label: 'Jo‘natilishi kerak', dot: '#d97706', tone: 'bg-[#fef3c7] text-[#92400e]' },
  at_lab: { label: 'Labda', dot: '#0086b8', tone: 'bg-[#e0f2fe] text-[#075985]' },
  remake: { label: 'Qayta ishlash', dot: '#dc2626', tone: 'bg-[#fee2e2] text-[#b91c1c]' },
  ready: { label: 'Tayyor', dot: '#16a34a', tone: 'bg-[#dcfce7] text-[#166534]' },
  delivered: { label: 'Topshirildi', dot: '#64748b', tone: 'bg-[#f1f5f9] text-[#334155]' },
  cancelled: { label: 'Bekor qilingan', dot: '#94a3b8', tone: 'bg-[#f1f5f9] text-[#94a3b8] line-through' },
};

export const IMPRESSION: Record<Impression, string> = { scan: 'Skaner', cast: 'Oddiy qolip' };

/** Vita classical shkalasi va taxminiy ranglari (tugmalar foni uchun). */
export const SHADES: { key: string; bg: string }[] = [
  { key: 'A1', bg: '#f6efdf' }, { key: 'A2', bg: '#f0e4c8' }, { key: 'A3', bg: '#e9d8b4' }, { key: 'A3.5', bg: '#e1cba0' }, { key: 'A4', bg: '#d6bb8a' },
  { key: 'B1', bg: '#f7f2e2' }, { key: 'B2', bg: '#f2e8c6' }, { key: 'B3', bg: '#e9d9a8' }, { key: 'B4', bg: '#e0cc92' },
  { key: 'C1', bg: '#ece6d6' }, { key: 'C2', bg: '#e0d8c2' }, { key: 'C3', bg: '#d4cbb2' }, { key: 'C4', bg: '#c4b897' },
  { key: 'D2', bg: '#ede3d3' }, { key: 'D3', bg: '#e3d6c0' }, { key: 'D4', bg: '#d8c9ad' },
];

/** Muddatgacha qolgan kun matni. */
export function daysLeftText(due: string, today = new Date()) {
  const [y, m, d] = due.split('-').map(Number);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const n = Math.round((new Date(y!, m! - 1, d!).getTime() - t.getTime()) / 86400000);
  if (n === 0) return 'bugun';
  if (n === 1) return 'ertaga';
  return n > 0 ? `${n} kun qoldi` : `${-n} kun o‘tdi`;
}
