import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Settings as Gear, Stethoscope, Users, UserCog, Trash2, ExternalLink } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { useAction, useList, byId } from '@/lib/hooks';
import { db } from "@/lib/api";
import { addDays, dayLabel, hm, isoDate, pad, sameDay } from '@/lib/format';
import { navigate, useTitle } from '@/lib/router';
import type { Branch, Member, Patient, Room, Visit, VisitStatus } from '@/lib/types';
import { MiniCalendar } from '@/components/MiniCalendar';
import { PatientPicker } from '@/components/PatientPicker';
import { Button, Confirm, Field, Input, Modal, Select, Switch, Textarea, cx } from '@/components/ui';

export const VISIT_STATUS: Record<VisitStatus, { label: string; color: string }> = {
  planned: { label: 'Rejalashtirilgan', color: '#0ea5e9' },
  confirmed: { label: 'Tasdiqlangan', color: '#10b981' },
  arrived: { label: 'Kelgan', color: '#f59e0b' },
  completed: { label: 'Tugatilgan', color: '#64748b' },
  no_show: { label: 'Kelmadi', color: '#ef4444' },
  cancelled: { label: 'Bekor qilingan', color: '#cbd5e1' },
};

type Tab = 'doctor' | 'assistant' | 'admin';
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'doctor', label: 'Shifokorlar va bemorlar', icon: Stethoscope },
  { key: 'assistant', label: 'Assistentlar', icon: Users },
  { key: 'admin', label: 'Administratorlar va b.', icon: UserCog },
];

interface Shift { id: string; member_id: string; room_id: string | null; shift_date: string; starts_at: string; ends_at: string }
interface Reservation { id: string; room_id: string | null; starts_at: string; ends_at: string; reason: string; color: string }

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h! * 60 + m!; };
const atMin = (d: Date, min: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60);
const minOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const fmtMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

function readZoom() { try { return Number(localStorage.getItem('td-zoom')) || 40; } catch { return 40; } }

