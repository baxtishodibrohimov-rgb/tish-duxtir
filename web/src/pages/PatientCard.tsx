import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarPlus, Pencil, Plus, Trash2, Upload, FileText, Lock, Wallet, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { ageOf, dmy, dmyhm, hm, initials, money, phoneFmt, som, WEEKDAYS } from '@/lib/format';
import { Link, useQueryParam, useTitle } from '@/lib/router';
import type { Act, ActItem, Cashbox, Patient, PatientStatus, PriceCategory, PriceItem, RecordFile, TreatmentRecord, Visit, Warehouse } from '@/lib/types';
import { PatientForm } from '@/components/PatientForm';
import { Badge, Button, Card, Confirm, Empty, ErrorBox, Field, Input, Modal, PageLoader, Select, Textarea, UnderTabs, cx } from '@/components/ui';
import { VISIT_STATUS } from './Schedule';

type Tab = 'info' | 'visits' | 'plans' | 'history' | 'files' | 'finance';
const TABS: { key: Tab; label: string }[] = [
  { key: 'info', label: 'Ma’lumotlar' }, { key: 'visits', label: 'Vizitlar' }, { key: 'plans', label: 'Davolash rejasi' },
  { key: 'history', label: 'Kasallik tarixi' }, { key: 'files', label: 'Rentgen va fayllar' }, { key: 'finance', label: 'Moliya' },
];

interface Summary { patient: Patient; billed: number; paid: number; last_visit: string | null; next_visit: string | null }

export function PatientCard({ id }: { id: string }) {
  const [tab, setTab] = useQueryParam<Tab>('tab', 'visits');
  const [editing, setEditing] = useState(false);
  const { can } = useOrg();
  const sum = useQuery({ queryKey: ['patients', 'summary', id], queryFn: () => http.get<Summary>(`/api/patients/${id}/summary`) });
  useTitle(sum.data?.patient.full_name ?? 'Bemor');

  if (sum.isLoading) return <PageLoader />;
  if (sum.error) return <ErrorBox error={sum.error} />;
  const p = sum.data!.patient;
  const debt = sum.data!.billed - sum.data!.paid;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4">
      <Link to="/patients" className="inline-flex items-center gap-1.5 self-start text-sm no-underline"><ArrowLeft size={15} /> Orqaga</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-sub">Karta № {p.card_number}</span>
          <h1 className={cx('m-0 text-[22px] font-semibold', p.important_info && 'text-[#b91c1c]')}>{p.full_name || 'Ismsiz'}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-sub">
            {p.phone && <a href={`tel:+${p.phone.replace(/\D/g, '')}`} className="text-fg no-underline">{phoneFmt(p.phone)}</a>}
            {p.birth_date && <span>{dmy(p.birth_date)} ({ageOf(p.birth_date)} yosh)</span>}
            {p.address && <span>{p.address}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {debt > 0 && <Badge tone="red">Qarz: {som(debt)}</Badge>}
          {debt < 0 && <Badge tone="green">Avans: {som(-debt)}</Badge>}
        </div>
      </div>
      {p.important_info && (
        <div className="flex items-start gap-2 rounded-xl border border-bad-soft bg-[#fff6f6] px-3 py-2 text-sm text-[#b91c1c]">
          <AlertTriangle size={16} className="mt-0.5 flex-none" /> {p.important_info}
        </div>
      )}
      <UnderTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'info' && <InfoTab p={p} s={sum.data!} onEdit={() => setEditing(true)} canEdit={can('patients.edit')} />}
      {tab === 'visits' && <VisitsTab p={p} />}
      {tab === 'plans' && <PlansTab p={p} />}
      {tab === 'history' && <HistoryTab p={p} />}
      {tab === 'files' && <FilesTab p={p} />}
      {tab === 'finance' && <FinanceTab p={p} s={sum.data!} />}
      {editing && <PatientForm patient={p} onClose={() => setEditing(false)} />}
    </div>
  );
}

