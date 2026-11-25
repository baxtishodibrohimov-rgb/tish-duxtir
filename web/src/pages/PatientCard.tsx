import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, FolderOpen, Info, Zap, ArrowLeft, CalendarDays, CalendarPlus, FilePen, Bell, Printer, Trash2, Pencil, Upload, FileText, Lock, Wallet, X, AlertTriangle, IdCard, Plus, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { ageOf, dmy, dmyhm, hm, initials, isoDate, money, phoneShow, som, MONTHS, WD_SHORT } from '@/lib/format';
import { Link, navigate, useLocation, useQueryParam, useTitle } from '@/lib/router';
import { VISIT_STATUS } from '@/lib/visit';
import type { Act, ActItem, Cashbox, Patient, PriceCategory, PriceItem, RecordFile, Reminder, Room, Visit, Warehouse } from '@/lib/types';
import { NewPatient } from './NewPatient';
import { Plans } from '@/components/Plans';
import { HistoryTab } from '@/components/History';
import { VisitModal } from '@/components/VisitModal';
import { Badge, Button, Card, Confirm, Empty, ErrorBox, Field, Input, Modal, PageLoader, Select, cx } from '@/components/ui';

export { VISIT_STATUS } from '@/lib/visit';

type Tab = 'tasks' | 'docs' | 'visits' | 'plans' | 'history' | 'finance' | 'info';
const TABS: { key: Tab; label: string }[] = [
  { key: 'tasks', label: 'Vazifalar' }, { key: 'docs', label: 'Hujjatlar' }, { key: 'visits', label: 'Vizitlar' },
  { key: 'plans', label: 'Davolash rejalari' }, { key: 'history', label: 'Davolash tarixi' }, { key: 'finance', label: 'Moliya' },
];

interface Summary { patient: Patient; billed: number; paid: number; last_visit: string | null; next_visit: string | null }

export function PatientCard({ id }: { id: string }) {
  const [tab0, setTab] = useQueryParam<Tab>('tab', 'visits');
  // Jadvaldagi qabuldan kelinganda: ?quick=act (tezkor akt) yoki ?pay=1 (to'lov), doctor — qabul shifokori.
  const { search } = useLocation();
  const [jump] = useState(() => ({ quick: search.get('quick') === 'act', pay: search.get('pay') === '1', doctor: search.get('doctor') || null }));
  const [quick, setQuick] = useState<{ doctor: string | null } | null>(jump.quick ? { doctor: jump.doctor } : null);
  useEffect(() => {
    if (!jump.quick && !jump.pay) return;
    const q = new URLSearchParams(location.search); q.delete('quick'); q.delete('pay'); q.delete('doctor');
    navigate(`${location.pathname}?${q.toString()}`, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tab: Tab = (tab0 as string) === 'files' ? 'docs' : tab0;
  const { members, memberName, me } = useOrg();
  // Tezkor akt / qabulga yozish bir marta ochiladi: bo'limdan chiqilgach qayta ochilmasin.
  const [book, setBook] = useState(false);
  useEffect(() => { if (tab0 !== 'plans') setQuick(null); if (tab0 !== 'visits') setBook(false); }, [tab0]);
  const sum = useQuery({ queryKey: ['patients', 'summary', id], queryFn: () => http.get<Summary>(`/api/patients/${id}/summary`) });
  useTitle(sum.data?.patient.full_name ?? 'Bemor');

  if (sum.isLoading) return <PageLoader />;
  if (sum.error) return <ErrorBox error={sum.error} />;
  const p = sum.data!.patient;
  const debt = sum.data!.billed - sum.data!.paid;
  const age = ageOf(p.birth_date);
  const doc = p.curator_id ?? null;
  const docColor = members.find((m) => m.user_id === doc)?.color ?? '#00a1db';

  return (
    <main className="flex flex-col gap-4 px-2 pt-2 pb-6 sm:px-3 sm:pt-2.5">
      <section className="app-card flex flex-wrap items-stretch gap-x-4 gap-y-1 rounded-md border border-l-4 border-line bg-white pt-2 pr-3 pl-2 md:flex-nowrap md:pr-5"
        style={{ borderLeftColor: debt > 0 ? '#dc2626' : '#15803d' }}>
        <div className="grid h-[76px] w-[68px] flex-none place-items-end self-start overflow-hidden rounded bg-muted md:h-[110px] md:w-28 md:self-end md:rounded-b-none">
          {p.photo_file_id ? <img src={`/api/files/${p.photo_file_id}`} alt="" className="h-full w-full object-cover" /> : <UserRound strokeWidth={1} className="-mb-2 h-[64px] w-[64px] fill-[#cfd8de] text-[#cfd8de] md:-mb-3 md:h-24 md:w-24" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 pt-1 pb-1 md:pt-2 md:pb-3">
          <span className="text-sm text-sub">{p.card_number}</span>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-lg font-semibold" style={{ color: debt > 0 ? '#dc2626' : undefined }}>
              {p.full_name || 'Ismsiz'} {age !== null && <span className="ml-2.5 font-medium text-fg">{age} yosh</span>}
            </h1>
            {p.phone && <a href={`tel:+${p.phone.replace(/\D/g, '')}`} className="text-sm !text-sub no-underline">{phoneShow(p.phone)}</a>}
          </div>
        </div>
        <div className="flex w-full flex-col items-stretch gap-1 md:w-auto md:items-end md:justify-between md:gap-2 md:pt-2">
          <div className="flex flex-wrap items-center gap-2.5 md:justify-end md:gap-3.5">
            {debt > 0 && <Badge tone="red">Qarz: {som(debt)}</Badge>}
            {debt < 0 && <Badge tone="green">Avans: {som(-debt)}</Badge>}
            {doc && <span title={`Kurator: ${memberName(doc)}`} className="grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: docColor }}>{initials(memberName(doc))}</span>}
            <button type="button" onClick={() => setTab(tab === 'info' ? 'visits' : 'info')} aria-label="Bemor ma‘lumotlari" title="Bemor ma‘lumotlari"
              className={cx('grid h-9 w-9 place-items-center rounded-md text-sub hover:bg-muted', tab === 'info' && 'bg-muted')}><IdCard size={22} /></button>
          </div>
          <div role="tablist" className="-mx-1 flex overflow-x-auto [scrollbar-width:none] md:mx-0 md:flex-wrap md:justify-end md:overflow-visible">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={cx('-mb-px h-10 flex-none border-b-[3px] px-3 text-[15px] whitespace-nowrap md:px-4', tab === t.key ? 'border-primary text-fg' : 'border-transparent text-[#3d4858] hover:text-fg')}>{t.label}</button>
            ))}
          </div>
        </div>
      </section>
      {p.important_info && (
        <div className="flex items-start gap-2 rounded-md border border-bad-soft bg-[#fff6f6] px-3 py-2 text-sm text-[#b91c1c]">
          <AlertTriangle size={16} className="mt-0.5 flex-none" /> {p.important_info}
        </div>
      )}
      <Link to="/patients" className="inline-flex items-center gap-1.5 self-start text-sm !text-sub no-underline print:hidden"><ArrowLeft size={15} /> Orqaga</Link>
      {tab === 'info' && <NewPatient patient={p} onDone={() => setTab('visits')} />}
      {tab === 'tasks' && <TasksTab p={p} />}
      {tab === 'visits' && <VisitsTab p={p} openNew={book} />}
      {tab === 'plans' && <Plans patient={p} quickAct={quick ?? undefined} />}
      {tab === 'history' && <HistoryTab p={p} />}
      {tab === 'docs' && <FilesTab p={p} />}
      {tab === 'finance' && <FinanceTab p={p} s={sum.data!} openPay={jump.pay} payDoctor={jump.doctor} onQuickAct={() => { setQuick({ doctor: me.role === 'doctor' || me.role === 'owner' ? me.user_id : null }); setTab('plans'); }} onBook={() => { setBook(true); setTab('visits'); }} />}
    </main>
  );
}

// ---------------- Vazifalar ----------------
function TasksTab({ p }: { p: Patient }) {
  const { can, me } = useOrg();
  const list = useList<Reminder>('reminders', { patient_id: p.id, 'status.in': ['planned', 'done'] }, { order: 'remind_at' });
  const [text, setText] = useState('');
  const [date, setDate] = useState(isoDate(new Date(Date.now() + 3 * 86400000)));
  const add = useAction(() => db.insert('reminders', { patient_id: p.id, comment: text.trim(), remind_at: new Date(date + 'T09:00:00').toISOString(), assigned_to: me.user_id, audience: 'me' }),
    { invalidate: ['reminders'], onDone: () => setText('') });
  const toggle = useAction((r: Reminder) => db.update('reminders', r.id, { status: r.status === 'done' ? 'planned' : 'done' }), { invalidate: ['reminders'] });
  const rows = list.data ?? [];
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-white p-4">
      {can('patients.edit') && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(undefined); }}>
          <label htmlFor="tkIn" className="sr-only">Yangi vazifa</label>
          <input id="tkIn" placeholder="Yangi vazifa, masalan: 3 kundan keyin qo‘ng‘iroq qilish" value={text} onChange={(e) => setText(e.target.value)}
            className="h-10 min-w-[240px] flex-1 rounded-[3px] border border-line px-3 text-[15px]" />
          <input type="date" aria-label="Muddat" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-[3px] border border-line px-3 text-[15px]" />
          <button type="submit" disabled={!text.trim()} className="h-10 rounded-[3px] bg-primary px-4 text-[15px] text-white">Qo‘shish</button>
        </form>
      )}
      {rows.length === 0 && <div className="py-6 text-center text-sm text-sub">Vazifa yo‘q</div>}
      {rows.map((t) => (
        <label key={t.id} className="flex items-center gap-3 border-t border-muted pt-2.5 text-[15px]">
          <input type="checkbox" checked={t.status === 'done'} disabled={!can('patients.edit')} onChange={() => toggle.mutate(t)} />
          <span className={cx('flex-1', t.status === 'done' && 'text-faint line-through')}>{t.comment}</span>
          <span className={cx('text-sm', t.status !== 'done' && t.remind_at < new Date().toISOString() ? 'text-bad' : 'text-sub')}>{dmy(t.remind_at)}</span>
        </label>
      ))}
    </section>
  );
}