export function Schedule() {
  useTitle('Jadval');
  const { branch, members, can, memberName } = useOrg();
  const [start, setStart] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('doctor');
  const [calFor, setCalFor] = useState<number | null>(null);
  const [zoom, setZoom] = useState(readZoom);
  const [newAt, setNewAt] = useState<{ date: Date; min: number; room: string | null } | null>(null);
  const [openVisit, setOpenVisit] = useState<Visit | null>(null);
  const [settings, setSettings] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { try { localStorage.setItem('td-zoom', String(zoom)); } catch { /* */ } }, [zoom]);

  const days = useMemo(() => Array.from({ length: branch.days_visible }, (_, i) => addDays(start, i)), [start, branch.days_visible]);
  const from = atMin(days[0]!, 0).toISOString();
  const to = atMin(addDays(days[days.length - 1]!, 1), 0).toISOString();

  const rooms = useList<Room>('rooms', { branch_id: branch.id, is_active: true });
  const visits = useList<Visit>('visits', { branch_id: branch.id, 'starts_at.gte': from, 'starts_at.lt': to });
  const reservations = useList<Reservation>('time_reservations', { branch_id: branch.id, 'starts_at.gte': from, 'starts_at.lt': to });
  const shifts = useList<Shift>('staff_shifts', { branch_id: branch.id, 'shift_date.gte': isoDate(days[0]!), 'shift_date.lte': isoDate(days[days.length - 1]!) }, { enabled: tab !== 'doctor' });
  const patientIds = [...new Set((visits.data ?? []).map((v) => v.patient_id))];
  const patients = useList<Patient>('patients', { 'id.in': patientIds }, { enabled: patientIds.length > 0 });
  const pmap = byId(patients.data);
  const mByUser = new Map(members.map((m) => [m.user_id, m]));
  const mById = byId(members);

  const cols: (Room | null)[] = rooms.data?.length ? rooms.data : [null];
  const startMin = toMin(branch.work_start), endMin = toMin(branch.work_end);
  const step = branch.slot_minutes;
  const slots = Array.from({ length: Math.ceil((endMin - startMin) / step) }, (_, i) => startMin + i * step);
  const px = (min: number) => ((min - startMin) / step) * zoom;
  const gridH = slots.length * zoom;
  const canEdit = can('schedule.edit', branch.id);

  const shiftRoles: Record<Tab, Member['role'][]> = { doctor: [], assistant: ['assistant'], admin: ['admin', 'curator', 'storekeeper', 'owner'] };

  return (
    <div className="relative flex flex-col gap-1 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div role="tablist" className="inline-flex items-center gap-px rounded-lg bg-muted p-0.5">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={cx('inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 text-sm font-medium whitespace-nowrap',
                tab === t.key ? 'bg-white text-fg shadow-[0_1px_3px_rgba(7,18,30,.1)]' : 'text-sub hover:text-fg')}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SqBtn label="Oldingi" onClick={() => setStart(addDays(start, -1))}><ChevronLeft size={16} /></SqBtn>
          <SqBtn label="Keyingi" onClick={() => setStart(addDays(start, 1))}><ChevronRight size={16} /></SqBtn>
          <span className="mx-2 h-6 w-px bg-line" />
          <SqBtn label="Kichiklashtirish" onClick={() => setZoom(Math.max(24, zoom - 8))}><ZoomOut size={16} /></SqBtn>
          <SqBtn label="Kattalashtirish" onClick={() => setZoom(Math.min(80, zoom + 8))}><ZoomIn size={16} /></SqBtn>
        </div>
      </div>

      {calFor !== null && (
        <div className="absolute z-40" style={{ top: 76, left: `calc(44px + ${calFor} * (100% - 44px) / ${days.length})` }}>
          <MiniCalendar value={days[calFor]!} onClose={() => setCalFor(null)}
            onPick={(d) => { setStart(addDays(d, -calFor)); setCalFor(null); }} />
        </div>
      )}

      <div className="w-full overflow-hidden border-t border-line bg-white">
        <div className="overflow-auto" style={{ height: 'calc(100vh - 86px)', minHeight: 480 }}>
          <div style={{ minWidth: Math.max(960, 44 + days.length * cols.length * 140) }}>
            {/* Sarlavha */}
            <div className="sticky top-0 z-30 flex border-b border-line bg-muted">
              <div className="grid w-11 flex-none place-items-center border-r border-line">
                <button type="button" aria-label="Jadval sozlamalari" title="Jadval sozlamalari" onClick={() => setSettings(true)}
                  className="relative h-[34px] w-[34px] rounded-[10px] border border-line bg-white shadow-sm hover:bg-muted">
                  <Gear size={18} className="absolute top-[10px] left-[3px]" />
                  <Gear size={13} strokeWidth={2.4} className="absolute top-1 right-[3px] text-primary" />
                </button>
              </div>
              {days.map((d, i) => (
                <div key={i} className="min-w-0 flex-1 border-r border-line">
                  <button type="button" onClick={() => setCalFor(calFor === i ? null : i)} aria-haspopup="dialog"
                    className={cx('block w-full truncate px-3 py-2 text-left text-xs font-semibold',
                      calFor === i ? 'bg-primary-soft' : 'hover:bg-[#e6edf2]', sameDay(d, now) ? 'text-primary' : 'text-fg')}>
                    {dayLabel(d)}
                  </button>
                  <div className="flex border-t border-line">
                    {cols.map((r, ci) => (
                      <div key={ci} className="min-w-0 flex-1 truncate border-r border-line px-2 py-1 text-center text-[11px] font-medium text-sub last:border-r-0">
                        {r?.name ?? 'Kabinet'}
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
                  <div key={s} style={{ height: zoom }} className="box-border border-b border-[rgba(223,230,235,.5)] px-1.5 pt-0.5 text-[10px] text-sub">{fmtMin(s)}</div>
                ))}
              </div>
              {days.map((d, di) => {
                const dayIso = isoDate(d);
                return (
                  <div key={di} className="relative flex min-w-0 flex-1 border-r border-line">
                    {cols.map((r, ci) => {
                      const rid = r?.id ?? null;
                      const inCol = <T extends { room_id: string | null }>(x: T) => cols.length === 1 || x.room_id === rid || (!x.room_id && ci === 0);
                      const dayVisits = (visits.data ?? []).filter((v) => sameDay(new Date(v.starts_at), d) && inCol(v) && v.status !== 'cancelled');
                      const dayRes = (reservations.data ?? []).filter((x) => sameDay(new Date(x.starts_at), d) && inCol(x));
                      const dayShifts = (shifts.data ?? []).filter((s) => s.shift_date === dayIso && inCol(s)
                        && shiftRoles[tab].includes(mById.get(s.member_id)?.role ?? 'owner'));
                      return (
                        <div key={ci} className="relative min-w-0 flex-1 border-r border-[rgba(223,230,235,.6)] last:border-r-0"
                          style={{ height: gridH, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${zoom - 1}px, rgba(223,230,235,.6) ${zoom - 1}px, rgba(223,230,235,.6) ${zoom}px)` }}
                          onClick={(e) => {
                            if (tab !== 'doctor' || !canEdit || e.target !== e.currentTarget) return;
                            const y = e.nativeEvent.offsetY;
                            setNewAt({ date: d, min: startMin + Math.floor(y / zoom) * step, room: rid });
                          }}>
                          {tab === 'doctor' && dayVisits.map((v) => {
                            const s = minOf(v.starts_at), en = minOf(v.ends_at);
                            const c = mByUser.get(v.doctor_id ?? '')?.color ?? '#0ea5e9';
                            const p = pmap.get(v.patient_id);
                            const h = Math.max(px(en) - px(s), 18);
                            return (
                              <button key={v.id} type="button" onClick={() => setOpenVisit(v)}
                                className="absolute right-0.5 left-0.5 z-10 box-border overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight hover:brightness-95"
                                style={{ top: px(s), height: h, border: `1px solid ${c}30`, borderLeft: `4px solid ${c}`, background: `${c}14` }}>
                                <div className="flex items-center justify-between gap-1 text-[#1e293b]">
                                  <span className="truncate font-semibold">{hm(v.starts_at)} – {hm(v.ends_at)}</span>
                                  <span role="img" aria-label={VISIT_STATUS[v.status].label} title={VISIT_STATUS[v.status].label}
                                    className="inline-block h-2.5 w-2.5 flex-none rounded-full shadow-[0_0_0_2px_#fff]" style={{ background: VISIT_STATUS[v.status].color }} />
                                </div>
                                <div className={cx('truncate font-medium', p?.important_info ? 'text-[#b91c1c]' : 'text-[#0f172a]')}>
                                  {p?.full_name ?? '…'} <span className="text-[10px] font-normal text-[#64748b]">№{p?.card_number}</span>
                                </div>
                                {h >= 54 && <div className="truncate text-[10px] text-[#334155]">{memberName(v.doctor_id)}</div>}
                                {h >= 70 && v.comment && <div className="truncate text-[10px] text-[#334155]">{v.comment}</div>}
                              </button>
                            );
                          })}
                          {tab === 'doctor' && dayRes.map((x) => (
                            <div key={x.id} className="absolute right-0.5 left-0.5 z-[5] box-border overflow-hidden rounded-md border border-[#94a3b8] px-2 py-1 text-[11px] text-[#334155]"
                              style={{ top: px(minOf(x.starts_at)), height: px(minOf(x.ends_at)) - px(minOf(x.starts_at)),
                                background: `repeating-linear-gradient(45deg, ${x.color}22 0 6px, ${x.color}11 6px 12px)` }}>
                              <div className="font-semibold">{hm(x.starts_at)} – {hm(x.ends_at)}</div><div>{x.reason}</div>
                            </div>
                          ))}
                          {tab !== 'doctor' && dayShifts.map((s) => {
                            const m = mById.get(s.member_id);
                            return (
                              <div key={s.id} className="absolute right-0.5 left-0.5 z-10 box-border overflow-hidden rounded-md px-2 py-1 text-[11px]"
                                style={{ top: px(toMin(s.starts_at)), height: px(toMin(s.ends_at)) - px(toMin(s.starts_at)),
                                  borderLeft: `4px solid ${m?.color ?? '#94a3b8'}`, background: `${m?.color ?? '#94a3b8'}18` }}>
                                <div className="font-semibold">{s.starts_at.slice(0, 5)} – {s.ends_at.slice(0, 5)}</div>
                                <div className="truncate">{m?.full_name}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {sameDay(d, now) && minOf(now.toISOString()) >= startMin && minOf(now.toISOString()) <= endMin && (
                      <div className="pointer-events-none absolute right-0 left-0 z-20 flex items-center" style={{ top: px(minOf(now.toISOString())) - 4 }}>
                        <span className="h-2 w-2 rounded-full bg-[#f43f5e]" /><span className="h-px flex-1 bg-[#f43f5e]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {tab !== 'doctor' && (
        <p className="m-0 px-4 text-xs text-sub">Smenalar «Jadval sozlamalari» orqali qo‘shiladi.</p>
      )}

      {newAt && (
        <VisitModal branch={branch} rooms={rooms.data ?? []} members={members}
          init={{ date: newAt.date, min: newAt.min, room: newAt.room }} onClose={() => setNewAt(null)} />
      )}
      {openVisit && (
        <VisitModal branch={branch} rooms={rooms.data ?? []} members={members} visit={openVisit}
          patient={pmap.get(openVisit.patient_id) ?? null} onClose={() => setOpenVisit(null)} />
      )}
      {settings && <ScheduleSettings branch={branch} rooms={rooms.data ?? []} members={members} day={days[0]!} onClose={() => setSettings(false)} />}
    </div>
  );
}

function SqBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(7,18,30,.04)] hover:bg-muted">
      {children}
    </button>
  );
}

const DURATIONS = [15, 20, 30, 45, 60, 90, 120, 180];

function VisitModal({ branch, rooms, members, visit, patient: initPatient, init, onClose }: {
  branch: Branch; rooms: Room[]; members: Member[]; visit?: Visit; patient?: Patient | null;
  init?: { date: Date; min: number; room: string | null }; onClose: () => void;
}) {
  const { me, can } = useOrg();
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role)
    && (m.all_branches || m.role === 'owner' || m.branch_ids.includes(branch.id)));
  const assistants = members.filter((m) => m.is_active && m.role === 'assistant' && (m.all_branches || m.branch_ids.includes(branch.id)));
  const s0 = visit ? new Date(visit.starts_at) : atMin(init!.date, init!.min);
  const [patient, setPatient] = useState<Patient | null>(initPatient ?? null);
  const [date, setDate] = useState(isoDate(s0));
  const [time, setTime] = useState(hm(s0));
  const [dur, setDur] = useState(visit ? Math.round((+new Date(visit.ends_at) - +new Date(visit.starts_at)) / 60000) : branch.slot_minutes);
  const [doctor, setDoctor] = useState(visit?.doctor_id ?? (doctors.some((d) => d.user_id === me.user_id) ? me.user_id : doctors[0]?.user_id ?? ''));
  const [assistant, setAssistant] = useState(visit?.assistant_id ?? '');
  const [room, setRoom] = useState(visit?.room_id ?? init?.room ?? rooms[0]?.id ?? '');
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? 'planned');
  const [first, setFirst] = useState(visit?.is_first_visit ?? false);
  const [comment, setComment] = useState(visit?.comment ?? '');
  const [askDel, setAskDel] = useState(false);
  const canEdit = can('schedule.edit', branch.id);

  const save = useAction(async () => {
    if (!patient) throw new Error('Bemorni tanlang');
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    const st = new Date(y!, mo! - 1, d!, h!, mi!);
    const row = {
      branch_id: branch.id, patient_id: patient.id, doctor_id: doctor || null, assistant_id: assistant || null, room_id: room || null,
      starts_at: st.toISOString(), ends_at: new Date(+st + dur * 60000).toISOString(), status, is_first_visit: first, comment,
    };
    return visit ? db.update('visits', visit.id, row) : db.insert('visits', row);
  }, { invalidate: ['visits'], success: visit ? 'Saqlandi' : 'Bemor yozildi', onDone: onClose });

  const del = useAction(() => db.remove('visits', visit!.id), { invalidate: ['visits'], success: 'O‘chirildi', onDone: onClose });

  return (
    <Modal open onClose={onClose} title={visit ? 'Qabul' : 'Yangi qabul'} width={560}
      footer={canEdit ? <>
        {visit && <Button variant="danger" className="mr-auto" onClick={() => setAskDel(true)}><Trash2 size={15} /> O‘chirish</Button>}
        <Button onClick={onClose}>Bekor qilish</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button>
      </> : undefined}>
      <div className="flex flex-col gap-3">
        <Field label="Bemor">{() => <PatientPicker value={patient} onChange={setPatient} branchId={branch.id} autoFocus={!visit} />}</Field>
        {patient?.important_info && <div className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-[#b91c1c]">Muhim: {patient.important_info}</div>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sana">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Vaqt">{(id) => <Input id={id} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          <Field label="Davomiyligi">{(id) => (
            <Select id={id} value={dur} onChange={(e) => setDur(Number(e.target.value))}>
              {[...new Set([...DURATIONS, dur])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m < 60 ? `${m} daq` : `${m / 60} soat`}</option>)}
            </Select>)}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shifokor">{(id) => (
            <Select id={id} value={doctor} onChange={(e) => setDoctor(e.target.value)}>
              <option value="">—</option>
              {doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
            </Select>)}
          </Field>
          <Field label="Kabinet">{(id) => (
            <Select id={id} value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">—</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>)}
          </Field>
          <Field label="Assistent">{(id) => (
            <Select id={id} value={assistant} onChange={(e) => setAssistant(e.target.value)}>
              <option value="">—</option>
              {assistants.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
            </Select>)}
          </Field>
          <Field label="Holati">{(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
              {Object.entries(VISIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>)}
          </Field>
        </div>
        <Field label="Izoh">{(id) => <Textarea id={id} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Masalan: plomba (36)" />}</Field>
        <div className="flex items-center justify-between">
          <Switch checked={first} onChange={setFirst} label="Birinchi tashrif" />
          {patient && <button type="button" onClick={() => navigate(`/patients/${patient.id}`)} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Bemor kartasi <ExternalLink size={14} /></button>}
        </div>
      </div>
      <Confirm open={askDel} danger yes="O‘chirish" text="Qabulni o‘chirasizmi? Agar bemor kelmagan bo‘lsa, holatini «Kelmadi» qilib qo‘yish yaxshiroq."
        onNo={() => setAskDel(false)} onYes={() => del.mutate(undefined)} loading={del.isPending} />
    </Modal>
  );
}

function ScheduleSettings({ branch, rooms, members, day, onClose }: { branch: Branch; rooms: Room[]; members: Member[]; day: Date; onClose: () => void }) {
  const { can, refresh } = useOrg();
  const [b, setB] = useState({ slot_minutes: branch.slot_minutes, days_visible: branch.days_visible, work_start: branch.work_start.slice(0, 5), work_end: branch.work_end.slice(0, 5) });
  const [res, setRes] = useState({ date: isoDate(day), from: '13:00', to: '14:00', reason: 'Tushlik', room_id: '' });
  const [sh, setSh] = useState({ member_id: '', date: isoDate(day), from: branch.work_start.slice(0, 5), to: branch.work_end.slice(0, 5), room_id: '' });
  const staff = members.filter((m) => m.is_active && m.role !== 'doctor');

  const saveBranch = useAction(() => db.update('branches', branch.id, b), { success: 'Saqlandi', onDone: () => { void refresh(); } });
  const addRes = useAction(() => {
    const [y, mo, d] = res.date.split('-').map(Number);
    const t = (s: string) => { const [h, mi] = s.split(':').map(Number); return new Date(y!, mo! - 1, d!, h!, mi!).toISOString(); };
    return db.insert('time_reservations', { branch_id: branch.id, room_id: res.room_id || null, starts_at: t(res.from), ends_at: t(res.to), reason: res.reason });
  }, { invalidate: ['time_reservations'], success: 'Vaqt band qilindi' });
  const addShift = useAction(() => db.insert('staff_shifts', { branch_id: branch.id, member_id: sh.member_id, room_id: sh.room_id || null, shift_date: sh.date, starts_at: sh.from, ends_at: sh.to }),
    { invalidate: ['staff_shifts'], success: 'Smena qo‘shildi' });

  return (
    <Modal open onClose={onClose} title="Jadval sozlamalari" width={600}>
      <div className="flex flex-col gap-5">
        {can('settings.edit') && (
          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold">{branch.name}: ish vaqti</h3>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Boshlanishi">{(id) => <Input id={id} type="time" value={b.work_start} onChange={(e) => setB({ ...b, work_start: e.target.value })} />}</Field>
              <Field label="Tugashi">{(id) => <Input id={id} type="time" value={b.work_end} onChange={(e) => setB({ ...b, work_end: e.target.value })} />}</Field>
              <Field label="Qadam">{(id) => (
                <Select id={id} value={b.slot_minutes} onChange={(e) => setB({ ...b, slot_minutes: Number(e.target.value) })}>
                  {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} daqiqa</option>)}
                </Select>)}
              </Field>
              <Field label="Kunlar soni">{(id) => (
                <Select id={id} value={b.days_visible} onChange={(e) => setB({ ...b, days_visible: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6, 7].map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>)}
              </Field>
            </div>
            <div><Button variant="primary" size="sm" loading={saveBranch.isPending} onClick={() => saveBranch.mutate(undefined)}>Saqlash</Button></div>
          </section>
        )}
        {can('schedule.edit', branch.id) && <>
          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="m-0 text-sm font-semibold">Vaqtni band qilish</h3>
            <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-3">
              <Field label="Sana">{(id) => <Input id={id} type="date" value={res.date} onChange={(e) => setRes({ ...res, date: e.target.value })} />}</Field>
              <Field label="Dan">{(id) => <Input id={id} type="time" value={res.from} onChange={(e) => setRes({ ...res, from: e.target.value })} />}</Field>
              <Field label="Gacha">{(id) => <Input id={id} type="time" value={res.to} onChange={(e) => setRes({ ...res, to: e.target.value })} />}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sabab">{(id) => <Input id={id} value={res.reason} onChange={(e) => setRes({ ...res, reason: e.target.value })} />}</Field>
              <Field label="Kabinet">{(id) => (
                <Select id={id} value={res.room_id} onChange={(e) => setRes({ ...res, room_id: e.target.value })}>
                  <option value="">Barcha kabinetlar</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>)}
              </Field>
            </div>
            <div><Button size="sm" loading={addRes.isPending} onClick={() => addRes.mutate(undefined)}>Band qilish</Button></div>
          </section>
          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="m-0 text-sm font-semibold">Xodim smenasi</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Xodim">{(id) => (
                <Select id={id} value={sh.member_id} onChange={(e) => setSh({ ...sh, member_id: e.target.value })}>
                  <option value="">Tanlang</option>
                  {staff.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </Select>)}
              </Field>
              <Field label="Kabinet">{(id) => (
                <Select id={id} value={sh.room_id} onChange={(e) => setSh({ ...sh, room_id: e.target.value })}>
                  <option value="">—</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>)}
              </Field>
            </div>
            <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-3">
              <Field label="Sana">{(id) => <Input id={id} type="date" value={sh.date} onChange={(e) => setSh({ ...sh, date: e.target.value })} />}</Field>
              <Field label="Dan">{(id) => <Input id={id} type="time" value={sh.from} onChange={(e) => setSh({ ...sh, from: e.target.value })} />}</Field>
              <Field label="Gacha">{(id) => <Input id={id} type="time" value={sh.to} onChange={(e) => setSh({ ...sh, to: e.target.value })} />}</Field>
            </div>
            <div><Button size="sm" disabled={!sh.member_id} loading={addShift.isPending} onClick={() => addShift.mutate(undefined)}>Smena qo‘shish</Button></div>
          </section>
        </>}
        {!can('settings.edit') && !can('schedule.edit', branch.id) && <p className="m-0 text-sm text-sub">Sozlamalarni o‘zgartirish uchun ruxsat yo‘q.</p>}
      </div>
    </Modal>
  );
}