function InfoTab({ p, s, onEdit, canEdit }: { p: Patient; s: Summary; onEdit: () => void; canEdit: boolean }) {
  const { branches } = useOrg();
  const statuses = useList<PatientStatus>('patient_statuses');
  const toggle = useAction((sid: string) => db.update('patients', p.id, {
    status_ids: p.status_ids.includes(sid) ? p.status_ids.filter((x) => x !== sid) : [...p.status_ids, sid],
  }), { invalidate: ['patients'] });
  const rows: [string, string][] = [
    ['Familiya, ism, sharif', p.full_name], ['Asosiy telefon', phoneFmt(p.phone)], ['Qo‘shimcha telefon', phoneFmt(p.phone2)],
    ['Tug‘ilgan sana', dmy(p.birth_date)], ['Jinsi', p.gender === 'male' ? 'Erkak' : p.gender === 'female' ? 'Ayol' : ''],
    ['Manzil', p.address ?? ''], ['Qayerdan bildi', p.source ?? ''], ['Kim yo‘lladi', p.referrer ?? ''],
    ['Birinchi filial', branches.find((b) => b.id === p.home_branch_id)?.name ?? ''], ['Ro‘yxatga olingan', dmy(p.created_at)],
    ['Oxirgi tashrif', s.last_visit ? dmyhm(s.last_visit) : ''], ['Keyingi tashrif', s.next_visit ? dmyhm(s.next_visit) : ''],
    ['Izoh', p.notes ?? ''],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-base font-semibold">Shaxsiy ma’lumotlar</h2>
          {canEdit && <Button size="sm" onClick={onEdit}><Pencil size={14} /> Tahrirlash</Button>}
        </div>
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-col"><dt className="text-xs text-sub">{k}</dt><dd className="m-0 text-sm">{v || '—'}</dd></div>
          ))}
        </dl>
      </Card>
      <Card className="p-5">
        <h2 className="m-0 mb-3 text-base font-semibold">Statuslar</h2>
        <div className="flex flex-wrap gap-1.5">
          {(statuses.data ?? []).map((st) => {
            const on = p.status_ids.includes(st.id);
            return (
              <button key={st.id} type="button" disabled={!canEdit} onClick={() => toggle.mutate(st.id)} aria-pressed={on}
                className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs', on ? 'border-transparent bg-nav font-medium' : 'border-line bg-white text-sub hover:bg-muted')}>
                <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />{st.name}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function VisitsTab({ p }: { p: Patient }) {
  const { branches, memberName } = useOrg();
  const visits = useList<Visit>('visits', { patient_id: p.id }, { order: 'starts_at desc' });
  const bmap = byId(branches);
  if (visits.isLoading) return <PageLoader />;
  const list = visits.data ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm text-sub">Jami: {list.length} ta tashrif</span>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm no-underline"><CalendarPlus size={15} /> Jadvalga yozish</Link>
      </div>
      {list.length === 0 ? <Empty>Tashriflar yo‘q</Empty> : list.map((v) => {
        const d = new Date(v.starts_at);
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: VISIT_STATUS[v.status].color }} title={VISIT_STATUS[v.status].label} />
            <span className="w-24 font-medium">{dmy(d)}</span>
            <span className="w-24 text-sub">{hm(v.starts_at)} – {hm(v.ends_at)}</span>
            <span className="w-24 text-sub">{WEEKDAYS[d.getDay()]}</span>
            <span className="min-w-[140px]">{memberName(v.doctor_id)}</span>
            <span className="text-sub">{bmap.get(v.branch_id)?.name ?? 'Boshqa filial'}</span>
            <span className="flex-1 truncate text-sub">{v.comment}</span>
            <Badge tone={v.status === 'completed' ? 'green' : v.status === 'no_show' ? 'red' : v.status === 'cancelled' ? 'gray' : 'blue'}>{VISIT_STATUS[v.status].label}</Badge>
          </div>
        );
      })}
    </Card>
  );
}

// ---------------- Davolash rejasi ----------------
interface Plan { id: string; patient_id: string; doctor_id: string | null; title: string; status: 'draft' | 'proposed' | 'accepted' | 'rejected'; discount_percent: number; created_at: string }
interface PlanItem { id: string; plan_id: string; price_item_id: string | null; name: string; tooth: string | null; qty: number; price: number }
const PLAN_ST: Record<Plan['status'], [string, 'gray' | 'blue' | 'green' | 'red']> = {
  draft: ['Qoralama', 'gray'], proposed: ['Taklif qilingan', 'blue'], accepted: ['Qabul qilingan', 'green'], rejected: ['Rad etilgan', 'red'],
};