// ---------------- Vizitlar (qabullar, izohlar, eslatmalar bitta tasmada) ----------------
interface Note { id: string; patient_id: string; note_date: string; text: string; created_by: string | null }
type Item = { kind: 'visit'; at: string; v: Visit } | { kind: 'note'; at: string; n: Note } | { kind: 'rem'; at: string; r: Reminder };

function VisitsTab({ p, openNew }: { p: Patient; openNew?: boolean }) {
  const { branch, members, memberName, can, me } = useOrg();
  const visits = useList<Visit>('visits', { patient_id: p.id }, { order: 'starts_at' });
  const notes = useList<Note>('patient_notes', { patient_id: p.id });
  const rems = useList<Reminder>('reminders', { patient_id: p.id, 'status.in': ['planned', 'done', 'sent'] });
  const rooms = useList<Room>('rooms', { branch_id: branch.id, is_active: true });
  const [vm, setVm] = useState<{ visit?: Visit } | null>(openNew ? {} : null);
  const [md, setMd] = useState<{ kind: 'note' | 'rem'; id?: string; date: string; text: string } | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  const items = useMemo<Item[]>(() => [
    ...(visits.data ?? []).map((v) => ({ kind: 'visit' as const, at: v.starts_at, v })),
    ...(notes.data ?? []).map((n) => ({ kind: 'note' as const, at: `${n.note_date}T00:00:00`, n })),
    ...(rems.data ?? []).map((r) => ({ kind: 'rem' as const, at: r.remind_at, r })),
  ].sort((a, b) => a.at.localeCompare(b.at)), [visits.data, notes.data, rems.data]);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) { const d = new Date(it.at); const k = `${MONTHS[d.getMonth()]![0]!.toUpperCase()}${MONTHS[d.getMonth()]!.slice(1)} ${d.getFullYear()}`; m.set(k, [...(m.get(k) ?? []), it]); }
    return [...m.entries()];
  }, [items]);
  const delAction = useAction((it: Item) => it.kind === 'visit' ? db.remove('visits', it.v.id) : it.kind === 'note' ? db.remove('patient_notes', it.n.id) : db.remove('reminders', it.r.id),
    { invalidate: ['visits', 'patient_notes', 'reminders'], success: 'O‘chirildi', onDone: () => setAskDel(null) });
  const saveMd = useAction(() => {
    if (md!.kind === 'note') return md!.id ? db.update('patient_notes', md!.id, { note_date: md!.date, text: md!.text }) : db.insert('patient_notes', { patient_id: p.id, note_date: md!.date, text: md!.text });
    const row = { patient_id: p.id, remind_at: new Date(md!.date + 'T09:00:00').toISOString(), comment: md!.text, assigned_to: me.user_id, audience: 'me' };
    return md!.id ? db.update('reminders', md!.id, row) : db.insert('reminders', row);
  }, { invalidate: ['patient_notes', 'reminders'], success: 'Saqlandi', onDone: () => setMd(null) });
  const editV = can('schedule.edit', branch.id), editP = can('patients.edit');
  const ICON = 'grid h-[30px] w-[30px] flex-none place-items-center rounded-full text-white';

  return (
    <div className="grid grid-cols-1 gap-x-2 gap-y-2 lg:grid-cols-[minmax(0,820px)_40px]">
      {visits.isLoading ? <PageLoader /> : items.length === 0 && <div className="py-6 text-center text-sm text-sub lg:col-span-2">Hali vizit yo‘q</div>}
      {groups.map(([label, list]) => (
        <div key={label} className="contents">
          <h3 className="m-0 mt-2.5 mb-0.5 ml-2.5 text-lg font-medium lg:col-span-2">{label}</h3>
          {list.map((it) => {
            const d = new Date(it.at);
            const key = it.kind === 'visit' ? it.v.id : it.kind === 'note' ? it.n.id : it.r.id;
            const m = it.kind === 'visit' ? members.find((x) => x.user_id === it.v.doctor_id) : undefined;
            const st = it.kind === 'visit' ? VISIT_STATUS[it.v.status] : null;
            const canDel = it.kind === 'visit' ? editV : editP;
            return (
              <div key={key} className="contents">
                <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-[3px] border border-[#e6ecf0] bg-white px-2.5 py-1.5 text-[15px] sm:flex-nowrap sm:gap-3.5 sm:py-0">
                  <span className={cx(ICON, it.kind === 'visit' ? 'bg-primary' : it.kind === 'note' ? 'bg-[#15803d]' : 'bg-[#b45309]')}>
                    {it.kind === 'visit' ? <CalendarDays size={16} /> : it.kind === 'note' ? <FilePen size={16} /> : <Bell size={16} />}
                  </span>
                  <span className="whitespace-nowrap">{dmy(d)}</span>
                  <span className="whitespace-nowrap">{it.kind === 'visit' ? `${hm(it.v.starts_at)} - ${hm(it.v.ends_at)}` : ''}</span>
                  <span className="w-[26px] text-[#3d4858]">{WD_SHORT[d.getDay()]}</span>
                  <span className={cx('min-w-0 flex-1 truncate', it.kind !== 'visit' && 'italic text-[#3d4858]')}>{it.kind === 'visit' ? it.v.comment : it.kind === 'note' ? it.n.text : it.r.comment}</span>
                  {it.kind === 'visit' && it.v.mood && <span className="text-xl leading-none" role="img">{it.v.mood}</span>}
                  {it.kind === 'visit' && it.v.doctor_id && (
                    <span className="inline-flex max-w-[150px] items-center gap-2 truncate">
                      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[3px] text-[11px] font-semibold text-white" style={{ background: m?.color ?? '#94a3b8' }}>{initials(memberName(it.v.doctor_id))}</span>
                      <span className="truncate">{memberName(it.v.doctor_id)}</span>
                    </span>
                  )}
                  {st && <span className="flex h-6 flex-none px-3 sm:w-[166px] sm:px-0 items-center justify-center rounded-[3px] text-sm text-white" style={{ background: st.color }}>{st.label}</span>}
                  {it.kind === 'rem' && <span className="flex h-6 flex-none px-3 sm:w-[166px] sm:px-0 items-center justify-center rounded-[3px] bg-[#b45309] text-sm text-white">{it.r.status === 'done' ? 'Bajarildi' : 'Eslatma'}</span>}
                  {it.kind === 'note' && <span className="flex h-6 flex-none px-3 sm:w-[166px] sm:px-0 items-center justify-center rounded-[3px] bg-[#15803d] text-sm text-white">Izoh</span>}
                  {canDel && (askDel === key ? (
                    <span className="flex items-center gap-1.5 text-[13px]">O‘chirilsinmi? <button type="button" onClick={() => delAction.mutate(it)} className="font-medium text-bad">Ha</button><button type="button" onClick={() => setAskDel(null)} className="text-sub">Yo‘q</button></span>
                  ) : <button type="button" onClick={() => setAskDel(key)} aria-label="O‘chirish" title="O‘chirish" className={cx(ICON, 'bg-[#ef4444]')}><Trash2 size={15} /></button>)}
                </div>
                <div className="flex items-center">
                  {(it.kind === 'visit' ? editV : editP) && (
                    <button type="button" aria-label="Tahrirlash" title="Tahrirlash" className="grid h-8 w-8 place-items-center rounded-full bg-[#e6ecf0] text-sub"
                      onClick={() => it.kind === 'visit' ? setVm({ visit: it.v }) : it.kind === 'note' ? setMd({ kind: 'note', id: it.n.id, date: it.n.note_date, text: it.n.text }) : setMd({ kind: 'rem', id: it.r.id, date: isoDate(new Date(it.r.remind_at)), text: it.r.comment ?? '' })}>
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-2 lg:col-span-1">
        {editV && <button type="button" onClick={() => setVm({})} className="mt-2 inline-flex h-[42px] items-center justify-center gap-2 rounded-[3px] bg-primary text-base text-white"><CalendarPlus size={18} />Qabulga yozish</button>}
        {editP && <button type="button" onClick={() => setMd({ kind: 'note', date: isoDate(new Date()), text: '' })} className="mt-2 inline-flex h-[42px] items-center justify-center gap-2 rounded-[3px] bg-[#15803d] text-base text-white"><FilePen size={18} />Izoh qo‘shish</button>}
        {editP && <button type="button" onClick={() => setMd({ kind: 'rem', date: isoDate(new Date(Date.now() + 7 * 86400000)), text: '' })} className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[3px] bg-[#b45309] text-base text-white"><Bell size={18} />Eslatma qo‘shish</button>}
      </div>
      <div className="lg:col-span-2"><button type="button" onClick={() => window.print()} aria-label="Chop etish" title="Chop etish" className="grid h-9 w-9 place-items-center rounded-md text-sub hover:bg-muted print:hidden"><Printer size={20} /></button></div>
      {vm && (
        <VisitModal branch={branch} rooms={rooms.data ?? []} visit={vm.visit} patient={p}
          init={vm.visit ? undefined : { date: new Date(), min: Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 15) * 15, room: null, patient: p }} onClose={() => setVm(null)} />
      )}
      {md && (
        <Modal open onClose={() => setMd(null)} title={md.kind === 'note' ? (md.id ? 'Izoh' : 'Izoh qo‘shish') : (md.id ? 'Eslatma' : 'Eslatma qo‘shish')} width={520}
          footer={<><Button onClick={() => setMd(null)}>Bekor qilish</Button><span className="flex-1" /><Button variant="primary" disabled={!md.text.trim() || !md.date} loading={saveMd.isPending} onClick={() => saveMd.mutate(undefined)}>Saqlash</Button></>}>
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-6 text-[15px]"><span className="w-24 text-right">Sana<span className="text-bad"> *</span></span>
              <input type="date" value={md.date} onChange={(e) => setMd({ ...md, date: e.target.value })} className="h-[42px] rounded border border-line px-3" /></label>
            <label className="flex items-start gap-6 text-[15px]"><span className="w-24 pt-2 text-right">{md.kind === 'note' ? 'Izoh' : 'Eslatma matni'}</span>
              <textarea rows={3} value={md.text} onChange={(e) => setMd({ ...md, text: e.target.value })} className="flex-1 rounded border border-line px-3 py-2" autoFocus /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Praysdan xizmat tanlash (reja va akt uchun). */
export function ServicePicker({ onPick, onClose, withTooth }: { onPick: (l: { item: PriceItem; tooth: string }[]) => void; onClose: () => void; withTooth?: boolean }) {
  const cats = useList<PriceCategory>('price_categories');
  const items = useList<PriceItem>('price_items', { archived: false });
  const [q, setQ] = useState('');
  const [tooth, setTooth] = useState('');
  const [sel, setSel] = useState<PriceItem[]>([]);
  const filtered = (items.data ?? []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.code?.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open onClose={onClose} title="Xizmat tanlash" width={640}
      footer={<><span className="mr-auto self-center text-sm text-sub">Tanlandi: {sel.length} · {som(sel.reduce((a, i) => a + i.price, 0))}</span>
        <Button onClick={onClose}>Bekor qilish</Button>
        <Button variant="primary" disabled={!sel.length} onClick={() => onPick(sel.map((item) => ({ item, tooth })))}>Qo‘shish</Button></>}>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Qidirish: nomi yoki kodi" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {withTooth && <Input className="!w-28" placeholder="Tish №" value={tooth} onChange={(e) => setTooth(e.target.value)} aria-label="Tish raqami" />}
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {(cats.data ?? []).map((c) => {
          const its = filtered.filter((i) => i.category_id === c.id);
          if (!its.length) return null;
          return (
            <div key={c.id} className="mb-2">
              <div className="sticky top-0 bg-white py-1 text-xs font-semibold tracking-wide text-sub uppercase">{c.name}</div>
              {its.map((i) => {
                const on = sel.some((x) => x.id === i.id);
                return (
                  <label key={i.id} className={cx('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted', on && 'bg-primary-soft/60')}>
                    <input type="checkbox" checked={on} onChange={() => setSel(on ? sel.filter((x) => x.id !== i.id) : [...sel, i])} />
                    <span className="flex-1">{i.name}{i.code && <span className="ml-1 text-xs text-faint">{i.code}</span>}</span>
                    <span className="text-sub">{money(i.price)}</span>
                  </label>
                );
              })}
            </div>
          );
        })}
        {items.data?.length === 0 && <Empty>Prays bo‘sh. Sozlamalar → Prays bo‘limida xizmatlarni qo‘shing.</Empty>}
      </div>
    </Modal>
  );
}

// ---------------- Fayllar ----------------
function FilesTab({ p }: { p: Patient }) {
  const { can } = useOrg();
  const files = useList<RecordFile>('record_files', { patient_id: p.id });
  const [kind, setKind] = useState('xray');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<RecordFile | null>(null);
  const del = useAction((id: string) => http.del(`/api/files/${id}`), { invalidate: ['record_files'], onDone: () => setView(null) });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        const fd = new FormData();
        fd.append('patient_id', p.id); fd.append('kind', kind); fd.append('file', f);
        await http.post('/api/files', fd);
      }
      toast.success('Yuklandi');
      await files.refetch();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      {can('patients.edit') && (
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-40" aria-label="Fayl turi">
            <option value="xray">Rentgen</option><option value="image">Rasm</option><option value="audio">Ovozli izoh</option><option value="file">Hujjat</option>
          </Select>
          <label className={cx('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-sm font-medium text-white hover:bg-primary-hover', busy && 'opacity-60')}>
            <Upload size={15} /> {busy ? 'Yuklanmoqda…' : 'Fayl yuklash'}
            <input type="file" multiple className="hidden" disabled={busy} accept="image/*,audio/*,application/pdf" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          </label>
          <span className="text-xs text-sub">Rasm, PDF yoki audio, har biri 25 MB gacha</span>
        </Card>
      )}
      {files.data?.length === 0 && <Card><Empty>Hozircha fayl yo‘q</Empty></Card>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(files.data ?? []).map((f) => (
          <button key={f.id} type="button" onClick={() => setView(f)} className="overflow-hidden rounded-xl border border-line bg-white text-left hover:shadow-pop">
            {f.mime?.startsWith('image/')
              ? <img src={`/api/files/${f.id}`} alt={f.name ?? ''} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
              : <div className="grid aspect-square place-items-center bg-muted text-sub"><FileText size={32} /></div>}
            <div className="truncate px-2 py-1.5 text-xs">{f.kind === 'xray' ? 'Rentgen' : f.name} · {dmy(f.created_at)}</div>
          </button>
        ))}
      </div>
      {view && (
        <Modal open onClose={() => setView(null)} title={view.name ?? 'Fayl'} width={900}
          footer={<>{can('patients.edit') && <Button variant="danger" className="mr-auto" onClick={() => del.mutate(view.id)}><Trash2 size={15} /> O‘chirish</Button>}
            <a href={`/api/files/${view.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-[10px] border border-line px-3.5 text-sm no-underline">Yangi oynada ochish</a></>}>
          {view.mime?.startsWith('image/') ? <img src={`/api/files/${view.id}`} alt="" className="max-h-[70vh] w-full object-contain" />
            : view.mime?.startsWith('audio/') ? <audio controls src={`/api/files/${view.id}`} className="w-full" />
            : <iframe title="Fayl" src={`/api/files/${view.id}`} className="h-[70vh] w-full rounded-lg border border-line" />}
        </Modal>
      )}
    </div>
  );
}

// ---------------- Moliya: aktlar va to'lovlar ----------------
interface Move { id: string; kind: string; amount: number; cashbox_id: string; moved_at: string; note: string | null; act_id: string | null; doctor_id: string | null; created_by: string | null }
type FinSub = 'all' | 'works' | 'pays' | 'acts';

function FinanceTab({ p, s, openPay, payDoctor, onQuickAct, onBook }: { p: Patient; s: Summary; openPay?: boolean; payDoctor?: string | null; onQuickAct: () => void; onBook: () => void }) {
  const { can, branch, me, memberName, branches, org } = useOrg();
  const acts = useList<Act>('acts', { patient_id: p.id });
  const actIds = (acts.data ?? []).map((a) => a.id);
  const items = useList<ActItem>('act_items', { 'act_id.in': actIds }, { enabled: actIds.length > 0 });
  const moves = useList<Move>('money_moves', { patient_id: p.id }, { enabled: can('cashbox.view') });
  const boxes = useList<Cashbox>('cashboxes', { archived: false });
  const bmap = byId(branches), cbmap = byId(boxes.data);
  const [sub, setSub] = useState<FinSub>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [pay, setPay] = useState<{ act?: string; refund?: boolean } | null>(openPay ? {} : null);
  const [closing, setClosing] = useState<Act | null>(null);
  const [cancel, setCancel] = useState<Act | null>(null);
  const [delMove, setDelMove] = useState<Move | null>(null);

  const newAct = useAction(() => db.insert<Act>('acts', { branch_id: branch.id, patient_id: p.id, doctor_id: me.role === 'doctor' || me.role === 'owner' ? me.user_id : null }),
    { invalidate: ['acts'], onDone: (a) => setAddTo(a.id) });
  const addItems = useAction(({ act, list }: { act: string; list: { item: PriceItem; tooth: string }[] }) =>
    db.insertMany('act_items', list.map((x) => ({ act_id: act, price_item_id: x.item.id, name: x.item.name, tooth: x.tooth || null, price: x.item.price, qty: 1 }))),
  { invalidate: ['act_items'], onDone: () => setAddTo(null) });
  const updItem = useAction(({ id, patch }: { id: string; patch: Record<string, unknown> }) => db.update('act_items', id, patch), { invalidate: ['act_items'] });
  const delItem = useAction((id: string) => db.remove('act_items', id), { invalidate: ['act_items'] });
  const doCancel = useAction((a: Act) => http.post(`/api/acts/${a.id}/cancel`), { invalidate: ['acts', 'patients', 'stock_balances', 'patient-history'], success: 'Akt bekor qilindi', onDone: () => setCancel(null) });
  const doDelMove = useAction((m: Move) => db.remove('money_moves', m.id), { invalidate: ['money_moves', 'patients', 'cash'], success: 'To‘lov bekor qilindi', onDone: () => setDelMove(null) });
  const edit = can('patients.edit', branch.id);
  const cash = can('cashbox.edit', branch.id);
  const debt = s.billed - s.paid;
  const itemsOf = (id: string) => (items.data ?? []).filter((i) => i.act_id === id);
  const totalOf = (a: Act) => itemsOf(a.id).reduce((x, i) => x + i.qty * i.price, 0) - a.discount;

  // Kun bo'yicha qatorlar: chapda shu kungi aktlar, o'ngda to'lovlar; balans — kun oxiridagi qatorda.
  const ledger = useMemo(() => {
    const days = new Map<string, { acts: Act[]; pays: Move[] }>();
    const day = (k: string) => { const v = days.get(k) ?? { acts: [], pays: [] }; days.set(k, v); return v; };
    for (const a of acts.data ?? []) if (a.status !== 'draft') day(a.act_date).acts.push(a);
    for (const m of moves.data ?? []) day(isoDate(new Date(m.moved_at))).pays.push(m);
    let bal = 0;
    return [...days.entries()].sort((x, y) => x[0].localeCompare(y[0])).flatMap(([d, g]) => {
      g.acts.sort((x, y) => (x.created_at ?? '').localeCompare(y.created_at ?? ''));
      g.pays.sort((x, y) => x.moved_at.localeCompare(y.moved_at));
      bal += g.pays.reduce((x, m) => x + (m.kind === 'refund' ? -m.amount : m.amount), 0) - g.acts.reduce((x, a) => x + (a.status === 'closed' ? totalOf(a) : 0), 0);
      const n = Math.max(g.acts.length, g.pays.length);
      return Array.from({ length: n }, (_, i) => ({ key: `${d}-${i}`, a: g.acts[i] ?? null, m: g.pays[i] ?? null, bal: i === n - 1 ? bal : null }));
    });
  }, [acts.data, moves.data, items.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const printAct = (a: Act) => printDoc(`Akt · ${dmy(a.act_date)}`, `
    <h1>Bajarilgan ishlar akti</h1>
    <p>${esc(org.name)} · ${esc(bmap.get(a.branch_id)?.name ?? '')}<br>Sana: <b>${dmy(a.act_date)}</b></p>
    <p>Bemor: <b>${esc(p.full_name)}</b>${p.card_number ? ` · №${esc(p.card_number)}` : ''}<br>Shifokor: ${esc(memberName(a.doctor_id))}</p>
    <table><tr><th>#</th><th>Xizmat</th><th>Tish</th><th>Soni</th><th>Narx</th><th>Summa</th></tr>
    ${itemsOf(a.id).map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${esc(i.tooth ?? '')}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td></tr>`).join('')}
    ${a.discount ? `<tr><td colspan="5">Chegirma</td><td>−${money(a.discount)}</td></tr>` : ''}
    <tr class="tot"><td colspan="5">Jami</td><td>${money(totalOf(a))} so‘m</td></tr></table>
    <div class="sign"><span>Shifokor: ____________</span><span>Bemor: ____________</span></div>`);
  const printMove = (m: Move) => printDoc(`To‘lov · ${dmy(m.moved_at)}`, `
    <h1>${m.kind === 'refund' ? 'Pul qaytarildi' : 'To‘lov cheki'}</h1>
    <p>${esc(org.name)}<br>${dmyhm(m.moved_at)}</p>
    <p>Bemor: <b>${esc(p.full_name)}</b>${p.card_number ? ` · №${esc(p.card_number)}` : ''}</p>
    <table><tr><td>Summa</td><td><b>${money(m.amount)} so‘m</b></td></tr><tr><td>To‘lov turi</td><td>${esc(cbmap.get(m.cashbox_id)?.name ?? '')}</td></tr>
    ${m.doctor_id ? `<tr><td>Shifokor</td><td>${esc(memberName(m.doctor_id))}</td></tr>` : ''}${m.note ? `<tr><td>Izoh</td><td>${esc(m.note)}</td></tr>` : ''}
    <tr><td>Qabul qildi</td><td>${esc(memberName(m.created_by))}</td></tr></table>
    <p class="muted">Bemor balansi: ${debt > 0 ? `qarz ${money(debt)}` : debt < 0 ? `avans ${money(-debt)}` : '0'} so‘m</p>`);

  const IC = 'grid h-[26px] w-[26px] flex-none place-items-center rounded-[3px] text-white';
  const HC = 'border border-line bg-white px-3 py-2.5 font-normal';
  const CELL = 'border border-line bg-white px-3 py-2';
  const SUBS: [FinSub, string][] = [['all', 'To‘lovlar va aktlar'], ['works', 'Bajarilgan ishlar'], ['pays', 'To‘lovlar'], ['acts', 'Aktlar']];
  const closedItems = (acts.data ?? []).filter((a) => a.status === 'closed').flatMap((a) => itemsOf(a.id).map((i) => ({ a, i })))
    .sort((x, y) => y.a.act_date.localeCompare(x.a.act_date));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {edit && <button type="button" onClick={onQuickAct} className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-primary px-3.5 text-[15px] text-white hover:bg-primary-hover"><Zap size={17} /> Tezkor akt yaratish</button>}
        {cash && <button type="button" onClick={() => setPay({})} className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-ok px-3.5 text-[15px] text-white hover:opacity-90"><ArrowDownToLine size={17} /> To‘lov qabul qilish</button>}
        {cash && <button type="button" onClick={() => setPay({ refund: true })} aria-label="Pulni qaytarish" title="Pulni qaytarish" className="grid h-10 w-11 place-items-center rounded-[3px] bg-bad text-white hover:opacity-90"><ArrowUpFromLine size={18} /></button>}
        <div role="tablist" className="flex overflow-x-auto rounded-[3px] border border-line bg-white [scrollbar-width:none]">
          {SUBS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
              className={cx('h-10 flex-none border-r border-line px-3.5 text-[15px] whitespace-nowrap last:border-r-0', sub === k ? 'bg-muted text-fg' : 'text-[#3d4858] hover:bg-surface')}>{l}</button>
          ))}
        </div>
        {can('schedule.edit', branch.id) && <button type="button" onClick={onBook} className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-primary px-3.5 text-[15px] text-white hover:bg-primary-hover"><CalendarPlus size={17} /> Qabulga yozish</button>}
        <span className={cx('ml-auto text-[15px]', debt > 0 ? 'text-bad' : debt < 0 ? 'text-ok' : 'text-sub')}>
          {debt > 0 ? `Qarz: ${money(debt)}` : debt < 0 ? `Avans: ${money(-debt)}` : 'Balans: 0'}
        </span>
      </div>

      {sub === 'all' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[15px]">
            <thead><tr className="text-left text-lg font-normal text-[#3d4858]">
              <th className={HC} colSpan={2}>Bajarilgan ishlar aktlari <Info size={13} className="inline align-baseline text-faint" /></th>
              <th className={cx(HC, 'w-[1%] text-center')}><FolderOpen size={17} className="inline text-sub" /></th>
              <th className="w-2" />
              <th className={HC} colSpan={2}>To‘lovlar <Info size={13} className="inline align-baseline text-faint" /></th>
              <th className={cx(HC, 'w-[1%]')} />
              <th className="w-2" />
              <th className={cx(HC, 'w-40')}>Balans <Info size={13} className="inline align-baseline text-faint" /></th>
            </tr></thead>
            <tbody>
              {ledger.length === 0 && <tr><td colSpan={9} className="border border-line bg-white p-8 text-center text-sub">Hali akt va to‘lov yo‘q</td></tr>}
              {ledger.map(({ key, a, m, bal }) => [
                <tr key={key}>
                  {a ? <>
                    <td className={cx(CELL, 'w-28', a.status === 'cancelled' && 'text-faint line-through')}>{dmy(a.act_date)}</td>
                    <td className={cx(CELL, 'text-right tabular-nums', a.status === 'cancelled' && 'text-faint line-through')}>{money(totalOf(a))}</td>
                    <td className={cx(CELL, 'px-2')}>
                      <span className="flex gap-1">
                        <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} aria-label="Aktni ochish" title="Ishlar ro‘yxati" className={cx(IC, 'bg-primary')}><FolderOpen size={13} /></button>
                        <button type="button" onClick={() => printAct(a)} aria-label="Aktni chop etish" title="Chop etish" className={cx(IC, 'bg-primary')}><Printer size={13} /></button>
                        <span title={`Shifokor: ${memberName(a.doctor_id)}`} className={cx(IC, 'bg-primary')}><UserRound size={13} /></span>
                        {a.status === 'closed' && can('patients.edit', a.branch_id)
                          ? <button type="button" onClick={() => setCancel(a)} aria-label="Aktni bekor qilish" title="Bekor qilish" className={cx(IC, 'bg-bad')}><Trash2 size={13} /></button>
                          : <span className={cx(IC, 'bg-bad opacity-30')}><Trash2 size={13} /></span>}
                      </span>
                    </td>
                  </> : <><td /><td /><td /></>}
                  <td />
                  {m ? <>
                    <td className={cx(CELL, 'w-28')} title={cbmap.get(m.cashbox_id)?.name ?? ''}>{dmy(m.moved_at)}</td>
                    <td className={cx(CELL, 'text-right tabular-nums', m.kind === 'refund' && 'text-bad')}>{m.kind === 'refund' ? '−' : ''}{money(m.amount)}</td>
                    <td className={cx(CELL, 'px-2')}>
                      <span className="flex gap-1">
                        <button type="button" onClick={() => printMove(m)} aria-label="Chekni chop etish" title="Chek" className={cx(IC, 'bg-primary')}><Printer size={13} /></button>
                        <span title={`${cbmap.get(m.cashbox_id)?.name ?? ''} · ${m.doctor_id ? memberName(m.doctor_id) : 'shifokor ko‘rsatilmagan'}`} className={cx(IC, 'bg-primary')}><UserRound size={13} /></span>
                        {cash ? <button type="button" onClick={() => setDelMove(m)} aria-label="To‘lovni bekor qilish" title="Bekor qilish" className={cx(IC, 'bg-bad')}><Trash2 size={13} /></button>
                          : <span className={cx(IC, 'bg-bad opacity-30')}><Trash2 size={13} /></span>}
                      </span>
                    </td>
                  </> : <><td /><td /><td /></>}
                  <td />
                  <td className={cx(CELL, 'text-right tabular-nums', bal !== null && bal < 0 && 'text-bad', bal !== null && bal > 0 && 'text-ok')}>{bal !== null ? money(bal) : ''}</td>
                </tr>,
                a && open === a.id && (
                  <tr key={`${key}-x`}>
                    <td colSpan={3} className="border border-t-0 border-line bg-surface px-4 py-2">
                      {itemsOf(a.id).map((i) => (
                        <div key={i.id} className="flex justify-between gap-3 py-0.5 text-[13px]"><span>{i.tooth && <b className="mr-1 font-medium">№{i.tooth} —</b>}{i.name}{i.qty > 1 && ` × ${i.qty}`}</span><span className="tabular-nums">{money(i.qty * i.price)}</span></div>
                      ))}
                      <div className="mt-1 text-xs text-sub">{memberName(a.doctor_id)} · {bmap.get(a.branch_id)?.name ?? ''}{a.discount ? ` · chegirma ${money(a.discount)}` : ''}</div>
                    </td>
                    <td colSpan={6} />
                  </tr>
                ),
              ])}
              <tr className="text-[17px]">
                <td colSpan={3} className="pt-4 pr-3 text-right">Bajarildi: <b className="font-semibold">{money(s.billed)}</b></td>
                <td />
                <td colSpan={3} className="pt-4 pr-3 text-right">To‘landi: <b className="font-semibold">{money(s.paid)}</b></td>
                <td />
                <td className={cx('pt-4 pr-3 text-right font-semibold whitespace-nowrap', debt > 0 ? 'text-bad' : debt < 0 ? 'text-ok' : 'text-sub')}>{debt > 0 ? `Qarz: ${money(debt)}` : debt < 0 ? `Avans: ${money(-debt)}` : 'Balans: 0'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {sub === 'works' && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-muted text-left text-xs font-semibold text-sub"><tr>{['Sana', 'Xizmat', 'Tish', 'Shifokor', 'Soni', 'Summa'].map((h) => <th key={h} className={cx('px-3 py-2', (h === 'Soni' || h === 'Summa') && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>
              {closedItems.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sub">Bajarilgan ishlar yo‘q</td></tr>}
              {closedItems.map(({ a, i }) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-3 py-2 whitespace-nowrap">{dmy(a.act_date)}</td><td className="px-3 py-2">{i.name}</td><td className="px-3 py-2">{i.tooth ?? ''}</td>
                  <td className="px-3 py-2">{memberName(a.doctor_id)}</td><td className="px-3 py-2 text-right">{i.qty}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{money(i.qty * i.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {sub === 'pays' && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-muted text-left text-xs font-semibold text-sub"><tr>{['Sana', 'Turi', 'Kassa', 'Shifokor', 'Izoh', 'Summa', ''].map((h, n) => <th key={n} className={cx('px-3 py-2', h === 'Summa' && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody>
              {(moves.data ?? []).length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sub">To‘lovlar yo‘q</td></tr>}
              {(moves.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-3 py-2 whitespace-nowrap">{dmyhm(m.moved_at)}</td>
                  <td className="px-3 py-2">{m.kind === 'refund' ? 'Qaytarish' : 'To‘lov'}</td>
                  <td className="px-3 py-2">{cbmap.get(m.cashbox_id)?.name ?? '—'}</td>
                  <td className="px-3 py-2">{m.doctor_id ? memberName(m.doctor_id) : <span className="text-faint">—</span>}</td>
                  <td className="px-3 py-2 text-sub">{m.note}</td>
                  <td className={cx('px-3 py-2 text-right font-semibold tabular-nums', m.kind === 'refund' ? 'text-bad' : 'text-ok')}>{m.kind === 'refund' ? '−' : '+'}{money(m.amount)}</td>
                  <td className="px-2 py-1.5"><span className="flex justify-end gap-1">
                    <button type="button" onClick={() => printMove(m)} aria-label="Chekni chop etish" className={cx(IC, 'bg-primary')}><Printer size={14} /></button>
                    {cash && <button type="button" onClick={() => setDelMove(m)} aria-label="To‘lovni bekor qilish" className={cx(IC, 'bg-bad')}><Trash2 size={14} /></button>}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {sub === 'acts' && <>
        {edit && <div><Button variant="primary" size="sm" loading={newAct.isPending} onClick={() => newAct.mutate(undefined)}><Plus size={15} /> Bajarilgan ish (akt)</Button></div>}
        {(acts.data ?? []).length === 0 && <Card><Empty>Bajarilgan ishlar yo‘q</Empty></Card>}
        {(acts.data ?? []).map((a) => {
          const its = itemsOf(a.id);
          const total = totalOf(a);
          const draft = a.status === 'draft';
          const mine = can('patients.edit', a.branch_id);
          return (
            <Card key={a.id} className={cx('p-4', a.status === 'cancelled' && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Akt · {dmy(a.act_date)}</span>
                <Badge tone={draft ? 'amber' : a.status === 'closed' ? 'green' : 'gray'}>{draft ? 'Ochiq' : a.status === 'closed' ? 'Yopilgan' : 'Bekor qilingan'}</Badge>
                <span className="text-xs text-sub">{memberName(a.doctor_id)} · {bmap.get(a.branch_id)?.name ?? 'Boshqa filial'}</span>
                <span className="ml-auto text-base font-semibold">{som(total)}</span>
              </div>
              <div className="mt-2">
                {its.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 border-t border-line py-1.5 text-sm">
                    <span className="flex-1">{i.tooth && <b className="mr-1 font-medium">№{i.tooth} —</b>}{i.name}</span>
                    {draft && mine ? <>
                      <input type="number" min={1} defaultValue={i.qty} aria-label="Soni" onBlur={(e) => Number(e.target.value) !== i.qty && updItem.mutate({ id: i.id, patch: { qty: Math.max(1, Number(e.target.value) || 1) } })} className="h-7 w-14 rounded-md border border-line px-1.5 text-right" />
                      <input type="number" min={0} defaultValue={i.price} aria-label="Narx" onBlur={(e) => Number(e.target.value) !== i.price && updItem.mutate({ id: i.id, patch: { price: Math.max(0, Number(e.target.value) || 0) } })} className="h-7 w-28 rounded-md border border-line px-1.5 text-right" />
                      <button type="button" aria-label="O‘chirish" onClick={() => delItem.mutate(i.id)} className="text-faint hover:text-bad"><X size={14} /></button>
                    </> : <span className="text-sub">{i.qty > 1 && `${i.qty} × `}{money(i.price)}</span>}
                  </div>
                ))}
                {a.discount > 0 && <div className="flex justify-between border-t border-line py-1.5 text-sm text-sub"><span>Chegirma</span><span>−{money(a.discount)}</span></div>}
              </div>
              {mine && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">
                  {draft && <Button size="sm" onClick={() => setAddTo(a.id)}><Plus size={14} /> Xizmat</Button>}
                  {draft && <DiscountInput act={a} />}
                  {draft && <Button size="sm" variant="primary" disabled={!its.length} onClick={() => setClosing(a)}><Lock size={14} /> Aktni yopish</Button>}
                  {a.status === 'closed' && cash && total > 0 && <Button size="sm" onClick={() => setPay({ act: a.id })}><Wallet size={14} /> To‘lov</Button>}
                  {a.status === 'closed' && <Button size="sm" variant="ghost" onClick={() => printAct(a)}><Printer size={14} /> Chop etish</Button>}
                  {a.status !== 'cancelled' && <Button size="sm" variant="ghost" className="ml-auto text-sub" onClick={() => setCancel(a)}>{draft ? 'O‘chirish' : 'Bekor qilish'}</Button>}
                </div>
              )}
            </Card>
          );
        })}
      </>}

      {addTo && <ServicePicker withTooth onClose={() => setAddTo(null)} onPick={(list) => addItems.mutate({ act: addTo, list })} />}
      {pay && <PaymentModal patient={p} actId={pay.act} refund={pay.refund} defaultAmount={pay.refund ? 0 : Math.max(debt, 0)}
        doctorId={pay.act ? (acts.data ?? []).find((a) => a.id === pay.act)?.doctor_id ?? null : payDoctor ?? [...(acts.data ?? [])].filter((a) => a.status === 'closed').sort((x, y) => y.act_date.localeCompare(x.act_date))[0]?.doctor_id ?? null}
        onClose={() => setPay(null)} />}
      {closing && <CloseActModal act={closing} onClose={() => setClosing(null)} />}
      <Confirm open={!!cancel} danger yes={cancel?.status === 'draft' ? 'O‘chirish' : 'Bekor qilish'}
        text={cancel?.status === 'draft' ? 'Ochiq aktni o‘chirasizmi?' : 'Yopilgan akt bekor qilinadi, u bo‘yicha chiqarilgan materiallar omborga qaytariladi. Davom etasizmi?'}
        onNo={() => setCancel(null)} onYes={() => cancel && doCancel.mutate(cancel)} loading={doCancel.isPending} />
      <Confirm open={!!delMove} danger yes="Bekor qilish" loading={doDelMove.isPending} onNo={() => setDelMove(null)} onYes={() => delMove && doDelMove.mutate(delMove)}
        text={delMove ? `${dmy(delMove.moved_at)} dagi ${money(delMove.amount)} so‘m ${delMove.kind === 'refund' ? 'qaytarish' : 'to‘lov'} bekor qilinsinmi? Kassa qoldig‘i ham o‘zgaradi.` : ''} />
    </div>
  );
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** Chop etish uchun alohida oynada oddiy hujjat (akt yoki chek) ochiladi. */
function printDoc(title: string, body: string) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) { toast.error('Brauzer yangi oynani blokladi — ruxsat bering'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:28px}
    h1{font-size:20px;margin:0 0 12px}p{margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:10px 0}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f4f6}td:last-child{text-align:right}
    .tot td{font-weight:700}.sign{display:flex;justify-content:space-between;margin-top:40px}.muted{color:#555;font-size:12px}
    @media print{body{margin:10mm}}</style></head><body>${body}<script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

function DiscountInput({ act }: { act: Act }) {
  const upd = useAction((v: number) => db.update('acts', act.id, { discount: v }), { invalidate: ['acts', 'patients'] });
  return (
    <label className="flex items-center gap-1.5 text-sm text-sub">Chegirma
      <input type="number" min={0} defaultValue={act.discount} onBlur={(e) => Number(e.target.value) !== act.discount && upd.mutate(Math.max(0, Number(e.target.value) || 0))}
        className="h-7 w-28 rounded-md border border-line px-1.5 text-right" /> so‘m</label>
  );
}

function CloseActModal({ act, onClose }: { act: Act; onClose: () => void }) {
  const { branch } = useOrg();
  const whs = useList<Warehouse>('warehouses', { branch_id: act.branch_id, archived: false });
  const [wh, setWh] = useState(act.warehouse_id ?? '');
  const shortage = useQuery({ queryKey: ['acts', 'shortage', act.id, wh], queryFn: () => http.get<{ name: string; unit: string; need: number; have: number }[]>(`/api/acts/${act.id}/shortage`) });
  const close = useAction(async () => {
    if (wh !== (act.warehouse_id ?? '')) await db.update('acts', act.id, { warehouse_id: wh || null });
    return http.post<{ stock_doc_id: string | null }>(`/api/acts/${act.id}/close`);
  }, { invalidate: ['acts', 'patients', 'stock_balances', 'stock_docs'], success: 'Akt yopildi', onDone: onClose });
  const main = useMemo(() => whs.data?.find((w) => w.is_main), [whs.data]);
  return (
    <Modal open onClose={onClose} title="Aktni yopish" width={480}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={close.isPending} onClick={() => close.mutate(undefined)}>Yopish</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="m-0 text-sub">Akt yopilgach, xizmatlarni o‘zgartirib bo‘lmaydi. Kalkulyatsiya kartasi bor xizmatlar uchun materiallar ombordan avtomatik chiqariladi.</p>
        <Field label="Material qaysi ombordan chiqsin">{(id) => (
          <Select id={id} value={wh} onChange={(e) => setWh(e.target.value)}>
            <option value="">{main ? `${main.name} (asosiy)` : 'Asosiy ombor'}</option>
            {(whs.data ?? []).filter((w) => !w.is_main).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>)}
        </Field>
        {act.branch_id !== branch.id && <p className="m-0 text-xs text-warn">Bu akt boshqa filialga tegishli.</p>}
        {(shortage.data ?? []).length > 0 && (
          <div className="rounded-xl border border-warn-soft bg-[#fffbeb] p-3 text-[13px] text-warn">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Omborda yetarli material yo‘q</div>
            {shortage.data!.map((x) => <div key={x.name}>{x.name}: kerak {x.need} {x.unit}, bor {x.have} {x.unit}</div>)}
            <div className="mt-1">Baribir yopsangiz, qoldiq manfiy bo‘ladi.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function PaymentModal({ patient, actId, refund, defaultAmount, doctorId, onClose }: { patient: Patient; actId?: string; refund?: boolean; defaultAmount: number; doctorId?: string | null; onClose: () => void }) {
  const { branch, members } = useOrg();
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role));
  const [doc, setDoc] = useState(doctorId ?? '');
  const boxes = useList<Cashbox>('cashboxes', { branch_id: branch.id, archived: false });
  const [box, setBox] = useState('');
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [note, setNote] = useState('');
  const save = useAction(() => {
    const cb = box || boxes.data?.[0]?.id;
    if (!cb) throw new Error('Kassa yo‘q');
    if (!(Number(amount) > 0)) throw new Error('Summani kiriting');
    return db.insert('money_moves', { kind: refund ? 'refund' : 'income', cashbox_id: cb, amount: Math.round(Number(amount)), patient_id: patient.id, act_id: actId ?? null, doctor_id: doc || null, note });
  }, { invalidate: ['money_moves', 'patients', 'cash'], success: refund ? 'Pul qaytarildi' : 'To‘lov qabul qilindi', onDone: onClose });
  return (
    <Modal open onClose={onClose} title={refund ? 'Pulni qaytarish' : 'To‘lov qabul qilish'} width={440}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="text-sm"><span className="text-sub">Bemor:</span> <b className="font-medium">{patient.full_name}</b></div>
        <div className="flex flex-wrap gap-1.5">
          {(boxes.data ?? []).map((b) => (
            <button key={b.id} type="button" onClick={() => setBox(b.id)} aria-pressed={(box || boxes.data?.[0]?.id) === b.id}
              className={cx('h-9 rounded-[10px] border px-3 text-sm', (box || boxes.data?.[0]?.id) === b.id ? 'border-primary bg-primary-soft font-medium' : 'border-line bg-white hover:bg-muted')}>
              {b.name}
            </button>
          ))}
        </div>
        <Field label="Summa, so‘m">{(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</Field>
        {defaultAmount > 0 && !refund && <span className="-mt-1.5 text-xs text-sub">Bemor qarzi: {som(defaultAmount)} — summa avtomatik qo‘yildi</span>}
        {!refund && (
          <Field label="Shifokor (pul kimga yoziladi)">{(id) => (
            <Select id={id} value={doc} onChange={(e) => setDoc(e.target.value)}>
              <option value="">— Tanlanmagan</option>
              {doctors.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </Select>
          )}</Field>
        )}
        <Field label="Izoh">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
