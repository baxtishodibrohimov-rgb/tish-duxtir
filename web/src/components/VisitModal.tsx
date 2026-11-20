import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { addDays, dmy, dmyhm, hm, initials, isoDate, money, pad, parseDate, phoneDigits } from '@/lib/format';
import { Link } from '@/lib/router';
import { MOODS, VISIT_STATUS, WD_LOWER } from '@/lib/visit';
import type { Branch, Patient, PriceItem, Room, Visit, VisitItem, VisitStatus } from '@/lib/types';
import { MiniCalendar } from './MiniCalendar';
import { QuickPatientModal } from './QuickPatientModal';
import { Button, Confirm, LRow, cx } from './ui';

const CHIPS = [5, 10, 15, 20, 30, 40, 45, 60, 90, 120, 150, 180];
const FIELD = 'h-[42px] w-full rounded border border-line bg-white px-3 text-[15px] outline-none focus:border-primary';

export interface VisitInit { date: Date; min: number; room: string | null; patient?: Patient | null; doctor?: string; comment?: string }

/** Balans yorlig'i: qarz qizil, avans yashil. */
export function balanceInfo(b: { billed: number; paid: number } | undefined) {
  const n = b ? b.paid - b.billed : 0;
  return { n, label: n < 0 ? `Qarz: ${money(-n)}` : n > 0 ? `Avans: ${money(n)}` : 'Balans: 0', color: n < 0 ? '#dc2626' : n > 0 ? '#15803d' : '#5b646f' };
}

export function usePatientBalances(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['patients', 'balances', key], enabled: key.length > 0,
    queryFn: async () => new Map((await http.post<{ patient_id: string; billed: number; paid: number }[]>('/api/patients/balances', { ids: key })).map((r) => [r.patient_id, r])),
  });
}

