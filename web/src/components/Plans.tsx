import { useMemo, useState } from 'react';
import { Star, Settings as Gear, ChevronDown, ChevronUp, ChevronsUp, ChevronsDown, Zap, Crosshair, X, Image, Plus, Copy, MessageSquare, Camera, Ban, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { dmy, initials, isoDate, money } from '@/lib/format';
import type { Patient, PriceCategory, PriceItem, Warehouse } from '@/lib/types';
import { PatientPicker } from './PatientPicker';
import { Button, Modal, Toggle, cx } from './ui';

// ---------------- Ma'lumot turlari ----------------
type RowStatus = 'none' | 'planned' | 'done';
export interface PlanRow {
  id: string; price_item_id: string | null; name: string; zone: string; price: number; disc: string; dtype: '%' | 'sum';
  status: RowStatus; pdate?: string | null; ddate?: string | null; ddoc?: string | null; act_id?: string | null; note?: string | null;
}
export interface PlanStage { id: string; name: string; doctor_id: string | null; formula: Formula; rows: PlanRow[]; collapsed?: boolean }
export interface Plan {
  id: string; patient_id: string; doctor_id: string | null; title: string; kind: 'plan' | 'act'; approved: boolean; note: string | null;
  plan_date: string; show_price: boolean; stages: PlanStage[]; created_at: string;
}
interface Template { id: string; name: string; stages: PlanStage[] }

type Formula = 'none' | 'tooth' | 'jaw' | 'quad' | 'seg' | 'all' | 'milk' | 'cjaw' | 'call';
const FT: [Formula, string][] = [['none', 'Formulasiz'], ['tooth', 'Tish'], ['jaw', 'Jag‘'], ['quad', 'Kvadrant'], ['seg', 'Segment'], ['all', 'Barcha tishlar'],
  ['milk', 'Sut tishi'], ['cjaw', 'Bola jag‘i'], ['call', 'Bolaning barcha tishlari']];
const ADULT = [[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]];
const CHILD = [[55, 54, 53, 52, 51, 61, 62, 63, 64, 65], [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]];
function units(ft: Formula): string[][] {
  if (ft === 'tooth') return ADULT.map((r) => r.map(String));
  if (ft === 'milk') return CHILD.map((r) => r.map(String));
  if (ft === 'jaw') return [['Yuqori jag‘'], ['Pastki jag‘']];
  if (ft === 'cjaw') return [['Yuqori jag‘ (bola)'], ['Pastki jag‘ (bola)']];
  if (ft === 'quad') return [['I kvadrant', 'II kvadrant'], ['IV kvadrant', 'III kvadrant']];
  if (ft === 'seg') return [['1-segment', '2-segment', '3-segment'], ['6-segment', '5-segment', '4-segment']];
  if (ft === 'all') return [['Barcha tishlar']];
  if (ft === 'call') return [['Bolaning barcha tishlari']];
  return [];
}
const DOT: Record<RowStatus, [string, string]> = { none: ['#0ea5e9', 'Bajarilmagan'], planned: ['#d97706', 'Rejalashtirilgan'], done: ['#15803d', 'Bajarildi'] };
const PCOL: [string, string][] = [['#ece3fb', '#cdbdf0'], ['#e4e6f8', '#c5c9ef'], ['#d9eefb', '#aed6f1'], ['#dff4e6', '#b6e2c4'], ['#fdece2', '#f4c9ad'], ['#fdf4da', '#f0dc9c']];
const uid = () => crypto.randomUUID();
export const finalOf = (r: Pick<PlanRow, 'price' | 'disc' | 'dtype'>) => {
  const d = Number(r.disc) || 0;
  return Math.max(0, Math.round(r.price - (r.dtype === '%' ? Math.round((r.price * d) / 100) : d)));
};
const sumRows = (rows: PlanRow[]) => rows.reduce((a, r) => a + finalOf(r), 0);
const allRows = (p: { stages: PlanStage[] }) => p.stages.flatMap((s) => s.rows);
export const planTotal = (p: { stages: PlanStage[] }) => sumRows(allRows(p));
const copyStages = (st: PlanStage[]): PlanStage[] => st.map((s) => ({ ...s, id: uid(), rows: s.rows.map((r) => ({ ...r, id: uid(), status: 'none', pdate: null, ddate: null, ddoc: null, act_id: null })) }));
const GREEN = 'h-[42px] rounded-[3px] bg-[#15803d] px-4 text-[15px] text-white hover:brightness-95';

// ---------------- Asosiy komponent ----------------
/** Bemor kartasidagi "Davolash rejalari" bo'limi (maketdagi Plans.dc). */
export function Plans({ patient }: { patient: Patient }) {
  const { can } = useOrg();
  const plans = useList<Plan>('treatment_plans', { patient_id: patient.id });
  const [mode, setMode] = useState<{ v: 'list' } | { v: 'view'; id: string } | { v: 'edit'; draft: Plan; isNew: boolean }>({ v: 'list' });
  const edit = can('patients.edit');
  const cur = mode.v === 'view' ? plans.data?.find((p) => p.id === mode.id) : undefined;

  if (mode.v === 'edit') return <PlanEditor draft={mode.draft} isNew={mode.isNew} onCancel={() => setMode(mode.isNew ? { v: 'list' } : { v: 'view', id: mode.draft.id })} onSaved={(id) => setMode({ v: 'view', id })} />;
  if (cur) return <PlanView plan={cur} patient={patient} onBack={() => setMode({ v: 'list' })} onEdit={() => setMode({ v: 'edit', draft: structuredClone(cur), isNew: false })} />;
  return <PlanList patient={patient} plans={plans.data ?? []} loading={plans.isLoading} canEdit={edit}
    onOpen={(id) => setMode({ v: 'view', id })} onNew={(draft) => setMode({ v: 'edit', draft, isNew: true })} />;
}

function blank(patient: Patient, kind: Plan['kind'], doctor: string | null, title = '', stages: PlanStage[] = []): Plan {
  return { id: '', patient_id: patient.id, doctor_id: doctor, title, kind, approved: false, note: null, plan_date: isoDate(new Date()), show_price: true, stages, created_at: '' };
}

// ---------------- Ro'yxat ----------------
function PlanList({ patient, plans, loading, canEdit, onOpen, onNew }: {
  patient: Patient; plans: Plan[]; loading: boolean; canEdit: boolean; onOpen: (id: string) => void; onNew: (d: Plan) => void;
}) {
  const { me, members, memberName } = useOrg();
  const docId = ['doctor', 'owner'].includes(me.role) ? me.user_id : null;
  const tpls = useList<Template>('plan_templates');
  const prices = useList<PriceItem>('price_items', { archived: false });
  const [tplOpen, setTplOpen] = useState(false);
  const [copy, setCopy] = useState(false);
  const [set, setSet] = useState<Plan | null>(null);
  const star = useAction(async (p: Plan) => {
    for (const x of plans) if (x.approved && x.id !== p.id && !p.approved) await db.update('treatment_plans', x.id, { approved: false });
    return db.update('treatment_plans', p.id, { approved: !p.approved });
  }, { invalidate: ['treatment_plans'] });
  const recalc = useAction(async () => {
    const pm = byId(prices.data);
    for (const p of plans) {
      const st = p.stages.map((s) => ({ ...s, rows: s.rows.map((r) => (r.status !== 'done' && r.price_item_id && pm.get(r.price_item_id) ? { ...r, price: pm.get(r.price_item_id)!.price } : r)) }));
      await db.update('treatment_plans', p.id, { stages: st });
    }
  }, { invalidate: ['treatment_plans'], success: 'Rejalar joriy prays bo‘yicha qayta hisoblandi' });
  const color = (uid_: string | null) => members.find((m) => m.user_id === uid_)?.color ?? '#94a3b8';

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex flex-wrap gap-1">
          <button type="button" className={GREEN} onClick={() => onNew(blank(patient, 'plan', docId, 'Davolash rejasi', [{ id: uid(), name: '', doctor_id: docId, formula: 'tooth', rows: [] }]))}>Davolash rejasi yaratish</button>
          <div className="relative">
            <button type="button" className={cx(GREEN, 'inline-flex items-center gap-1.5')} aria-haspopup="menu" aria-expanded={tplOpen} onClick={() => setTplOpen(!tplOpen)}>Shablon bo‘yicha yaratish <ChevronDown size={14} /></button>
            {tplOpen && (
              <div role="menu" className="absolute top-11 left-0 z-20 w-80 rounded-md border border-line bg-white p-1 shadow-pop">
                {(tpls.data ?? []).map((t) => (
                  <button key={t.id} type="button" role="menuitem" onClick={() => { setTplOpen(false); onNew(blank(patient, 'plan', docId, t.name, copyStages(t.stages))); }}
                    className="flex w-full justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"><span>{t.name}</span><span className="whitespace-nowrap text-sub">{t.stages.length} bosqich</span></button>
                ))}
                {tpls.data?.length === 0 && <div className="px-3 py-2 text-[13px] text-sub">Shablon yo‘q. Reja sozlamalarida «Shablon sifatida saqlash» tugmasi bilan qo‘shiladi.</div>}
              </div>
            )}
          </div>
          <button type="button" className="inline-flex h-[42px] items-center gap-1.5 rounded-[3px] bg-primary px-4 text-[15px] text-white hover:bg-primary-hover"
            onClick={() => onNew(blank(patient, 'act', docId, 'Tezkor akt', [{ id: uid(), name: 'Bajarilgan ishlar', doctor_id: docId, formula: 'tooth', rows: [] }]))}><Zap size={15} /> Tezkor akt yaratish</button>
          <button type="button" className={GREEN} onClick={() => setCopy(true)}>Boshqa bemordan nusxalash</button>
        </div>
      )}
      {!loading && plans.length === 0 && <div className="rounded-md border border-dashed border-line bg-white p-8 text-center text-sm text-sub">Bemorda hali davolash rejasi yo‘q</div>}
      {plans.map((p) => (
        <section key={p.id} className="overflow-hidden rounded-md border border-line bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <button type="button" onClick={() => canEdit && star.mutate(p)} aria-label={p.approved ? 'Tasdiqlangan reja' : 'Tasdiqlangan deb belgilash'} title={p.approved ? 'Tasdiqlangan reja' : 'Tasdiqlangan deb belgilash'}>
              <Star size={22} className={p.approved ? 'fill-[#f59e0b] text-[#d97706]' : 'text-faint'} />
            </button>
            {p.kind === 'act' && <span className="rounded bg-primary-soft px-1.5 text-xs font-medium text-[#006b93]">Akt</span>}
            <button type="button" onClick={() => onOpen(p.id)} className="text-base font-semibold hover:underline">{p.title || 'Davolash rejasi'}</button>
            <span className="inline-flex items-center gap-1.5 text-sm text-sub">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: color(p.doctor_id) }}>{initials(memberName(p.doctor_id))}</span>{memberName(p.doctor_id)}
            </span>
            <span className="text-sm text-sub">{dmy(p.plan_date)}</span>
            <span className="flex-1" />
            {p.show_price && <b className="text-base font-semibold">{money(planTotal(p))} so‘m</b>}
            {canEdit && <button type="button" onClick={() => setSet(p)} aria-label="Reja sozlamalari" title="Reja sozlamalari" className="text-sub hover:text-fg"><Gear size={18} /></button>}
          </div>
          <div className="px-3.5 py-1.5">
            {p.stages.map((s) => {
              const done = s.rows.filter((r) => r.status === 'done').length;
              return (
                <button key={s.id} type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-2.5 border-b border-[#eef2f5] py-1.5 text-left text-sm last:border-b-0">
                  <span className="h-[18px] w-1 rounded-sm bg-primary" />
                  <span className="flex-1">{s.name || 'Yangi bosqich'}</span>
                  <span className="text-sub">{s.rows.length} ta xizmat{done ? `, ${done} tasi bajarilgan` : ''}</span>
                  {p.show_price && <span className="w-[120px] text-right">{money(sumRows(s.rows))}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {canEdit && plans.length > 0 && <button type="button" onClick={() => recalc.mutate(undefined)} className="self-start text-sm text-primary underline">Rejalarni prays bo‘yicha qayta hisoblash</button>}
      {copy && <CopyModal onClose={() => setCopy(false)} onPick={(src) => { setCopy(false); onNew(blank(patient, 'plan', docId, `${src.title} (nusxa)`, copyStages(src.stages))); }} />}
      {set && <PlanSettings plan={set} onClose={() => setSet(null)} />}
    </div>
  );
}

function CopyModal({ onClose, onPick }: { onClose: () => void; onPick: (p: Plan) => void }) {
  const { branch } = useOrg();
  const [pat, setPat] = useState<Patient | null>(null);
  const plans = useList<Plan>('treatment_plans', { patient_id: pat?.id ?? '' }, { enabled: !!pat });
  return (
    <Modal open onClose={onClose} title="Boshqa bemordan nusxalash" width={560}>
      <div className="flex flex-col gap-3">
        <PatientPicker value={pat} onChange={setPat} branchId={branch.id} autoFocus />
        {pat && <span className="text-sm text-sub">Qaysi rejani nusxalaymiz?</span>}
        {(plans.data ?? []).map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-left text-sm hover:bg-muted">
            <span><b className="font-medium">{p.title}</b><br /><span className="text-sub">{p.stages.length} bosqich · {allRows(p).length} ta xizmat</span></span>
            <span className="font-semibold">{money(planTotal(p))}</span>
          </button>
        ))}
        {pat && plans.data?.length === 0 && <span className="text-sm text-sub">Bu bemorda reja yo‘q</span>}
      </div>
    </Modal>
  );
}

function PlanSettings({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { members } = useOrg();
  const [f, setF] = useState({ doctor_id: plan.doctor_id ?? '', plan_date: plan.plan_date, approved: plan.approved });
  const [ask, setAsk] = useState(false);
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role));
  const save = useAction(() => db.update('treatment_plans', plan.id, { ...f, doctor_id: f.doctor_id || null }), { invalidate: ['treatment_plans'], success: 'Saqlandi', onDone: onClose });
  const dup = useAction(() => db.insert('treatment_plans', { patient_id: plan.patient_id, doctor_id: plan.doctor_id, title: `${plan.title} (nusxa)`, kind: plan.kind, note: plan.note, show_price: plan.show_price, stages: copyStages(plan.stages) }),
    { invalidate: ['treatment_plans'], success: 'Reja nusxasi yaratildi', onDone: onClose });
  const tpl = useAction(() => db.insert('plan_templates', { name: plan.title, stages: copyStages(plan.stages) }), { invalidate: ['plan_templates'], success: 'Shablon saqlandi' });
  const del = useAction(() => {
    if (allRows(plan).some((r) => r.status === 'done')) throw new Error('Bajarilgan xizmati bor rejani o‘chirib bo‘lmaydi');
    return db.remove('treatment_plans', plan.id);
  }, { invalidate: ['treatment_plans'], success: 'Reja o‘chirildi', onDone: onClose });
  return (
    <Modal open onClose={onClose} title={`Reja sozlamalari: ${plan.title}`} width={560}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="flex flex-col gap-4 text-[15px]">
        <label className="flex flex-col gap-1">Rejani tuzgan shifokor
          <select value={f.doctor_id} onChange={(e) => setF({ ...f, doctor_id: e.target.value })} className="h-[42px] rounded border border-line bg-white px-3">
            <option value="">—</option>{doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}
          </select></label>
        <label className="flex flex-col gap-1">Sana<input type="date" value={f.plan_date} onChange={(e) => setF({ ...f, plan_date: e.target.value })} className="h-[42px] w-48 rounded border border-line px-3" /></label>
        <div className="flex items-center justify-between gap-3"><span>Rejani tasdiqlangan deb belgilash</span><Toggle on={f.approved} label="Rejani tasdiqlangan deb belgilash" onChange={(v) => setF({ ...f, approved: v })} /></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button onClick={() => dup.mutate(undefined)} loading={dup.isPending}>Reja nusxasini yaratish</Button>
          <Button onClick={() => tpl.mutate(undefined)} loading={tpl.isPending}>Shablon sifatida saqlash</Button>
          {!ask ? <Button variant="danger" onClick={() => setAsk(true)}>Rejani o‘chirish</Button>
            : <span className="flex items-center gap-2 text-sm">Rostdan o‘chirilsinmi? <Button size="sm" variant="danger" onClick={() => del.mutate(undefined)}>Ha</Button><Button size="sm" onClick={() => setAsk(false)}>Yo‘q</Button></span>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Ko'rish ----------------
function PlanView({ plan, patient, onBack, onEdit }: { plan: Plan; patient: Patient; onBack: () => void; onEdit: () => void }) {
  const { members, memberName, can, branch, me } = useOrg();
  const [vf, setVf] = useState<'all' | 'done' | 'undone'>('all');
  const [vd, setVd] = useState<'stage' | 'date'>('stage');
  const [sel, setSel] = useState<string[]>([]);
  const [md, setMd] = useState<'done' | 'plan' | 'undo' | null>(null);
  const showPrice = plan.show_price;
  const toggleSp = useAction(() => db.update('treatment_plans', plan.id, { show_price: !plan.show_price }), { invalidate: ['treatment_plans'] });
  const color = (u: string | null | undefined) => members.find((m) => m.user_id === u)?.color ?? '#94a3b8';
  const match = (r: PlanRow) => vf === 'all' || (vf === 'done' ? r.status === 'done' : r.status !== 'done');
  const stages = plan.stages.map((s) => ({ ...s, rows: s.rows.filter(match) })).filter((s) => s.rows.length || vf === 'all');
  const byDate = vf === 'done' && vd === 'date';
  const dates = useMemo(() => {
    const m = new Map<string, PlanRow[]>();
    for (const r of allRows(plan).filter((r) => r.status === 'done')) m.set(r.ddate ?? '', [...(m.get(r.ddate ?? '') ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [plan]);
  const selRows = allRows(plan).filter((r) => sel.includes(r.id));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const edit = can('patients.edit', branch.id);
  const SEG = (on: boolean) => cx('h-[38px] border-r border-line px-3.5 text-sm last:border-r-0', on ? 'bg-primary text-white' : 'bg-white text-fg');

  const Row = ({ r }: { r: PlanRow }) => {
    const on = sel.includes(r.id);
    const txt = r.status === 'done' ? `Bajarildi ${dmy(r.ddate)} · ${memberName(r.ddoc)}` : r.status === 'planned' ? `Rejalashtirilgan${r.pdate ? ` ${dmy(r.pdate)}` : ''}` : '';
    return (
      <div className={cx('flex items-center gap-2.5 rounded border px-2 py-1.5 text-sm', on ? 'border-[#86efac] bg-[#ecfdf5]' : 'border-[#eef2f5] bg-white')}>
        <button type="button" onClick={() => edit && toggle(r.id)} aria-pressed={on} aria-label="Qatorni tanlash" title="Qatorni tanlash"
          className="h-5 w-5 flex-none rounded-full border-2" style={{ borderColor: on ? '#15803d' : DOT[r.status][0], background: on ? '#15803d' : r.status === 'none' ? '#fff' : DOT[r.status][0] }} />
        <span className="flex-1">{r.name}</span>
        <span className={cx('rounded px-1.5 text-[13px]', r.zone ? 'bg-muted' : 'w-14 bg-muted text-center text-sub')}>{r.zone || '—'}</span>
        {txt && <span className="text-[13px] whitespace-nowrap" style={{ color: DOT[r.status][0] }}>{txt}</span>}
        {showPrice && <span className="w-28 text-right font-semibold">{money(finalOf(r))}</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white px-3.5 py-2.5">
        {plan.approved && <Star size={22} className="fill-[#f59e0b] text-[#d97706]" />}
        {plan.kind === 'act' && <span className="rounded bg-primary-soft px-1.5 text-xs font-medium text-[#006b93]">Akt</span>}
        <h2 className="m-0 text-lg font-semibold">{plan.title}</h2>
        <span className="inline-flex items-center gap-1.5 text-sm text-sub">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: color(plan.doctor_id) }}>{initials(memberName(plan.doctor_id))}</span>{memberName(plan.doctor_id)}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onBack} className="h-9 rounded border border-line px-3.5 text-sm text-primary">Barcha rejalar</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div role="radiogroup" aria-label="Filtr" className="flex overflow-hidden rounded border border-line">
          {([['all', 'Barcha bosqichlar'], ['done', 'Bajarilganlar'], ['undone', 'Bajarilmaganlar']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={vf === k} onClick={() => { setVf(k); setSel([]); }} className={SEG(vf === k)}>{l}</button>
          ))}
        </div>
        {vf === 'done' && (
          <div role="radiogroup" aria-label="Bajarilganlar ko‘rinishi" className="flex overflow-hidden rounded border border-line">
            {([['stage', 'Bosqichlar bo‘yicha'], ['date', 'Sanalar bo‘yicha']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={vd === k} onClick={() => setVd(k)} className={SEG(vd === k)}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {(byDate ? dates.length === 0 : stages.length === 0) && <div className="rounded-md border border-line bg-white p-6 text-center text-sm text-sub">Bu filtr bo‘yicha xizmat yo‘q</div>}
      {!byDate && stages.map((s) => {
        const num = plan.stages.findIndex((x) => x.id === s.id) + 1;
        const zones = [...new Set(s.rows.map((r) => r.zone).filter(Boolean))];
        return (
          <section key={s.id} className="overflow-hidden rounded-md border border-line bg-white">
            <div className="flex items-center gap-3 border-l-4 border-primary bg-[#e0f3fb] px-3.5 py-2.5">
              <button type="button" onClick={() => edit && setSel([...new Set([...sel, ...s.rows.filter((r) => r.status !== 'done').map((r) => r.id)])])}
                aria-label="Bosqichning hamma qatorini tanlash" title="Bosqichning hamma qatorini tanlash"
                className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: color(s.doctor_id) }}>{initials(memberName(s.doctor_id))}</button>
              <b className="flex-1 text-[15px] font-semibold">{num}. {s.name || 'Bosqich'}</b>
              {showPrice && <b className="font-semibold">{money(sumRows(s.rows))}</b>}
            </div>
            {zones.length > 0 && <div className="flex flex-wrap gap-1 px-3 pt-2">{zones.map((z) => <span key={z} className="rounded border border-[#7dd3fc] bg-primary-soft px-1.5 text-xs">{z}</span>)}</div>}
            <div className="flex flex-col gap-1 p-3">{s.rows.map((r) => <Row key={r.id} r={r} />)}</div>
          </section>
        );
      })}
      {byDate && dates.map(([d, rows]) => (
        <section key={d} className="overflow-hidden rounded-md border border-line bg-white">
          <div className="bg-[#e0f3fb] px-3.5 py-2 text-sm font-semibold">{dmy(d) || 'Sanasiz'}</div>
          <div className="flex flex-col gap-1 p-3">{rows.map((r) => <Row key={r.id} r={r} />)}</div>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-white px-3.5 py-3 text-sm">
        {plan.note && <span className="text-sub">Izoh: {plan.note}</span>}
        <span>Jami: <b className="text-base font-semibold">{money(planTotal(plan))} so‘m</b></span>
        <label className="flex items-center gap-2">Narxni ko‘rsatish <Toggle on={showPrice} label="Narxni ko‘rsatish" onChange={() => toggleSp.mutate(undefined)} /></label>
        <span className="ml-auto text-sub">Reja yaratildi: {dmy(plan.created_at)}</span>
      </div>
      {sel.length > 0 ? (
        <div className="sticky bottom-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-white px-3.5 py-2.5 shadow-pop">
          <span className="text-sm">Tanlangan: <b>{money(sumRows(selRows))} so‘m</b> ({sel.length} ta)</span>
          <span className="flex-1" />
          <button type="button" onClick={() => setSel([])} className="h-[38px] rounded-[3px] border border-line px-3.5 text-sm">Bekor qilish</button>
          <button type="button" onClick={() => setMd('undo')} className="h-[38px] rounded-[3px] bg-[#64748b] px-3.5 text-sm text-white">Bajarilmagan deb belgilash</button>
          <button type="button" onClick={() => setMd('plan')} className="h-[38px] rounded-[3px] bg-[#d97706] px-3.5 text-sm text-white">Rejalashtirish</button>
          <button type="button" onClick={() => setMd('done')} className="h-[38px] rounded-[3px] bg-[#15803d] px-3.5 text-sm text-white">Bajarish</button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2 print:hidden">
          {patient.photo_file_id && <a href={`/api/files/${patient.photo_file_id}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-[3px] bg-[#15803d] px-3.5 text-sm !text-white no-underline">Bemor suratini ochish</a>}
          <button type="button" onClick={() => window.print()} className="h-10 rounded-[3px] bg-primary px-3.5 text-sm text-white">PDF yuklab olish</button>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-[3px] bg-primary px-3.5 text-sm text-white">Chop etish</button>
          <button type="button" onClick={() => { document.documentElement.style.filter = 'grayscale(1)'; window.print(); document.documentElement.style.filter = ''; }} className="h-10 rounded-[3px] bg-[#374151] px-3.5 text-sm text-white">Oq-qora chop etish</button>
          {edit && <button type="button" onClick={onEdit} className="h-10 rounded-[3px] bg-[#b45309] px-3.5 text-sm text-white">Tahrirlash</button>}
        </div>
      )}
      {md && <RowAction kind={md} plan={plan} rows={selRows} defDoc={plan.doctor_id ?? me.user_id} onClose={() => setMd(null)} onDone={() => { setMd(null); setSel([]); }} />}
    </div>
  );
}

function RowAction({ kind, plan, rows, defDoc, onClose, onDone }: { kind: 'done' | 'plan' | 'undo'; plan: Plan; rows: PlanRow[]; defDoc: string; onClose: () => void; onDone: () => void }) {
  const { members, branch } = useOrg();
  const whs = useList<Warehouse>('warehouses', { branch_id: branch.id, archived: false }, { enabled: kind === 'done' });
  const [f, setF] = useState({ doc: defDoc, asst: '', date: kind === 'plan' ? isoDate(new Date(Date.now() + 86400000)) : isoDate(new Date()), wh: '', note: '' });
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role));
  const assts = members.filter((m) => m.is_active && m.role === 'assistant');
  const summary = `${rows.length} ta xizmat tanlangan, jami ${money(sumRows(rows))} so‘m.`;
  const go = useAction(() => kind === 'done'
    ? http.post(`/api/plans/${plan.id}/done`, { rows: rows.map((r) => r.id), branch_id: branch.id, doctor_id: f.doc, assistant_id: f.asst || null, date: f.date, warehouse_id: f.wh || null, note: f.note })
    : http.post(`/api/plans/${plan.id}/mark`, { rows: rows.map((r) => r.id), status: kind === 'plan' ? 'planned' : 'none', date: f.date, note: f.note }),
  { invalidate: ['treatment_plans', 'acts', 'patients', 'stock_balances'], success: kind === 'done' ? 'Bajarildi: akt yaratildi va yopildi' : 'Saqlandi', onDone });
  const L = 'flex flex-col gap-1 text-[15px]';
  const IN = 'h-[42px] rounded border border-line bg-white px-3';
  return (
    <Modal open onClose={onClose} title={kind === 'done' ? 'Bajarish' : kind === 'plan' ? 'Rejalashtirish' : 'Bajarilmagan deb belgilash'} width={520}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={go.isPending} disabled={kind === 'done' && !f.doc} onClick={() => go.mutate(undefined)}>{kind === 'done' ? 'Bajarish' : 'Saqlash'}</Button></>}>
      <div className="flex flex-col gap-3">
        {kind === 'undo' ? <p className="m-0 text-sm">{summary} Ularning holati «bajarilmagan»ga qaytariladi.</p> : <div className="rounded-md bg-muted px-3 py-2 text-sm">{summary}</div>}
        {kind === 'done' && <>
          <label className={L}>Ijrochi *<select value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} className={IN}><option value="">—</option>{doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}</select></label>
          <label className={L}>Assistent<select value={f.asst} onChange={(e) => setF({ ...f, asst: e.target.value })} className={IN}><option value="">—</option>{assts.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}</select></label>
        </>}
        {kind !== 'undo' && <label className={L}>{kind === 'done' ? 'Sana *' : 'Tashrif sanasi'}<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={cx(IN, 'w-48')} /></label>}
        {kind === 'done' && (
          <label className={L}>Ombor<select value={f.wh} onChange={(e) => setF({ ...f, wh: e.target.value })} className={IN}>
            <option value="">{whs.data?.find((w) => w.is_main)?.name ?? 'Asosiy ombor'}</option>{(whs.data ?? []).filter((w) => !w.is_main).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select></label>
        )}
        {kind !== 'undo' && <label className={L}>Izoh<textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="rounded border border-line px-3 py-2" /></label>}
        {kind === 'done' && <p className="m-0 text-xs text-sub">Akt avtomatik yaratiladi va yopiladi: summa bemor qarziga qo‘shiladi, kalkulyatsiya kartasi bo‘yicha material ombordan chiqadi.</p>}
      </div>
    </Modal>
  );
}

// ---------------- Tahrirlash ----------------
function Tooth({ n, upper }: { n: number; upper: boolean }) {
  const molar = n % 10 >= 6;
  const crown = molar ? 'M4 10 Q4 4 8 4 Q10 6 12 4 Q14 6 16 4 Q20 4 20 10 Q20 15 17 16 L7 16 Q4 15 4 10Z' : 'M6 11 Q6 4 12 4 Q18 4 18 11 Q18 15 15 16 L9 16 Q6 15 6 11Z';
  const roots = molar ? 'M7 16 L8 30 Q9 32 10 30 L12 20 L14 30 Q15 32 16 30 L17 16' : 'M9 16 L11 31 Q12 33 13 31 L15 16';
  return (
    <svg width="24" height="36" viewBox="0 0 24 36" aria-hidden="true" style={{ transform: upper ? 'scaleY(-1)' : undefined }}>
      <path d={roots} fill="#fff" stroke="#9aa3ad" strokeWidth="1.2" /><path d={crown} fill="#f7fbfd" stroke="#9aa3ad" strokeWidth="1.2" />
    </svg>
  );
}

function PlanEditor({ draft, isNew, onCancel, onSaved }: { draft: Plan; isNew: boolean; onCancel: () => void; onSaved: (id: string) => void }) {
  const { members, memberName, me } = useOrg();
  const [d, setD] = useState<Plan>(draft);
  const [active, setActive] = useState(draft.stages[0]?.id ?? '');
  const [dent, setDent] = useState<'adult' | 'child'>('adult');
  const [sel, setSel] = useState<string[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(!!draft.note);
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<string[]>([]);
  const cats = useList<PriceCategory>('price_categories');
  const items = useList<PriceItem>('price_items', { archived: false });
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role));
  const color = (u: string | null) => members.find((m) => m.user_id === u)?.color ?? '#94a3b8';
  const setStage = (id: string, fn: (s: PlanStage) => PlanStage) => setD({ ...d, stages: d.stages.map((s) => (s.id === id ? fn(structuredClone(s)) : s)) });
  const addStage = (copyOf?: PlanStage) => {
    const s: PlanStage = copyOf ? { ...copyStages([copyOf])[0]!, name: `${copyOf.name} (nusxa)` } : { id: uid(), name: '', doctor_id: d.doctor_id ?? me.user_id, formula: 'tooth', rows: [] };
    setD({ ...d, stages: [...d.stages, s] }); setActive(s.id); setSel([]);
  };
  const addItem = (it: PriceItem) => {
    let sid = active;
    let stages = d.stages;
    if (!stages.some((s) => s.id === sid)) { const s: PlanStage = { id: uid(), name: '', doctor_id: d.doctor_id, formula: 'tooth', rows: [] }; stages = [...stages, s]; sid = s.id; setActive(s.id); }
    const zones = sel.length ? sel : [''];
    const rows: PlanRow[] = zones.map((z) => ({ id: uid(), price_item_id: it.id, name: it.name, zone: z, price: it.price, disc: '', dtype: '%', status: 'none' }));
    setD({ ...d, stages: stages.map((s) => (s.id === sid ? { ...s, name: s.name || it.name, rows: [...s.rows, ...rows] } : s)) });
  };
  const save = useAction(async () => {
    const row = { patient_id: d.patient_id, doctor_id: d.doctor_id, title: d.title.trim() || 'Davolash rejasi', kind: d.kind, note: d.note, plan_date: d.plan_date, show_price: d.show_price,
      stages: d.stages.map(({ collapsed: _c, ...s }) => s) };
    const r = isNew ? await db.insert<Plan>('treatment_plans', row) : await db.update<Plan>('treatment_plans', d.id, row);
    return r.id;
  }, { invalidate: ['treatment_plans'], success: 'Reja saqlandi', onDone: onSaved });
  const total = planTotal(d);
  const base = allRows(d).reduce((a, r) => a + r.price, 0);
  const qq = q.trim().toLowerCase();
  const jaws = dent === 'adult' ? ADULT : CHILD;
  const usedZones = new Set(d.stages.find((s) => s.id === active)?.rows.map((r) => r.zone));
  const FAB = 'grid h-16 w-16 place-items-center rounded-full text-white shadow-[0_4px_12px_rgba(7,18,30,.18)]';

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-[1_1_640px] flex-col gap-3">
        <div className="flex items-center gap-2 px-1">
          {d.kind === 'act' && <span className="rounded bg-primary-soft px-1.5 text-xs font-medium text-[#006b93]">Tezkor akt</span>}
          <label htmlFor="pnName" className="sr-only">Reja nomi</label>
          <input id="pnName" placeholder="Davolash rejasi" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })}
            className="h-9 min-w-0 flex-1 border-0 border-b border-dashed border-line bg-transparent px-0.5 text-xl font-medium outline-none" />
          <button type="button" onClick={() => setClosed(closed.length ? [] : d.stages.map((s) => s.id))} aria-label={closed.length ? 'Hammasini yoyish' : 'Hammasini yig‘ish'} title={closed.length ? 'Hammasini yoyish' : 'Hammasini yig‘ish'}
            className="grid h-8 w-8 place-items-center text-sub">{closed.length ? <ChevronsDown size={18} /> : <ChevronsUp size={18} />}</button>
        </div>
        <div className="flex flex-col items-center gap-2 border-b border-line pb-3">
          <div role="radiogroup" aria-label="Tish formulasi turi" className="flex overflow-hidden rounded-full border border-line">
            {([['adult', 'Doimiy tishlar'], ['child', 'Bolalar (sut tishlari)']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={dent === k} onClick={() => { setDent(k); setSel([]); }}
                className={cx('h-8 px-4 text-sm', dent === k ? 'bg-primary text-white' : 'bg-white text-[#3d4858]')}>{l}</button>
            ))}
          </div>
          <div className="w-full overflow-x-auto">
            {jaws.map((row, ji) => (
              <div key={ji} className={cx('flex min-w-max justify-center gap-0.5', ji === 0 && 'border-b border-dashed border-line pb-1.5', ji === 1 && 'pt-1.5')}>
                {row.map((n, i) => {
                  const on = sel.includes(String(n));
                  const used = usedZones.has(String(n));
                  return (
                    <button key={n} type="button" onClick={() => setSel(on ? sel.filter((x) => x !== String(n)) : [...sel, String(n)])} aria-pressed={on} aria-label={`${n}-tish`} title={`${n}-tish`}
                      className={cx('flex w-[46px] flex-col items-center rounded-md py-0.5', ji === 1 && 'flex-col-reverse', i === row.length / 2 && 'ml-4', on ? 'bg-[#dcfce7]' : used ? 'bg-primary-soft' : 'hover:bg-muted')}>
                      <Tooth n={n} upper={ji === 0} />
                      <span className={cx('text-[13px]', on ? 'font-semibold text-ok' : 'text-fg')}>{n}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[13px] text-sub">
            <span>{sel.length ? `Tanlangan: ${sel.join(', ')} — endi praysdan xizmatni bosing` : 'Tishlarni tanlang, keyin praysdan xizmatni bosing. Tish tanlanmasa, xizmat tishsiz qo‘shiladi.'}</span>
            {sel.length > 0 && <button type="button" onClick={() => setSel([])} className="text-primary">Tanlovni bekor qilish</button>}
          </div>
        </div>
        {d.stages.length === 0 && <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-sub">O‘ngdagi praysdan xizmatni bosing — u yangi bosqichga tushadi</div>}
        {d.stages.map((s, si) => {
          const on = s.id === active;
          const isClosed = closed.includes(s.id);
          const fUnits = s.formula === 'tooth' || s.formula === 'milk' || s.formula === 'none' ? [] : units(s.formula);
          return (
            <section key={s.id} className={cx('overflow-hidden rounded-md border bg-white', on ? 'border-primary shadow-[0_0_0_1px_#00a1db]' : 'border-line')}>
              <div onClick={() => setActive(s.id)} className="flex items-center gap-2 border-l-4 border-primary bg-[#e0f3fb] px-3 py-2">
                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === `doc${s.id}` ? null : `doc${s.id}`); }} aria-label="Bosqichni bajaradigan shifokor" title={memberName(s.doctor_id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white" style={{ background: color(s.doctor_id) }}>{initials(memberName(s.doctor_id))}</button>
                  {menu === `doc${s.id}` && (
                    <div role="menu" className="absolute top-9 left-0 z-20 w-56 rounded-md border border-line bg-white p-1 shadow-pop">
                      <div className="px-2 py-1 text-xs text-sub">Bosqichni bajaradi</div>
                      {doctors.map((o) => (
                        <button key={o.user_id} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setStage(s.id, (x) => ({ ...x, doctor_id: o.user_id })); setMenu(null); }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                          <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: o.color }}>{initials(o.full_name)}</span>{o.full_name}</button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-sm text-sub">{si + 1}.</span>
                <input aria-label="Bosqich nomi" placeholder="Yangi bosqich" value={s.name} onFocus={() => setActive(s.id)} onChange={(e) => setStage(s.id, (x) => ({ ...x, name: e.target.value }))}
                  className="h-8 min-w-0 flex-1 rounded-[3px] border border-transparent bg-white/70 px-2 text-[15px] font-semibold outline-none focus:border-primary" />
                <div className="relative">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === `ft${s.id}` ? null : `ft${s.id}`); }} aria-label="Formula turi" title={`Formula: ${FT.find((f) => f[0] === s.formula)?.[1]}`}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white text-sub"><Crosshair size={17} /></button>
                  {menu === `ft${s.id}` && (
                    <div role="menu" className="absolute top-9 right-0 z-20 w-56 rounded-md border border-line bg-white p-1 shadow-pop">
                      {FT.map(([k, l]) => (
                        <button key={k} type="button" role="menuitemradio" aria-checked={s.formula === k} onClick={(e) => { e.stopPropagation(); setStage(s.id, (x) => ({ ...x, formula: k })); setMenu(null); setSel([]); setActive(s.id); }}
                          className={cx('block w-full rounded px-2.5 py-2 text-left text-sm', s.formula === k ? 'bg-primary-soft text-primary-hover' : 'hover:bg-muted')}>{l}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setClosed(isClosed ? closed.filter((x) => x !== s.id) : [...closed, s.id]); }} aria-label={isClosed ? 'Bosqichni yoyish' : 'Bosqichni yig‘ish'}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white text-sub">{isClosed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); if (s.rows.some((r) => r.status === 'done')) { toast.error('Bajarilgan xizmati bor bosqichni o‘chirib bo‘lmaydi'); return; } setD({ ...d, stages: d.stages.filter((x) => x.id !== s.id) }); }}
                  aria-label="Bosqichni o‘chirish" title="Bosqichni o‘chirish" className="grid h-8 w-8 place-items-center rounded-full bg-white text-bad"><X size={17} /></button>
              </div>
              {!isClosed ? (
                <div className="flex flex-col gap-1.5 p-3">
                  {fUnits.length > 0 && on && (
                    <div className="flex flex-col items-center gap-1">
                      {fUnits.map((row, i) => (
                        <div key={i} className="flex flex-wrap justify-center gap-1">
                          {row.map((u) => {
                            const isSel = sel.includes(u), used = s.rows.some((r) => r.zone === u);
                            return <button key={u} type="button" aria-pressed={isSel} onClick={() => setSel(isSel ? sel.filter((x) => x !== u) : [...sel, u])}
                              className={cx('h-[30px] min-w-[34px] rounded border px-2 text-sm', isSel ? 'border-[#15803d] bg-[#15803d] text-white' : used ? 'border-primary bg-primary-soft' : 'border-line bg-white')}>{u}</button>;
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                  {s.rows.length === 0 && <div className="py-2 text-center text-[13px] text-sub">Tish tanlang, keyin o‘ngdagi praysdan xizmatni bosing</div>}
                  {s.rows.map((r) => {
                    const upd = (patch: Partial<PlanRow>) => setStage(s.id, (x) => ({ ...x, rows: x.rows.map((y) => (y.id === r.id ? { ...y, ...patch } : y)) }));
                    const locked = r.status === 'done';
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-[#eef2f5] px-2.5 py-2 text-sm">
                        <span title={DOT[r.status][1]} className="h-2 w-2 flex-none rounded-full" style={{ background: DOT[r.status][0] }} />
                        <span className="min-w-[140px] flex-1">{r.name}</span>
                        <span className={cx('rounded px-1.5 text-[13px]', r.zone ? 'bg-muted' : 'w-14 bg-muted text-center text-sub')}>{r.zone || '—'}</span>
                        {d.show_price && <>
                          <input type="number" min={0} aria-label="Narx" value={r.price} disabled={locked} onChange={(e) => upd({ price: Math.max(0, Number(e.target.value) || 0) })} className="h-9 w-28 rounded border border-line px-2 text-right" />
                          <input type="number" min={0} aria-label="Chegirma" placeholder="0" value={r.disc} disabled={locked} onChange={(e) => upd({ disc: e.target.value })} className="h-9 w-[68px] rounded border border-line px-2 text-right" />
                          <select aria-label="Chegirma turi" value={r.dtype} disabled={locked} onChange={(e) => upd({ dtype: e.target.value as PlanRow['dtype'] })} className="h-9 rounded border border-line bg-white px-1.5">
                            <option value="%">%</option><option value="sum">so‘m</option>
                          </select>
                          <span className="w-24 text-right font-semibold">{money(finalOf(r))}</span>
                        </>}
                        <button type="button" disabled={locked} onClick={() => setStage(s.id, (x) => ({ ...x, rows: x.rows.filter((y) => y.id !== r.id) }))} aria-label="Qatorni o‘chirish" className="text-faint hover:text-bad">×</button>
                      </div>
                    );
                  })}
                  {d.show_price && s.rows.length > 0 && <div className="flex justify-end gap-2 text-sm text-sub"><span>Bosqich jami:</span><b className="text-fg">{money(sumRows(s.rows))}</b></div>}
                </div>
              ) : <div className="flex justify-between px-3 py-2 text-sm text-sub"><span>{s.rows.length} ta xizmat</span>{d.show_price && <b className="text-fg">{money(sumRows(s.rows))}</b>}</div>}
            </section>
          );
        })}
        {d.show_price && (
          <div className="flex items-baseline justify-end gap-2 px-1 text-sm">
            <span>Jami:</span>{base !== total && <span className="text-faint line-through">{money(base)}</span>}<b className="text-lg font-semibold">{money(total)} so‘m</b>
          </div>
        )}
        {noteOpen && <label className="flex flex-col gap-1 text-sm">Rejaga izoh<textarea rows={3} value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value })} className="rounded border border-line px-3 py-2" /></label>}
        <div className="flex justify-end"><label className="inline-flex items-center gap-3 text-base">Narxni ko‘rsatish <Toggle on={d.show_price} label="Narxni ko‘rsatish" onChange={(v) => setD({ ...d, show_price: v })} /></label></div>
        <div className="sticky bottom-4 z-10 flex flex-wrap justify-center gap-3 py-2">
          <button type="button" onClick={() => toast.info('Bemor surati kartaning «Hujjatlar» bo‘limida')} aria-label="Bemor suratini ochish" title="Bemor suratini ochish" className={cx(FAB, 'bg-[#15803d]')}><Image size={22} /></button>
          <button type="button" onClick={() => addStage()} aria-label="Bosqich qo‘shish" title="Bosqich qo‘shish" className={cx(FAB, 'bg-primary')}><Plus size={24} /></button>
          {d.stages.some((s) => s.id === active) && <button type="button" onClick={() => addStage(d.stages.find((s) => s.id === active))} aria-label="Faol bosqichni nusxalash" title="Dublikat: faol bosqichni nusxalash" className={cx(FAB, 'bg-primary')}><Copy size={22} /></button>}
          <button type="button" onClick={() => setNoteOpen(!noteOpen)} aria-label="Izoh" title="Izoh" className={cx(FAB, 'bg-primary')}><MessageSquare size={22} /></button>
          <button type="button" onClick={() => toast.info('Snimkalar kartaning «Hujjatlar» bo‘limida')} aria-label="Snimkalarni biriktirish" title="Snimkalarni biriktirish" className={cx(FAB, 'bg-primary')}><Camera size={22} /></button>
          <button type="button" onClick={onCancel} aria-label="Bekor qilish" title="Bekor qilish" className={cx(FAB, 'bg-[#9aa3ad]')}><Ban size={22} /></button>
          <button type="button" disabled={save.isPending || allRows(d).length === 0} onClick={() => save.mutate(undefined)} aria-label="Saqlash" title={allRows(d).length ? 'Saqlash' : 'Kamida bitta xizmat qo‘shing'} className={cx(FAB, 'bg-[#15803d]')}><Check size={24} /></button>
        </div>
      </div>

      <aside className="sticky top-14 flex max-h-[calc(100vh-110px)] min-w-[320px] flex-[0_1_560px] flex-col gap-2.5 overflow-y-auto pb-24">
        <div className="flex items-center gap-2 rounded-md border border-line bg-white px-4">
          <label htmlFor="prQ" className="sr-only">Prays pozitsiyasini qidirish</label>
          <input id="prQ" type="search" placeholder="Prays pozitsiyasini qidirish" value={q} onChange={(e) => setQ(e.target.value)} className="h-[46px] min-w-0 flex-1 bg-transparent text-[17px] outline-none" />
        </div>
        {(cats.data ?? []).map((c) => {
          const its = (items.data ?? []).filter((i) => i.category_id === c.id && (!qq || i.name.toLowerCase().includes(qq) || i.code?.toLowerCase().includes(qq)));
          if (qq && !its.length) return null;
          const col = PCOL[c.color_idx % PCOL.length]!;
          const open = !!qq || !closed.includes(`cat${c.id}`);
          return (
            <div key={c.id} className="overflow-hidden rounded-md" style={{ background: col[0], border: `1px solid ${col[1]}` }}>
              <button type="button" onClick={() => setClosed(open ? [...closed, `cat${c.id}`] : closed.filter((x) => x !== `cat${c.id}`))} aria-expanded={open}
                className="flex w-full items-center px-4 py-3 text-lg text-[#3d4858]"><span className="flex-1 text-center">{c.name}</span>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
              {open && (
                <div className="mx-3.5 mb-3.5 border border-[rgba(7,18,30,.1)] bg-white/40">
                  {its.length === 0 && <div className="p-2 text-[13px] text-sub">Bu guruhga xizmatlar hali kiritilmagan</div>}
                  {its.map((it) => (
                    <button key={it.id} type="button" onClick={() => addItem(it)} title="Faol bosqichga qo‘shish"
                      className="flex w-full items-stretch border-b border-[rgba(7,18,30,.1)] text-left text-sm last:border-b-0 hover:bg-white/60">
                      <span className="flex-1 px-1.5 py-[3px] leading-snug">{it.name}</span>
                      {d.show_price && <span className="w-[108px] flex-none border-l border-[rgba(7,18,30,.1)] px-1.5 py-[3px] text-right">{money(it.price)}.00</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {cats.data?.length === 0 && <div className="rounded-md border border-dashed border-line p-4 text-center text-sm text-sub">Prays bo‘sh. Sozlamalar → Prays bo‘limida xizmatlarni qo‘shing.</div>}
      </aside>
    </div>
  );
}
