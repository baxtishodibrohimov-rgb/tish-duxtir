import { useEffect, useMemo, useState, type MouseEvent as RMouseEvent } from 'react';
import { ChevronLeft, ChevronRight, Settings as Gear, Stethoscope, Users, UserCog, Printer, SlidersHorizontal, CalendarDays } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { useAction, useList, byId } from '@/lib/hooks';
import { db, http } from '@/lib/api';
import { addDays, ageOf, dmy, hm, initials, isoDate, money, pad, phoneShow, sameDay } from '@/lib/format';
import { Link, navigate, useLocation, useTitle } from '@/lib/router';
import { DEAD_STATUS, MOODS, VISIT_STATUS, WD_LOWER } from '@/lib/visit';
import type { Act, Cashbox, Member, Patient, PriceItem, Room, Visit, VisitStatus, WaitItem } from '@/lib/types';
import { MiniCalendar } from '@/components/MiniCalendar';
import { VisitModal, balanceInfo, usePatientBalances, useClickAway, type VisitInit } from '@/components/VisitModal';
import { Button, Toggle, cx } from '@/components/ui';

export { VISIT_STATUS } from '@/lib/visit';

type Tab = 'doctor' | 'assistant' | 'admin';
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'doctor', label: 'Shifokorlar va bemorlar', icon: Stethoscope },
  { key: 'assistant', label: 'Assistentlar', icon: Users },
  { key: 'admin', label: 'Administratorlar va b.', icon: UserCog },
];
const SHIFT_ROLES: Record<Tab, Member['role'][]> = { doctor: [], assistant: ['assistant'], admin: ['admin', 'curator', 'storekeeper', 'owner'] };

interface Shift { id: string; member_id: string; room_id: string | null; shift_date: string; starts_at: string; ends_at: string }
interface Reservation { id: string; room_id: string | null; starts_at: string; ends_at: string; reason: string; color: string }

/** Jadval ko'rinishi sozlamalari (har bir foydalanuvchi brauzerida saqlanadi). */
interface View {
  tab: Tab; hiddenRooms: string[]; doc: string; only: boolean; days: number; scale: 'full' | 'fit';
  docColor: boolean; transparent: boolean; shrink: boolean; green: boolean;
}
const VIEW0: Omit<View, 'days'> = { tab: 'doctor', hiddenRooms: [], doc: '', only: false, scale: 'full', docColor: true, transparent: true, shrink: true, green: true };
const VKEY = 'td-schedule-view';
function readView(days: number): View {
  try { return { ...VIEW0, days, ...JSON.parse(localStorage.getItem(VKEY) ?? '{}') }; } catch { return { ...VIEW0, days }; }
}

const PX30 = 40;                         // 30 daqiqa = 40px (maket)
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h! * 60 + m!; };
const minOf = (iso: string | Date) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const fmtMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const dayLabel = (d: Date) => `${WD_LOWER[d.getDay()]}, ${d.getDate()}-${['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'][d.getMonth()]}`;