/** Qabul oynasi (yangi yoki tahrirlash). Maketdagi "Yangi qabul" oynasi. */
export function VisitModal({ branch, rooms, visit, patient: initPatient, init, onClose, onCopy, onSaved }: {
  branch: Branch; rooms: Room[]; visit?: Visit; patient?: Patient | null; init?: VisitInit;
  onClose: () => void; onCopy?: (v: Visit) => void; onSaved?: (v: Visit) => void;
}) {
  const { members, me, can, memberName } = useOrg();
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role) && (m.all_branches || m.role === 'owner' || m.branch_ids.includes(branch.id)));
  const s0 = visit ? new Date(visit.starts_at) : new Date(init!.date.getFullYear(), init!.date.getMonth(), init!.date.getDate(), 0, init!.min);
  const [patient, setPatient] = useState<Patient | null>(initPatient ?? init?.patient ?? null);
  const [q, setQ] = useState('');
  const [newPat, setNewPat] = useState(false);
  const [date, setDate] = useState(isoDate(s0));
  const [from, setFrom] = useState(s0.getHours() * 60 + s0.getMinutes());
  const [to, setTo] = useState(visit ? (() => { const e = new Date(visit.ends_at); return e.getHours() * 60 + e.getMinutes(); })() : s0.getHours() * 60 + s0.getMinutes() + 60);
  const [doctor, setDoctor] = useState(visit?.doctor_id ?? init?.doctor ?? (doctors.some((d) => d.user_id === me.user_id) ? me.user_id : doctors[0]?.user_id ?? ''));
  const [room, setRoom] = useState(visit?.room_id ?? init?.room ?? rooms[0]?.id ?? '');
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? 'planned');
  const [mood, setMood] = useState(visit?.mood ?? '');
  const [comment, setComment] = useState(visit?.comment ?? init?.comment ?? '');
  const [manips, setManips] = useState<{ price_item_id: string | null; name: string; price: number }[] | null>(visit ? null : []);
  const [menu, setMenu] = useState<'mood' | 'status' | 'cal' | null>(null);
  const [manOpen, setManOpen] = useState(false);
  const [force, setForce] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const canEdit = can('schedule.edit', branch.id);

  const sug = useList<Patient>('patients', { deleted_at: null }, { q: q.trim(), limit: 6, enabled: !patient && q.trim().length >= 2 });
  const bal = usePatientBalances([patient?.id ?? '', ...(sug.data ?? []).map((p) => p.id)].filter(Boolean));
  const items = useList<VisitItem>('visit_items', { visit_id: visit?.id ?? '' }, { enabled: !!visit });
  const price = useList<PriceItem>('price_items', { archived: false }, { enabled: manOpen });
  useEffect(() => { if (manips === null && items.data) setManips(items.data.map((i) => ({ price_item_id: i.price_item_id, name: i.name, price: i.price }))); }, [items.data, manips]);

  const day = parseDate(date);
  const dayVisits = useList<Visit>('visits', { branch_id: branch.id, 'starts_at.gte': day.toISOString(), 'starts_at.lt': addDays(day, 1).toISOString() });
  const dur = to - from;
  const durLabel = dur >= 60 ? `${Math.floor(dur / 60)} soat${dur % 60 ? ` ${dur % 60} daq` : ''}` : `${dur} daq`;
  const warns = useMemo(() => {
    const out: string[] = [];
    if (dur <= 0) out.push('Tugash vaqti boshlanishdan keyin bo‘lishi kerak.');
    for (const o of dayVisits.data ?? []) {
      if (o.id === visit?.id || ['cancelled', 'no_show', 'moved'].includes(o.status)) continue;
      const s = new Date(o.starts_at), e = new Date(o.ends_at);
      const os = s.getHours() * 60 + s.getMinutes(), oe = e.getHours() * 60 + e.getMinutes();
      if (!(from < oe && to > os)) continue;
      const rn = rooms.find((r) => r.id === o.room_id)?.name ?? 'kabinet';
      if (doctor && o.doctor_id === doctor) out.push(`${memberName(doctor)} shu vaqtda ${rn}da band (${hm(s)} – ${hm(e)}).`);
      else if (room && o.room_id === room) out.push(`${rn} shu vaqtda band (${hm(s)} – ${hm(e)}).`);
    }
    return out;
  }, [dayVisits.data, from, to, doctor, room, dur, visit?.id, rooms, memberName]);
  const saveDis = !patient || dur <= 0 || (warns.length > 0 && !force);

  const save = useAction(async () => {
    const st = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, from);
    const row = {
      branch_id: branch.id, patient_id: patient!.id, doctor_id: doctor || null, room_id: room || null, status, mood: mood || null, comment,
      starts_at: st.toISOString(), ends_at: new Date(+st + dur * 60000).toISOString(),
    };
    const v = visit ? await db.update<Visit>('visits', visit.id, row) : await db.insert<Visit>('visits', row);
    if (manips && (visit || manips.length)) {
      for (const i of items.data ?? []) await db.remove('visit_items', i.id);
      if (manips.length) await db.insertMany('visit_items', manips.map((m) => ({ ...m, visit_id: v.id })));
    }
    return v;
  }, { invalidate: ['visits', 'visit_items'], success: visit ? 'Saqlandi' : 'Bemor yozildi', onDone: (v) => { onSaved?.(v); onClose(); } });
  const del = useAction(() => db.remove('visits', visit!.id), { invalidate: ['visits'], success: 'O‘chirildi', onDone: onClose });

  const pb = balanceInfo(patient ? bal.data?.get(patient.id) : undefined);
  const docColor = members.find((m) => m.user_id === doctor)?.color ?? '#94a3b8';
  const dayOpts = useMemo(() => {
    const base = parseDate(isoDate(new Date()));
    const set = new Set<string>([date]);
    for (let i = -1; i < 14; i++) set.add(isoDate(addDays(base, i)));
    return [...set].sort();
  }, [date]);
  const stepper = (val: number, set: (n: number) => void, label: string) => (
    <span className="grid grid-cols-[34px_10px_34px] items-center justify-items-center gap-y-0.5 text-fg">
      <button type="button" onClick={() => set(val + 60)} aria-label={`${label}: soatni oshirish`} className="h-[18px] w-[34px] text-xs text-faint">︿</button><span />
      <button type="button" onClick={() => set(val + 5)} aria-label={`${label}: daqiqani oshirish`} className="h-[18px] w-[34px] text-xs text-faint">︿</button>
      <span className="w-[34px] text-center text-[15px] tabular-nums">{pad(Math.floor(val / 60))}</span><span>:</span><span className="w-[34px] text-center text-[15px] tabular-nums">{pad(val % 60)}</span>
      <button type="button" onClick={() => set(val - 60)} aria-label={`${label}: soatni kamaytirish`} className="h-[18px] w-[34px] text-xs text-faint">﹀</button><span />
      <button type="button" onClick={() => set(val - 5)} aria-label={`${label}: daqiqani kamaytirish`} className="h-[18px] w-[34px] text-xs text-faint">﹀</button>
    </span>
  );
  const clampSet = (fn: (n: number) => void) => (n: number) => fn(Math.max(0, Math.min(24 * 60 - 5, n)));
  const setFromKeep = clampSet((n) => { setTo(n + dur); setFrom(n); });

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[rgba(7,18,30,.45)] p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="vmT" className="max-h-[calc(100vh-32px)] w-[690px] max-w-full overflow-y-auto rounded-md bg-white text-sm shadow-[0_24px_48px_-12px_rgba(7,18,30,.35)]">
        <div className="flex items-center gap-3.5 border-b border-line py-4 pr-5 pl-7">
          <CalendarPlus size={24} className="text-primary" />
          <h2 id="vmT" className="m-0 flex-1 text-xl font-medium">{visit ? 'Qabul' : 'Yangi qabul'}</h2>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'mood' ? null : 'mood')} aria-label="Bemor belgisi" title="Bemor belgisi (kartochkada ko‘rinadi)"
              className="h-9 w-9 rounded-full border-[1.5px] border-sub bg-white text-lg leading-none">{mood || '🙂'}</button>
            {menu === 'mood' && (
              <div role="menu" className="absolute top-[42px] right-0 z-10 flex gap-0.5 rounded-[10px] border border-line bg-white p-1.5 shadow-pop">
                {MOODS.map(([e, t]) => <button key={e} type="button" role="menuitem" title={t} onClick={() => { setMood(e === '🙂' ? '' : e); setMenu(null); }} className="h-8 w-8 rounded-lg text-lg hover:bg-muted">{e}</button>)}
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'status' ? null : 'status')} aria-haspopup="listbox" style={{ background: VISIT_STATUS[status].color }}
              className="inline-flex h-10 items-center gap-2.5 rounded-[3px] px-3.5 text-[15px] text-white">{VISIT_STATUS[status].label} <span className="text-[10px]">▼</span></button>
            {menu === 'status' && (
              <div role="listbox" className="absolute top-[46px] right-0 z-10 w-[210px] rounded-lg border border-line bg-white p-1 shadow-pop">
                {(Object.keys(VISIT_STATUS) as VisitStatus[]).map((k) => (
                  <button key={k} type="button" role="option" aria-selected={k === status} onClick={() => { setStatus(k); setMenu(null); }}
                    className={cx('flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-muted', k === status && 'bg-muted')}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: VISIT_STATUS[k].color }} />{VISIT_STATUS[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[18px] px-5 pt-5 pb-6">
          <LRow label="Bemor" req htmlFor="vmPat" top>
            {!patient ? (
              <div className="relative flex">
                <input id="vmPat" autoFocus autoComplete="off" placeholder="Ism, telefon yoki karta raqami" value={q} onChange={(e) => setQ(e.target.value)}
                  className="h-[42px] min-w-0 flex-1 rounded-l border border-r-0 border-line px-3 text-[15px] outline-none focus:border-primary" />
                <button type="button" onClick={() => setNewPat(true)} aria-label="Yangi bemor" title="Yangi bemor kartasi" className="h-[42px] w-[42px] rounded-r bg-primary text-lg text-white">+</button>
                {q.trim().length >= 2 && (sug.data?.length ?? 0) > 0 && (
                  <div role="listbox" className="absolute top-11 right-[42px] left-0 z-10 rounded-md border border-line bg-white p-1 shadow-pop">
                    {sug.data!.map((p) => {
                      const b = balanceInfo(bal.data?.get(p.id));
                      return (
                        <button key={p.id} type="button" role="option" onClick={() => { setPatient(p); setQ(''); }}
                          className="flex h-[34px] w-full items-center justify-between rounded px-2.5 text-left text-sm hover:bg-muted">
                          <span style={{ color: b.n ? b.color : undefined }}>{p.full_name || 'Ismsiz'}</span><span className="text-sub">№{p.card_number}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[42px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded border border-line bg-surface px-3 py-1.5">
                <span className="text-[15px] font-medium" style={{ color: pb.n ? pb.color : undefined }}>{patient.full_name}</span>
                <span className="text-xs text-sub">№ {patient.card_number}</span>
                <span className="text-[13px] font-semibold" style={{ color: pb.color }}>{pb.label}</span>
                {!visit ? <button type="button" onClick={() => setPatient(null)} className="ml-auto text-[13px] text-primary">O‘zgartirish</button> : <>
                  <Link to={`/patients/${patient.id}`} className="ml-auto text-[13px]">Bemor kartasi →</Link>
                  {patient.phone && <a href={`tel:+${phoneDigits(patient.phone) ? '998' + phoneDigits(patient.phone) : ''}`} aria-label="Qo‘ng‘iroq qilish" title="Qo‘ng‘iroq qilish"
                    className="grid h-[30px] w-[34px] place-items-center rounded bg-primary !text-white no-underline">✆</a>}
                </>}
              </div>
            )}
            {patient?.important_info && <div className="mt-1.5 text-[13px] font-medium text-[#dc2626]">⚠ {patient.important_info}</div>}
          </LRow>
          <LRow label="Mutaxassis" req htmlFor="vmDoc">
            <div className="relative">
              <span className="pointer-events-none absolute top-[7px] left-2 grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: docColor }}>{initials(memberName(doctor))}</span>
              <select id="vmDoc" value={doctor} onChange={(e) => setDoctor(e.target.value)} className={cx(FIELD, 'pl-[52px]')}>
                <option value="">—</option>
                {doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
              </select>
            </div>
          </LRow>
          <LRow label="Kabinet" req htmlFor="vmRoom">
            <select id="vmRoom" value={room} onChange={(e) => setRoom(e.target.value)} className={FIELD}>
              <option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </LRow>
          <LRow label="Qabul sanasi" req htmlFor="vmDay">
            <div className="relative flex">
              <select id="vmDay" value={date} onChange={(e) => setDate(e.target.value)} className={cx(FIELD, '!w-[260px] rounded-r-none')}>
                {dayOpts.map((d) => <option key={d} value={d}>{dmy(d)} — {WD_LOWER[parseDate(d).getDay()]}</option>)}
              </select>
              <button type="button" onClick={() => setMenu(menu === 'cal' ? null : 'cal')} aria-label="Kalendarni ochish" aria-expanded={menu === 'cal'}
                className="grid h-[42px] w-12 place-items-center rounded-r border border-l-0 border-line bg-muted"><CalendarDays size={18} className="text-sub" /></button>
              {menu === 'cal' && <div className="absolute top-[46px] left-0 z-10"><MiniCalendar value={day} onPick={(d) => { setDate(isoDate(d)); setMenu(null); }} /></div>}
            </div>
          </LRow>
          <LRow label="Vaqt" req top>
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-sub">
                <span className="w-[22px] text-center text-faint">dan</span>
                {stepper(from, setFromKeep, 'Boshlanish')}
                <span className="w-12 text-center text-faint">gacha</span>
                {stepper(to, clampSet(setTo), 'Tugash')}
                <span className="ml-[18px] text-faint">{durLabel}</span>
              </div>
              <div role="group" aria-label="Davomiylik, daqiqa" className="flex flex-wrap gap-1">
                {CHIPS.map((m) => (
                  <button key={m} type="button" aria-pressed={dur === m} onClick={() => setTo(from + m)}
                    className={cx('h-6 min-w-[34px] rounded-[3px] px-1.5 text-[13px]', dur === m ? 'bg-[#c9d2d9] font-semibold text-white' : 'text-[#3d4858] hover:bg-muted')}>{m}</button>
                ))}
              </div>
            </div>
          </LRow>
          <LRow label="Izoh" htmlFor="vmCom" top>
            <textarea id="vmCom" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className="w-full resize-y rounded border border-line px-3 py-2 text-[15px] outline-none focus:border-primary" />
          </LRow>
          <LRow label="Manipulyatsiyalar" top>
            <div className="flex flex-col gap-1.5 pt-[9px]">
              {(manips ?? []).map((x, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{x.name}</span><span className="text-sub">{money(x.price)}</span>
                  <button type="button" onClick={() => setManips(manips!.filter((_, j) => j !== i))} aria-label="Olib tashlash" className="text-faint hover:text-bad">×</button>
                </div>
              ))}
              {manOpen && (
                <select aria-label="Manipulyatsiya" value="" className={FIELD} onChange={(e) => {
                  const it = price.data?.find((p) => p.id === e.target.value);
                  if (it) setManips([...(manips ?? []), { price_item_id: it.id, name: it.name, price: it.price }]);
                  setManOpen(false);
                }}>
                  <option value="">Praysdan tanlang…</option>
                  {(price.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
                </select>
              )}
              <button type="button" onClick={() => setManOpen(!manOpen)} className="self-start text-[15px] text-primary">Manipulyatsiya qo‘shish</button>
              {(manips?.length ?? 0) > 0 && <span className="text-xs text-sub">Jami: {money(manips!.reduce((a, x) => a + x.price, 0))} so‘m</span>}
            </div>
          </LRow>
          {visit && <div className="text-xs text-sub sm:ml-[186px]">Yaratildi: {dmyhm(visit.created_at)} · {memberName(visit.created_by)}</div>}
          {warns.map((w) => <div key={w} role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn sm:ml-[186px]">⚠ {w}</div>)}
          {warns.length > 0 && dur > 0 && (
            <label className="flex items-center gap-2 text-sm sm:ml-[186px]"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />Baribir saqlash</label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 pt-[18px] pb-5">
          <Button onClick={onClose}>Bekor qilish</Button>
          {visit && canEdit && <>
            {onCopy && <Button title="Nusxalab, jadvalda o‘ng tugma → «Qo‘yish»" onClick={() => { onCopy(visit); onClose(); }}>Nusxalash</Button>}
            <Button variant="danger" aria-label="Qabulni o‘chirish" title="O‘chirish" onClick={() => setAskDel(true)}>🗑</Button>
          </>}
          <span className="flex-1" />
          {canEdit && <Button variant="primary" disabled={saveDis} loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button>}
        </div>
      </div>
      {newPat && <QuickPatientModal branchId={branch.id} init={guessName(q)} onClose={() => setNewPat(false)} onSaved={(p) => { setPatient(p); setNewPat(false); }} />}
      <Confirm open={askDel} danger yes="O‘chirish" text="Qabulni o‘chirasizmi? Agar bemor kelmagan bo‘lsa, holatini «Kelmadi» qilib qo‘yish yaxshiroq."
        onNo={() => setAskDel(false)} onYes={() => del.mutate(undefined)} loading={del.isPending} />
    </div>
  );
}

function guessName(q: string) {
  const t = q.trim();
  if (/^[+\d\s()-]{5,}$/.test(t)) return { phone: t };
  const p = t.split(/\s+/);
  return { last: p[0] ?? '', first: p.slice(1).join(' ') };
}

/** Ref'ni hujjatdagi bosishdan tashqari yopish uchun. */
export function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open, close]);
  return ref;
}