function PlansTab({ p }: { p: Patient }) {
  const { can, me } = useOrg();
  const plans = useList<Plan>('treatment_plans', { patient_id: p.id });
  const ids = (plans.data ?? []).map((x) => x.id);
  const items = useList<PlanItem>('treatment_plan_items', { 'plan_id.in': ids }, { enabled: ids.length > 0 });
  const [adding, setAdding] = useState<string | null>(null);
  const create = useAction(() => db.insert('treatment_plans', { patient_id: p.id, doctor_id: me.user_id, title: `Reja ${(plans.data?.length ?? 0) + 1}` }), { invalidate: ['treatment_plans'] });
  const upd = useAction(({ id, patch }: { id: string; patch: Record<string, unknown> }) => db.update('treatment_plans', id, patch), { invalidate: ['treatment_plans'] });
  const delPlan = useAction((id: string) => db.remove('treatment_plans', id), { invalidate: ['treatment_plans'], success: 'O‘chirildi' });
  const delItem = useAction((id: string) => db.remove('treatment_plan_items', id), { invalidate: ['treatment_plan_items'] });
  const addItems = useAction(({ plan, list }: { plan: string; list: { item: PriceItem; tooth: string }[] }) =>
    db.insertMany('treatment_plan_items', list.map((x) => ({ plan_id: plan, price_item_id: x.item.id, name: x.item.name, tooth: x.tooth || null, price: x.item.price, qty: 1 }))),
  { invalidate: ['treatment_plan_items'], onDone: () => setAdding(null) });
  const edit = can('patients.edit');

  return (
    <div className="flex flex-col gap-3">
      {edit && <div><Button variant="primary" size="sm" onClick={() => create.mutate(undefined)}><Plus size={15} /> Yangi reja</Button></div>}
      {plans.data?.length === 0 && <Card><Empty>Davolash rejalari yo‘q</Empty></Card>}
      {(plans.data ?? []).map((pl) => {
        const its = (items.data ?? []).filter((i) => i.plan_id === pl.id);
        const total = its.reduce((a, i) => a + i.qty * i.price, 0);
        const final = Math.round(total * (1 - pl.discount_percent / 100));
        return (
          <Card key={pl.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input defaultValue={pl.title} disabled={!edit} aria-label="Reja nomi"
                onBlur={(e) => e.target.value !== pl.title && upd.mutate({ id: pl.id, patch: { title: e.target.value } })}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-base font-semibold hover:border-line focus:border-primary focus:outline-none" />
              <select value={pl.status} disabled={!edit} aria-label="Holati" onChange={(e) => upd.mutate({ id: pl.id, patch: { status: e.target.value } })}
                className="h-7 rounded-lg border border-line bg-white px-2 text-[13px]">
                {Object.entries(PLAN_ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
              </select>
              {edit && <button type="button" aria-label="Rejani o‘chirish" onClick={() => delPlan.mutate(pl.id)} className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-muted"><Trash2 size={15} /></button>}
            </div>
            <div className="mt-1 text-xs text-sub">{dmy(pl.created_at)} · {its.length} ta ish</div>
            <div className="mt-3 flex flex-col">
              {its.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 border-t border-line py-2 text-sm">
                  <span>{i.tooth && <b className="mr-1 font-medium">№{i.tooth} —</b>}{i.name}{i.qty > 1 && ` × ${i.qty}`}</span>
                  <span className="flex items-center gap-2">{money(i.qty * i.price)}
                    {edit && <button type="button" aria-label="O‘chirish" onClick={() => delItem.mutate(i.id)} className="text-faint hover:text-bad"><X size={14} /></button>}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              {edit ? <Button size="sm" onClick={() => setAdding(pl.id)}><Plus size={14} /> Xizmat qo‘shish</Button> : <span />}
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1 text-sub">Chegirma
                  <input type="number" min={0} max={100} defaultValue={pl.discount_percent} disabled={!edit}
                    onBlur={(e) => upd.mutate({ id: pl.id, patch: { discount_percent: Number(e.target.value) || 0 } })}
                    className="h-7 w-14 rounded-md border border-line px-1.5 text-right" />%</label>
                <span className="text-base font-semibold">{som(final)}</span>
              </div>
            </div>
          </Card>
        );
      })}
      {adding && <ServicePicker withTooth onClose={() => setAdding(null)} onPick={(list) => addItems.mutate({ plan: adding, list })} />}
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
        {withTooth && <Input className="w-28" placeholder="Tish №" value={tooth} onChange={(e) => setTooth(e.target.value)} aria-label="Tish raqami" />}
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

// ---------------- Kasallik tarixi ----------------
function HistoryTab({ p }: { p: Patient }) {
  const { can, me, branch, memberName } = useOrg();
  const recs = useList<TreatmentRecord>('treatment_records', { patient_id: p.id });
  const [f, setF] = useState({ tooth: '', diagnosis: '', description: '' });
  const [q, setQ] = useState('');
  const add = useAction(() => db.insert('treatment_records', { ...f, patient_id: p.id, doctor_id: me.user_id, branch_id: branch.id }),
    { invalidate: ['treatment_records'], success: 'Yozuv qo‘shildi', onDone: () => setF({ tooth: '', diagnosis: '', description: '' }) });
  const del = useAction((id: string) => db.remove('treatment_records', id), { invalidate: ['treatment_records'] });
  const list = (recs.data ?? []).filter((r) => !q || `${r.diagnosis} ${r.description} ${r.tooth}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      {can('patients.edit') && (
        <Card className="flex flex-col gap-2 p-4">
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <Input placeholder="Tish №" value={f.tooth} onChange={(e) => setF({ ...f, tooth: e.target.value })} aria-label="Tish raqami" />
            <Input placeholder="Tashxis (masalan: Pulpit)" value={f.diagnosis} onChange={(e) => setF({ ...f, diagnosis: e.target.value })} aria-label="Tashxis" />
          </div>
          <Textarea rows={2} placeholder="Nima qilindi, izoh…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} aria-label="Izoh" />
          <div className="flex justify-end"><Button variant="primary" size="sm" disabled={!f.diagnosis && !f.description} loading={add.isPending} onClick={() => add.mutate(undefined)}>Yozuv qo‘shish</Button></div>
        </Card>
      )}
      <Input type="search" placeholder="Tarixdan qidirish" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Qidirish" />
      {list.length === 0 && <Card><Empty>Yozuvlar yo‘q</Empty></Card>}
      {list.map((r) => (
        <Card key={r.id} className="flex gap-3 p-4">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-nav text-xs font-semibold">{initials(memberName(r.doctor_id))}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-semibold">{r.diagnosis || 'Yozuv'}</span>
            <span className="text-xs text-sub">{memberName(r.doctor_id)} · {dmyhm(r.created_at)}</span>
            <span className="text-sm whitespace-pre-wrap">{r.tooth && <b className="mr-1 font-medium">№{r.tooth}</b>}{r.description}</span>
          </div>
          {can('patients.edit') && <button type="button" aria-label="O‘chirish" onClick={() => del.mutate(r.id)} className="self-start text-faint hover:text-bad"><Trash2 size={15} /></button>}
        </Card>
      ))}
    </div>
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
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40" aria-label="Fayl turi">
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
interface Move { id: string; kind: string; amount: number; cashbox_id: string; moved_at: string; note: string | null; act_id: string | null; created_by: string | null }

function FinanceTab({ p, s }: { p: Patient; s: Summary }) {
  const { can, branch, me, memberName, branches } = useOrg();
  const acts = useList<Act>('acts', { patient_id: p.id });
  const actIds = (acts.data ?? []).map((a) => a.id);
  const items = useList<ActItem>('act_items', { 'act_id.in': actIds }, { enabled: actIds.length > 0 });
  const moves = useList<Move>('money_moves', { patient_id: p.id }, { enabled: can('cashbox.view') });
  const boxes = useList<Cashbox>('cashboxes', { archived: false });
  const bmap = byId(branches), cbmap = byId(boxes.data);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [pay, setPay] = useState<{ act?: string; refund?: boolean } | null>(null);
  const [closing, setClosing] = useState<Act | null>(null);
  const [cancel, setCancel] = useState<Act | null>(null);

  const newAct = useAction(() => db.insert<Act>('acts', { branch_id: branch.id, patient_id: p.id, doctor_id: me.role === 'doctor' || me.role === 'owner' ? me.user_id : null }),
    { invalidate: ['acts'], onDone: (a) => setAddTo(a.id) });
  const addItems = useAction(({ act, list }: { act: string; list: { item: PriceItem; tooth: string }[] }) =>
    db.insertMany('act_items', list.map((x) => ({ act_id: act, price_item_id: x.item.id, name: x.item.name, tooth: x.tooth || null, price: x.item.price, qty: 1 }))),
  { invalidate: ['act_items'], onDone: () => setAddTo(null) });
  const updItem = useAction(({ id, patch }: { id: string; patch: Record<string, unknown> }) => db.update('act_items', id, patch), { invalidate: ['act_items'] });
  const delItem = useAction((id: string) => db.remove('act_items', id), { invalidate: ['act_items'] });
  const doCancel = useAction((a: Act) => http.post(`/api/acts/${a.id}/cancel`), { invalidate: ['acts', 'patients', 'stock_balances'], success: 'Akt bekor qilindi', onDone: () => setCancel(null) });
  const edit = can('patients.edit', branch.id);
  const debt = s.billed - s.paid;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-sub">Qilingan ish</div><div className="mt-1 text-xl font-semibold">{som(s.billed)}</div></Card>
        <Card className="p-4"><div className="text-xs text-sub">To‘langan</div><div className="mt-1 text-xl font-semibold text-ok">{som(s.paid)}</div></Card>
        <Card className="p-4"><div className="text-xs text-sub">{debt >= 0 ? 'Qarz' : 'Avans'}</div><div className={cx('mt-1 text-xl font-semibold', debt > 0 && 'text-bad')}>{som(Math.abs(debt))}</div></Card>
      </div>
      <div className="flex flex-wrap gap-2">
        {edit && <Button variant="primary" size="sm" loading={newAct.isPending} onClick={() => newAct.mutate(undefined)}><Plus size={15} /> Bajarilgan ish (akt)</Button>}
        {can('cashbox.edit', branch.id) && <Button size="sm" onClick={() => setPay({})}><Wallet size={15} /> To‘lov qabul qilish</Button>}
        {can('cashbox.edit', branch.id) && <Button size="sm" variant="ghost" onClick={() => setPay({ refund: true })}>Pulni qaytarish</Button>}
      </div>

      {(acts.data ?? []).length === 0 && <Card><Empty>Bajarilgan ishlar yo‘q</Empty></Card>}
      {(acts.data ?? []).map((a) => {
        const its = (items.data ?? []).filter((i) => i.act_id === a.id);
        const total = its.reduce((x, i) => x + i.qty * i.price, 0) - a.discount;
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
                {a.status === 'closed' && can('cashbox.edit', branch.id) && total > 0 && <Button size="sm" onClick={() => setPay({ act: a.id })}><Wallet size={14} /> To‘lov</Button>}
                {a.status !== 'cancelled' && <Button size="sm" variant="ghost" className="ml-auto text-sub" onClick={() => setCancel(a)}>{draft ? 'O‘chirish' : 'Bekor qilish'}</Button>}
              </div>
            )}
          </Card>
        );
      })}

      {can('cashbox.view') && (moves.data ?? []).length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 font-semibold">To‘lovlar</div>
          {(moves.data ?? []).map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-x-4 border-b border-line px-4 py-2 text-sm last:border-b-0">
              <span className="w-36 text-sub">{dmyhm(m.moved_at)}</span>
              <span className="w-32">{cbmap.get(m.cashbox_id)?.name ?? '—'}</span>
              <span className="flex-1 text-sub">{m.note} {memberName(m.created_by) !== '—' && `· ${memberName(m.created_by)}`}</span>
              <span className={cx('font-semibold', m.kind === 'refund' ? 'text-bad' : 'text-ok')}>{m.kind === 'refund' ? '−' : '+'}{money(m.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      {addTo && <ServicePicker withTooth onClose={() => setAddTo(null)} onPick={(list) => addItems.mutate({ act: addTo, list })} />}
      {pay && <PaymentModal patient={p} actId={pay.act} refund={pay.refund} defaultAmount={pay.refund ? 0 : Math.max(debt, 0)} onClose={() => setPay(null)} />}
      {closing && <CloseActModal act={closing} onClose={() => setClosing(null)} />}
      <Confirm open={!!cancel} danger yes={cancel?.status === 'draft' ? 'O‘chirish' : 'Bekor qilish'}
        text={cancel?.status === 'draft' ? 'Ochiq aktni o‘chirasizmi?' : 'Yopilgan akt bekor qilinadi, u bo‘yicha chiqarilgan materiallar omborga qaytariladi. Davom etasizmi?'}
        onNo={() => setCancel(null)} onYes={() => cancel && doCancel.mutate(cancel)} loading={doCancel.isPending} />
    </div>
  );
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

export function PaymentModal({ patient, actId, refund, defaultAmount, onClose }: { patient: Patient; actId?: string; refund?: boolean; defaultAmount: number; onClose: () => void }) {
  const { branch } = useOrg();
  const boxes = useList<Cashbox>('cashboxes', { branch_id: branch.id, archived: false });
  const [box, setBox] = useState('');
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [note, setNote] = useState('');
  const save = useAction(() => {
    const cb = box || boxes.data?.[0]?.id;
    if (!cb) throw new Error('Kassa yo‘q');
    if (!(Number(amount) > 0)) throw new Error('Summani kiriting');
    return db.insert('money_moves', { kind: refund ? 'refund' : 'income', cashbox_id: cb, amount: Math.round(Number(amount)), patient_id: patient.id, act_id: actId ?? null, note });
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
        <Field label="Izoh">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