export function Schedule() {
  useTitle('Jadval');
  const { branch, members, can } = useOrg();
  const { search } = useLocation();
  const [start, setStart] = useState(() => new Date());
  const [view, setViewState] = useState<View>(() => readView(branch.days_visible));
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VKEY, JSON.stringify(v)); } catch { /* */ } };
  const [solo, setSolo] = useState<string | null>(null);
  const [calFor, setCalFor] = useState<number | null>(null);
  const [gear, setGear] = useState(false);
  const [vm, setVm] = useState<{ visit?: Visit; init?: VisitInit; waitId?: string } | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ date: Date; min: number; room: string | null; x: number; y: number } | null>(null);
  const [clip, setClip] = useState<Visit | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const days = useMemo(() => Array.from({ length: view.days }, (_, i) => addDays(start, i)), [start, view.days]);
  const from = new Date(days[0]!.getFullYear(), days[0]!.getMonth(), days[0]!.getDate()).toISOString();
  const to = new Date(days[days.length - 1]!.getFullYear(), days[days.length - 1]!.getMonth(), days[days.length - 1]!.getDate() + 1).toISOString();

  const rooms = useList<Room>('rooms', { branch_id: branch.id, is_active: true });
  const visits = useList<Visit>('visits', { branch_id: branch.id, 'starts_at.gte': from, 'starts_at.lt': to });
  const reservations = useList<Reservation>('time_reservations', { branch_id: branch.id, 'starts_at.gte': from, 'starts_at.lt': to });
  const shifts = useList<Shift>('staff_shifts', { branch_id: branch.id, 'shift_date.gte': isoDate(days[0]!), 'shift_date.lte': isoDate(days[days.length - 1]!) }, { enabled: view.tab !== 'doctor' });
  const patientIds = [...new Set((visits.data ?? []).map((v) => v.patient_id))];
  const patients = useList<Patient>('patients', { 'id.in': patientIds }, { enabled: patientIds.length > 0 });
  const balances = usePatientBalances(patientIds);
  const pmap = byId(patients.data);
  const mByUser = new Map(members.map((m) => [m.user_id, m]));
  const mById = byId(members);

  // Kutish navbatidan "Qabulga yozish"
  const waitId = search.get('wait');
  const wait = useList<WaitItem>('waiting_list', { id: waitId ?? '' }, { enabled: !!waitId });
  useEffect(() => {
    const w = wait.data?.[0];
    if (!waitId || !w) return;
    const n = new Date();
    setVm({ waitId: w.id, init: { date: n, min: Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15, room: null, doctor: w.doctor_id ?? undefined, comment: w.comment ?? '' } });
    navigate('/', true);
  }, [wait.data, waitId]);
  const dropWait = useAction((id: string) => db.remove('waiting_list', id), { invalidate: ['waiting_list'] });

  const allRooms = rooms.data ?? [];
  const shownRooms = solo ? allRooms.filter((r) => r.id === solo) : allRooms.filter((r) => !view.hiddenRooms.includes(r.id));
  const cols: (Room | null)[] = shownRooms.length ? shownRooms : [null];
  const startMin = toMin(branch.work_start), endMin = toMin(branch.work_end);
  const slots = Array.from({ length: Math.ceil((endMin - startMin) / 30) }, (_, i) => startMin + i * 30);
  const fitPx = Math.max(20, (window.innerHeight - 140) / slots.length);
  const slotH = view.scale === 'fit' ? fitPx : PX30;
  const px = (min: number) => ((min - startMin) / 30) * slotH;
  const canEdit = can('schedule.edit', branch.id);
  const effDoc = view.only && view.doc ? view.doc : '';
  const showVisits = view.tab === 'doctor';

  const slotFrom = (e: RMouseEvent<HTMLDivElement>) => Math.min(endMin - 30, startMin + Math.floor(e.nativeEvent.offsetY / slotH) * 30);
  const paste = useAction(async ({ date, min, room }: { date: Date; min: number; room: string | null }) => {
    const c = clip!; const d = +new Date(c.ends_at) - +new Date(c.starts_at);
    const st = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, min);
    return db.insert('visits', { branch_id: branch.id, patient_id: c.patient_id, doctor_id: c.doctor_id, room_id: room, status: 'planned', comment: c.comment, mood: c.mood,
      starts_at: st.toISOString(), ends_at: new Date(+st + d).toISOString() });
  }, { invalidate: ['visits'], success: 'Qabul qo‘yildi', onDone: () => setCtx(null) });
  const reserve = useAction(({ date, min, room }: { date: Date; min: number; room: string | null }) => {
    const st = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, min);
    return db.insert('time_reservations', { branch_id: branch.id, room_id: room, starts_at: st.toISOString(), ends_at: new Date(+st + 3600_000).toISOString(), reason: 'Band' });
  }, { invalidate: ['time_reservations'], success: 'Vaqt band qilindi', onDone: () => setCtx(null) });
  const ctxRef = useClickAway(!!ctx, () => setCtx(null));

  return (
    <div className="relative flex flex-col" onClick={() => pop && setPop(null)}>
      {calFor !== null && (
        <div className="absolute z-40" style={{ top: 34, left: `calc(44px + ${calFor} * (100% - 44px) / ${days.length})` }}>
          <MiniCalendar value={days[calFor]!} onClose={() => setCalFor(null)} onPick={(d) => { setStart(addDays(d, -calFor)); setCalFor(null); }} />
        </div>
      )}

      <div className="w-full overflow-hidden bg-white print:overflow-visible">
        <div className="overflow-auto print:overflow-visible" style={{ height: 'calc(100vh - 45px)', minHeight: 480 }}>
          <div style={{ minWidth: view.scale === 'fit' ? undefined : Math.max(960, 44 + days.length * cols.length * 150) }}>
            {/* Sarlavha */}
            <div className="sticky top-0 z-30 flex border-b border-line bg-[#f0f4f7]">
              <div className="grid w-11 flex-none place-items-center border-r border-line">
                <button type="button" aria-label="Jadval sozlamalari" title="Jadval sozlamalari" aria-haspopup="dialog" aria-expanded={gear} onClick={() => setGear(true)}
                  className="relative h-[34px] w-[34px] rounded-[10px] border border-line bg-white shadow-sm hover:bg-muted">
                  <Gear size={18} className="absolute top-[10px] left-[3px]" />
                  <Gear size={13} strokeWidth={2.4} className="absolute top-1 right-[3px] text-primary" />
                </button>
              </div>
              {days.map((d, i) => (
                <div key={i} className="min-w-0 flex-1 border-r-2 border-[#c9d2d9] last:border-r-0">
                  <div className="flex items-center">
                    {i === 0 && <>
                      <button type="button" aria-label="Oldingi kun" onClick={() => setStart(addDays(start, -1))} className="ml-1 grid h-[30px] w-[26px] flex-none place-items-center rounded-md hover:bg-[#e6edf2]"><ChevronLeft size={16} /></button>
                      <button type="button" aria-label="Keyingi kun" onClick={() => setStart(addDays(start, 1))} className="grid h-[30px] w-[26px] flex-none place-items-center rounded-md hover:bg-[#e6edf2]"><ChevronRight size={16} /></button>
                    </>}
                    <button type="button" onClick={() => setCalFor(calFor === i ? null : i)} aria-haspopup="dialog"
                      className={cx('block w-full truncate px-3 py-2 text-left text-xs font-semibold', calFor === i && 'bg-primary-soft', sameDay(d, now) ? 'text-primary' : 'text-sub')}>
                      {dayLabel(d)}
                    </button>
                  </div>
                  <div className="flex border-t border-line bg-white">
                    {cols.map((r, ci) => (
                      <div key={ci} onDoubleClick={() => r && setSolo(solo ? null : r.id)} title="Ikki marta bosing — faqat shu kabinet (yana ikki marta — hammasi)"
                        className={cx('min-w-0 flex-1 cursor-zoom-in truncate border-r border-line px-2 py-1 text-center text-[11px] font-medium select-none last:border-r-0', solo ? 'text-primary' : 'text-sub')}>
                        {r?.name ?? 'Kabinet'}{solo && ' (faqat shu)'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Panjara */}
            <div className="flex">
              <div className="w-11 flex-none border-r border-line bg-[rgba(240,244,247,.6)]">
                {slots.map((s) => (
                  <div key={s} style={{ height: slotH }} className="box-border border-b border-[rgba(223,230,235,.5)] px-1.5 pt-0.5 text-[10px] text-sub">{fmtMin(s)}</div>
                ))}
              </div>
              {days.map((d, di) => {
                const dayIso = isoDate(d);
                return (
                  <div key={di} className="relative flex min-w-0 flex-1 border-r-2 border-[#c9d2d9] last:border-r-0">
                    {cols.map((r, ci) => {
                      const rid = r?.id ?? null;
                      const inCol = <T extends { room_id: string | null }>(x: T) => cols.length === 1 && !solo ? true : x.room_id === rid || (!x.room_id && ci === 0 && !solo);
                      const dayVisits = showVisits ? (visits.data ?? []).filter((v) => sameDay(new Date(v.starts_at), d) && inCol(v) && v.status !== 'cancelled' && (!effDoc || v.doctor_id === effDoc)) : [];
                      const dayRes = showVisits ? (reservations.data ?? []).filter((x) => sameDay(new Date(x.starts_at), d) && inCol(x)) : [];
                      const dayShifts = !showVisits ? (shifts.data ?? []).filter((s) => s.shift_date === dayIso && inCol(s) && SHIFT_ROLES[view.tab].includes(mById.get(s.member_id)?.role ?? 'owner')) : [];
                      const lastCol = di === days.length - 1 && ci === cols.length - 1;
                      return (
                        <div key={ci} className="relative min-w-0 flex-1 border-r border-[rgba(223,230,235,.6)] last:border-r-0"
                          title={showVisits && canEdit ? 'Bo‘sh joyni bosing — yangi qabul. O‘ng tugma — menyu' : undefined}
                          style={{ height: slots.length * slotH, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${slotH - 1}px, rgba(223,230,235,.6) ${slotH - 1}px, rgba(223,230,235,.6) ${slotH}px)` }}
                          onClick={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (pop) { setPop(null); return; }
                            if (!showVisits || !canEdit) return;
                            setVm({ init: { date: d, min: slotFrom(e), room: rid } });
                          }}
                          onContextMenu={(e) => {
                            if (!showVisits || !canEdit || e.target !== e.currentTarget) return;
                            e.preventDefault();
                            setCtx({ date: d, min: slotFrom(e), room: rid, x: e.clientX, y: e.clientY });
                          }}>
                          {dayVisits.map((v) => {
                            const p = pmap.get(v.patient_id);
                            const b = balanceInfo(balances.data?.get(v.patient_id));
                            const m = mByUser.get(v.doctor_id ?? '');
                            const c = view.docColor ? m?.color ?? '#0ea5e9' : VISIT_STATUS[v.status].color;
                            const s = minOf(v.starts_at);
                            let h = Math.max(px(minOf(v.ends_at)) - px(s), 18);
                            if (view.shrink && (v.status === 'no_show' || v.status === 'moved')) h = Math.max(18, slotH / 3);
                            const dead = DEAD_STATUS.includes(v.status);
                            const nameColor = b.n < 0 ? '#dc2626' : b.n > 0 && view.green ? '#15803d' : '#0f172a';
                            return (
                              <div key={v.id}>
                                <div role="button" tabIndex={0} aria-label={`${p?.full_name ?? ''}, ${hm(v.starts_at)}, ${VISIT_STATUS[v.status].label}`}
                                  title="Bir marta — ma’lumot, ikki marta — qabul oynasi"
                                  onClick={(e) => { e.stopPropagation(); setPop(pop === v.id ? null : v.id); setCtx(null); }}
                                  onDoubleClick={(e) => { e.stopPropagation(); setPop(null); setVm({ visit: v }); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') setVm({ visit: v }); }}
                                  className="absolute right-0.5 left-0.5 z-10 box-border cursor-pointer overflow-hidden rounded-md px-2 py-1 text-[11px] leading-tight text-[#334155] shadow-[0_1px_2px_rgba(0,0,0,.05)]"
                                  style={{ top: px(s), height: h, border: `1px solid ${c}30`, borderLeft: `4px solid ${c}`, background: `${c}14`,
                                    opacity: view.transparent && dead ? 0.45 : 1, outline: pop === v.id ? '2px solid #f59e0b' : undefined, outlineOffset: 1 }}>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="truncate font-semibold text-[#1e293b]">{hm(v.starts_at)} – {hm(v.ends_at)}</span>
                                    <span className="flex flex-none items-center gap-1">
                                      {v.mood && <span role="img" aria-label="Belgi">{v.mood}</span>}
                                      <span role="img" aria-label={VISIT_STATUS[v.status].label} title={VISIT_STATUS[v.status].label}
                                        className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_0_2px_#fff]" style={{ background: VISIT_STATUS[v.status].color }} />
                                    </span>
                                  </div>
                                  <div className="truncate font-medium" style={{ color: nameColor }}>
                                    {p?.full_name ?? '…'} <span className="text-[10px] font-normal text-[#64748b]">№{p?.card_number}</span>
                                  </div>
                                  {h >= 54 && v.comment && <div className="truncate text-[11px] text-[#334155]">{v.comment}</div>}
                                </div>
                                {pop === v.id && p && (
                                  <VisitPopover v={v} p={p} bal={b} top={px(s)} right={lastCol || ci === cols.length - 1 && di === days.length - 1}
                                    onClose={() => setPop(null)} onEdit={() => { setPop(null); setVm({ visit: v }); }} onCopy={() => setClip(v)} />
                                )}
                              </div>
                            );
                          })}
                          {dayRes.map((x) => (
                            <div key={x.id} className="absolute right-0.5 left-0.5 z-[5] box-border overflow-hidden rounded-md border border-[#94a3b8] bg-[#94a3b833] px-2 py-1 text-[11px] text-[#334155]"
                              style={{ top: px(minOf(x.starts_at)), height: px(minOf(x.ends_at)) - px(minOf(x.starts_at)) }}>
                              <div className="font-semibold">{hm(x.starts_at)} – {hm(x.ends_at)}</div><div>{x.reason}</div>
                            </div>
                          ))}
                          {dayShifts.map((s) => {
                            const m = mById.get(s.member_id);
                            return (
                              <div key={s.id} className="absolute right-0.5 left-0.5 z-10 box-border overflow-hidden rounded-md px-2 py-1 text-[11px]"
                                style={{ top: px(toMin(s.starts_at)), height: px(toMin(s.ends_at)) - px(toMin(s.starts_at)), borderLeft: `4px solid ${m?.color ?? '#94a3b8'}`, background: `${m?.color ?? '#94a3b8'}18` }}>
                                <div className="font-semibold">{s.starts_at.slice(0, 5)} – {s.ends_at.slice(0, 5)}</div>
                                <div className="truncate">{m?.full_name}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {sameDay(d, now) && minOf(now) >= startMin && minOf(now) <= endMin && (
                      <div className="pointer-events-none absolute right-0 left-0 z-20 flex items-center" style={{ top: px(minOf(now)) - 4 }}>
                        <span className="h-2 w-2 rounded-full bg-[#f43f5e]" /><span className="h-px flex-1 bg-[#475569]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {ctx && (
        <div ref={ctxRef} role="menu" aria-label="Jadval menyusi" style={{ left: ctx.x, top: ctx.y }}
          className="fixed z-[85] w-[230px] rounded-[10px] border border-line bg-white p-1 shadow-[0_4px_12px_rgba(7,18,30,.12)]">
          {[
            { l: `Qabul yaratish · ${fmtMin(ctx.min)}`, f: () => { setVm({ init: { date: ctx.date, min: ctx.min, room: ctx.room } }); setCtx(null); } },
            { l: 'Vaqtni band qilish (1 soat)', f: () => reserve.mutate(ctx) },
            { l: `Qo‘yish${clip ? ` · ${pmap.get(clip.patient_id)?.full_name ?? ''}` : ''}`, f: () => paste.mutate(ctx), dis: !clip },
            { l: 'Yopish', f: () => setCtx(null) },
          ].map((x) => (
            <button key={x.l} type="button" role="menuitem" disabled={x.dis} onClick={x.f}
              className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-sm hover:bg-muted">{x.l}</button>
          ))}
        </div>
      )}

      {vm && (
        <VisitModal branch={branch} rooms={allRooms} visit={vm.visit} patient={vm.visit ? pmap.get(vm.visit.patient_id) ?? null : null} init={vm.init}
          onClose={() => setVm(null)} onCopy={setClip} onSaved={() => { if (vm.waitId) dropWait.mutate(vm.waitId); }} />
      )}
      {gear && <ViewSettings view={view} rooms={allRooms} onClose={() => setGear(false)} onSave={(v) => { setView(v); setSolo(null); setGear(false); }} />}
    </div>
  );
}

/** Qabulni bir marta bosganda chiqadigan oyna: bemor ma'lumoti, tezkor akt va to'lov. */
function VisitPopover({ v, p, bal, top, right, onClose, onEdit, onCopy }: {
  v: Visit; p: Patient; bal: ReturnType<typeof balanceInfo>; top: number; right: boolean; onClose: () => void; onEdit: () => void; onCopy: () => void;
}) {
  const { branch, members, memberName, can, me } = useOrg();
  const [mode, setMode] = useState<'info' | 'pay' | 'act'>('info');
  const [amt, setAmt] = useState(bal.n < 0 ? String(-bal.n) : '');
  const [box, setBox] = useState('');
  const [item, setItem] = useState('');
  const [msg, setMsg] = useState('');
  const boxes = useList<Cashbox>('cashboxes', { branch_id: branch.id, archived: false }, { enabled: mode === 'pay' });
  const price = useList<PriceItem>('price_items', { archived: false }, { enabled: mode === 'act' });
  const color = members.find((m) => m.user_id === v.doctor_id)?.color ?? '#0ea5e9';
  const upd = useAction((patch: Partial<Visit>) => db.update('visits', v.id, patch), { invalidate: ['visits'] });
  const pay = useAction(() => {
    const n = Math.round(Number(amt) || 0);
    if (n <= 0) throw new Error('Summani kiriting');
    return db.insert('money_moves', { kind: 'income', cashbox_id: box || boxes.data?.[0]?.id, amount: n, patient_id: p.id, doctor_id: v.doctor_id });
  }, { invalidate: ['patients', 'money_moves', 'cash'], onDone: () => { setMsg(`${money(Number(amt))} so‘m to‘lov qabul qilindi`); setMode('info'); } });
  const act = useAction(async () => {
    const it = price.data?.find((x) => x.id === (item || price.data?.[0]?.id));
    if (!it) throw new Error('Xizmatni tanlang');
    const a = await db.insert<Act>('acts', { branch_id: branch.id, patient_id: p.id, visit_id: v.id, doctor_id: v.doctor_id ?? (me.role === 'doctor' ? me.user_id : null) });
    await db.insert('act_items', { act_id: a.id, price_item_id: it.id, name: it.name, price: it.price, qty: 1 });
    await http.post(`/api/acts/${a.id}/close`);
    return it;
  }, { invalidate: ['acts', 'patients', 'stock_balances'], onDone: (it) => { setMsg(`Akt yopildi: ${it.name}`); setMode('info'); } });
  const nextMood = () => { const ms = MOODS.map((m) => m[0]); const n = ms[(ms.indexOf(v.mood || '🙂') + 1) % ms.length]!; upd.mutate({ mood: n === '🙂' ? null : n }); };
  const age = ageOf(p.birth_date);
  const BTN = 'h-[30px] rounded px-2.5 text-[13px] text-white';

  return (
    <div role="dialog" aria-label="Bemor ma’lumotlari" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ top }} className={cx('absolute z-30 box-border flex w-[420px] cursor-default flex-col gap-2.5 rounded-lg border border-line bg-white p-3 text-[13px] leading-snug text-fg shadow-[0_8px_24px_rgba(7,18,30,.18)]',
        right ? 'right-[calc(100%+6px)]' : 'left-[calc(100%+6px)]')}>
      <div className="flex gap-3">
        <span className="grid h-[72px] w-[72px] flex-none place-items-center rounded-md text-2xl font-semibold" style={{ background: `${color}22`, color }}>{initials(p.full_name)}</span>
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-0.5">
          <span className="text-[11px] text-sub">№ {p.card_number}</span>
          <Link to={`/patients/${p.id}`} className="text-[15px] font-semibold no-underline" style={{ color: bal.n ? bal.color : '#07121e' }}>{p.full_name}</Link>
          {p.phone && <a href={`tel:+${p.phone.replace(/\D/g, '')}`} className="text-[13px] !text-sub no-underline">{phoneShow(p.phone)}</a>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="flex gap-1.5">
            <button type="button" onClick={nextMood} disabled={!can('schedule.edit', branch.id)} aria-label="Bemor belgisi" title="Bemor belgisi"
              className="h-[30px] w-[30px] rounded-full border-[1.5px] border-sub bg-white text-[15px] leading-none">{v.mood || '🙂'}</button>
            <select aria-label="Holati" value={v.status} disabled={!can('schedule.edit', branch.id)} onChange={(e) => upd.mutate({ status: e.target.value as VisitStatus })}
              className="h-[30px] rounded px-2 text-[13px] text-white" style={{ background: VISIT_STATUS[v.status].color }}>
              {(Object.keys(VISIT_STATUS) as VisitStatus[]).map((k) => <option key={k} value={k} className="bg-white text-fg">{VISIT_STATUS[k].label}</option>)}
            </select>
          </span>
          <button type="button" onClick={onClose} aria-label="Yopish" className="text-base text-faint">×</button>
        </div>
      </div>
      <div className="flex justify-between gap-2 border-y border-muted py-2">
        <span>{dayLabel(new Date(v.starts_at))}  {hm(v.starts_at)} – {hm(v.ends_at)}</span>
        <span className="font-semibold" style={{ color: bal.color }}>{bal.label}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span>Mutaxassis: <b className="font-medium">{memberName(v.doctor_id)}</b></span>
        {age !== null && <span>{age} yosh <span className="text-faint">{dmy(p.birth_date)}</span></span>}
        {p.important_info && <span className="font-medium text-[#dc2626]">⚠ {p.important_info}</span>}
        {v.comment && <span className="text-sub">{v.comment}</span>}
      </div>
      {mode === 'info' && (
        <div className="flex items-center gap-1.5">
          {can('patients.edit', branch.id) && <button type="button" onClick={() => setMode('act')} className={cx(BTN, 'bg-primary')}>Tezkor akt</button>}
          {can('cashbox.edit', branch.id) && <button type="button" onClick={() => setMode('pay')} className={cx(BTN, 'bg-ok')}>To‘lov qabul qilish</button>}
          <span className="flex-1" />
          <button type="button" onClick={() => { onCopy(); setMsg('Nusxalandi — bo‘sh joyda o‘ng tugma → «Qo‘yish»'); }} aria-label="Nusxalash" title="Qabulni nusxalash (o‘ng tugma → Qo‘yish)" className="h-[30px] w-[30px] rounded-md text-sub hover:bg-muted">⧉</button>
          <Link to={`/patients/${p.id}`} aria-label="Bemor kartasi" title="Bemor kartasi" className="grid h-[30px] w-[30px] place-items-center rounded-md no-underline hover:bg-muted">🪪</Link>
          <button type="button" onClick={onEdit} aria-label="Qabulni tahrirlash" title="Qabulni tahrirlash" className="h-[30px] w-[30px] rounded-md text-sub hover:bg-muted">✎</button>
        </div>
      )}
      {mode === 'pay' && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-[#f0fdf4] p-2">
          <input type="number" min={0} aria-label="Summa" placeholder="Summa" value={amt} onChange={(e) => setAmt(e.target.value)} className="h-[30px] w-[110px] rounded border border-line px-2 text-[13px]" />
          <select aria-label="Kassa" value={box} onChange={(e) => setBox(e.target.value)} className="h-[30px] rounded border border-line bg-white px-1.5 text-[13px]">
            {(boxes.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button type="button" disabled={pay.isPending} onClick={() => pay.mutate(undefined)} className={cx(BTN, 'bg-ok')}>Qabul qilish</button>
          <button type="button" onClick={() => setMode('info')} className="h-[30px] px-2 text-[13px] text-sub">Bekor</button>
        </div>
      )}
      {mode === 'act' && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-primary-soft/50 p-2">
          <select aria-label="Xizmat" value={item} onChange={(e) => setItem(e.target.value)} className="h-[30px] min-w-0 flex-1 rounded border border-line bg-white px-1.5 text-[13px]">
            {(price.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} — {money(x.price)}</option>)}
          </select>
          <button type="button" disabled={act.isPending} onClick={() => act.mutate(undefined)} className={cx(BTN, 'bg-primary')}>Aktni yopish</button>
          <button type="button" onClick={() => setMode('info')} className="h-[30px] px-2 text-[13px] text-sub">Bekor</button>
        </div>
      )}
      {msg && <span role="status" className="font-medium text-ok">✓ {msg}</span>}
      <div className="flex gap-3 border-t border-muted pt-2 text-[13px]">
        {([['visits', 'Vizitlar'], ['plans', 'Rejalar'], ['history', 'Tarix'], ['finance', 'Moliya']] as const).map(([k, l]) => (
          <Link key={k} to={`/patients/${p.id}?tab=${k}`}>{l}</Link>
        ))}
      </div>
    </div>
  );
}

/** "Jadval ko'rinishi" oynasi. */
function ViewSettings({ view, rooms, onClose, onSave }: { view: View; rooms: Room[]; onClose: () => void; onSave: (v: View) => void }) {
  const { members } = useOrg();
  const [g, setG] = useState(view);
  const [more, setMore] = useState(false);
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role));
  const noRoom = rooms.length > 0 && rooms.every((r) => g.hiddenRooms.includes(r.id));
  const L = 'w-[200px] flex-none sm:text-right';
  const SEL = 'h-10 rounded border border-line bg-white px-2.5 text-[15px]';
  return (
    <div className="fixed inset-0 z-[88] grid place-items-center bg-[rgba(7,18,30,.45)] p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="gsT" className="max-h-[calc(100vh-32px)] w-[730px] max-w-full overflow-y-auto rounded-md bg-white text-[15px] shadow-[0_24px_48px_-12px_rgba(7,18,30,.35)]">
        <div className="flex items-center gap-3.5 border-b border-line py-3.5 pr-4 pl-6">
          <CalendarDays size={22} className="text-primary" />
          <h2 id="gsT" className="m-0 flex-1 text-xl font-medium">Jadval ko‘rinishi</h2>
          <button type="button" onClick={onClose} aria-label="Yopish" className="h-9 w-9 text-[22px] leading-none text-sub">×</button>
        </div>
        <div className="flex flex-col gap-[18px] px-6 pt-6 pb-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-8">
            <span className={L}>Jadval turi</span>
            <div role="radiogroup" aria-label="Jadval turi" className="flex flex-wrap gap-0.5 rounded-lg bg-muted p-[3px]">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={g.tab === t.key} onClick={() => setG({ ...g, tab: t.key })}
                  className={cx('inline-flex h-[34px] items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap', g.tab === t.key ? 'bg-white text-fg shadow-[0_1px_3px_rgba(7,18,30,.12)]' : 'text-sub')}>
                  <t.icon size={15} /> {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-8">
            <span className={L}>Kabinetlar</span>
            <div className="flex flex-col gap-2.5">
              {rooms.map((r) => {
                const on = !g.hiddenRooms.includes(r.id);
                return (
                  <div key={r.id} className="flex items-center gap-3.5"><span className="min-w-20">{r.name}</span>
                    <Toggle on={on} label={r.name} onChange={() => setG({ ...g, hiddenRooms: on ? [...g.hiddenRooms, r.id] : g.hiddenRooms.filter((x) => x !== r.id) })} /></div>
                );
              })}
              {rooms.length === 0 && <span className="text-sm text-sub">Kabinetlar Sozlamalar → Klinika bo‘limida qo‘shiladi.</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-8">
            <label htmlFor="gsDoc" className={L}>Mutaxassis</label>
            <select id="gsDoc" value={g.doc} onChange={(e) => setG({ ...g, doc: e.target.value, only: e.target.value ? g.only : false })} className={cx(SEL, 'w-[300px] max-w-full')}>
              <option value="">Barcha mutaxassislar</option>{doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-8">
            <span className={L}>Faqat shu shifokorning jadvalini ko‘rsatish</span>
            <Toggle on={g.only} disabled={!g.doc} label="Faqat shu shifokorning jadvalini ko‘rsatish" onChange={(v) => setG({ ...g, only: v })} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-8">
            <label htmlFor="gsDays" className={L}>Kunlar soni</label>
            <select id="gsDays" value={g.days} onChange={(e) => setG({ ...g, days: Number(e.target.value) })} className={cx(SEL, 'w-[100px]')}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-8">
            <label htmlFor="gsScale" className={L}>Kabinetlar masshtabi</label>
            <select id="gsScale" value={g.scale} onChange={(e) => setG({ ...g, scale: e.target.value as View['scale'] })} className={cx(SEL, 'w-[220px]')}>
              <option value="full">Kichraytirmaslik</option><option value="fit">Ekranga sig‘dirish</option>
            </select>
          </div>
          <div className="sm:ml-[232px]"><button type="button" onClick={() => setG({ ...g, ...VIEW0 })} className="text-[15px] text-primary">Filtrlarni tiklash</button></div>
          {noRoom && <div role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">⚠ Kamida bitta kabinetni yoqing.</div>}
          {more && (
            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold">Qo‘shimcha ko‘rinish</span>
                {([['docColor', 'Shifokor rangida (o‘chirilsa — holat rangida)'], ['transparent', 'Bajarilgan va kelmaganlar shaffof'],
                  ['shrink', 'Kelmagan va ko‘chirilganlarni qisqartirish'], ['green', 'Avansli bemor ismi yashil']] as const).map(([k, l]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-sm"><span>{l}</span><Toggle on={g[k]} label={l} onChange={(v) => setG({ ...g, [k]: v })} /></div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold">Belgilar</span>
                {(Object.keys(VISIT_STATUS) as VisitStatus[]).map((k) => (
                  <span key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_2px_#fff,0_0_0_3px_#dfe6eb]" style={{ background: VISIT_STATUS[k].color }} />{VISIT_STATUS[k].label}</span>
                ))}
                <span><b className="text-[#dc2626]">Ism</b> — bemorning qarzi bor</span>
                <span><b className="text-ok">Ism</b> — bemorda avans bor</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-6 pt-4 pb-5">
          <button type="button" onClick={() => window.print()} aria-label="Jadvalni chop etish" title="Jadvalni chop etish" className="grid h-10 w-10 place-items-center rounded-md hover:bg-muted"><Printer size={20} /></button>
          <button type="button" onClick={() => setMore(!more)} aria-pressed={more} aria-label="Qo‘shimcha sozlamalar" title="Qo‘shimcha sozlamalar va belgilar"
            className={cx('grid h-10 w-10 place-items-center rounded-md', more ? 'bg-primary-soft' : 'hover:bg-muted')}><SlidersHorizontal size={20} /></button>
          <span className="flex-1" />
          <Button onClick={onClose}>Bekor qilish</Button>
          <Button variant="primary" disabled={noRoom} onClick={() => onSave(g)}>Saqlash</Button>
        </div>
      </div>
    </div>
  );
}
