import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { db } from '@/lib/api';
import { useList } from '@/lib/hooks';
import { phoneFmt } from '@/lib/format';
import type { Patient } from '@/lib/types';
import { cx } from './ui';

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Bemorni qidirib tanlash; topilmasa — shu joyning o'zida yangi bemor qo'shish. */
export function PatientPicker({ value, onChange, branchId, autoFocus }:
  { value: Patient | null; onChange: (p: Patient | null) => void; branchId?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ last_name: '', first_name: '', phone: '' });
  const ref = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim());
  const res = useList<Patient>('patients', { deleted_at: null }, { q: dq, limit: 8, enabled: open && dq.length >= 2 });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-[10px] border border-line bg-muted px-3 text-sm">
        <span className="truncate"><b className="font-medium">{value.full_name}</b> <span className="text-sub">№{value.card_number} {phoneFmt(value.phone)}</span></span>
        <button type="button" onClick={() => onChange(null)} className="text-[13px] text-primary hover:underline">O‘zgartirish</button>
      </div>
    );
  }

  if (creating) {
    const save = async () => {
      const p = await db.insert<Patient>('patients', { ...form, home_branch_id: branchId ?? null });
      onChange(p); setCreating(false);
    };
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
        <div className="grid grid-cols-2 gap-2">
          <input autoFocus className="h-9 rounded-[10px] border border-line bg-white px-3" placeholder="Familiya" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input className="h-9 rounded-[10px] border border-line bg-white px-3" placeholder="Ism" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </div>
        <input className="h-9 rounded-[10px] border border-line bg-white px-3" placeholder="Telefon: +998 90 123 45 67" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setCreating(false)} className="h-8 rounded-lg px-3 text-sm hover:bg-muted">Bekor qilish</button>
          <button type="button" disabled={!form.first_name.trim() && !form.last_name.trim()} onClick={() => void save()}
            className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-hover">Saqlash</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
      <input autoFocus={autoFocus} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Ism, telefon yoki karta raqami" aria-label="Bemorni qidirish"
        className="h-9 w-full rounded-[10px] border border-line bg-white pr-3 pl-9 text-sm outline-none focus:border-primary" />
      {open && (
        <div className="absolute top-10 right-0 left-0 z-50 overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          {dq.length < 2 && <div className="px-3 py-2.5 text-[13px] text-sub">Kamida 2 ta harf kiriting</div>}
          {(res.data ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => { onChange(p); setOpen(false); setQ(''); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
              <span className={cx('truncate font-medium', p.important_info && 'text-[#b91c1c]')}>{p.full_name || 'Ismsiz'}</span>
              <span className="shrink-0 text-xs text-sub">№{p.card_number} · {phoneFmt(p.phone)}</span>
            </button>
          ))}
          {dq.length >= 2 && res.data?.length === 0 && <div className="px-3 py-2.5 text-[13px] text-sub">Topilmadi</div>}
          <button type="button" onClick={() => {
            const parts = q.trim().split(/\s+/);
            const isPhone = /^[+\d\s()-]{5,}$/.test(q.trim());
            setForm(isPhone ? { last_name: '', first_name: '', phone: q.trim() } : { last_name: parts[0] ?? '', first_name: parts.slice(1).join(' '), phone: '' });
            setCreating(true); setOpen(false);
          }} className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-muted">
            <UserPlus size={15} /> Yangi bemor qo‘shish
          </button>
        </div>
      )}
    </div>
  );
}
