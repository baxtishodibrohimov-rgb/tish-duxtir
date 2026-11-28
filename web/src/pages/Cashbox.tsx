import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Plus, Banknote, CreditCard, Smartphone, Landmark, Pencil, Trash2, Settings as Gear, WalletCards, ListChecks, Users, TrendingDown, X, UserRound, Download, Wallet, ChevronDown, ChevronRight, ChevronLeft, CalendarDays, Stethoscope } from 'lucide-react';
import { downloadXlsx, fileSafe, type XCell, type XSheet } from '@/lib/xlsx';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { addDays, dmy, dmyhm, hm, initials, isoDate, money, som } from '@/lib/format';
import { useQueryParam, useTitle } from '@/lib/router';
import type { Cashbox as Box, Counterparty, ExpenseCategory, MoneyMove, Patient } from '@/lib/types';
import { CounterpartyForm, CpTypesModal, useCpTypes } from '@/components/CounterpartyForm';
import { PatientPicker } from '@/components/PatientPicker';
import { Button, Card, Empty, Field, Input, Modal, PageLoader, PillTabs, Select, TD, TH, cx } from '@/components/ui';
import { TechList, TechProfile } from './Technicians';
import type { TechRow } from '@/lib/lab';

type Sub = 'boxes' | 'ops' | 'parties' | 'expenses';
const SUBS: { key: Sub; label: string; icon: typeof Banknote }[] = [
  { key: 'boxes', label: 'Kassalar', icon: WalletCards }, { key: 'ops', label: 'Operatsiyalar', icon: ListChecks },
  { key: 'parties', label: 'Kontragentlar', icon: Users }, { key: 'expenses', label: 'Xarajatlar', icon: TrendingDown },
];

/** "⬇ Excel" tugmasi — bosilganda .xlsx yuklab olinadi. */
function XlsBtn({ onClick, label = 'Excel', title = 'Excel faylga yuklab olish' }: { onClick: () => void; label?: string; title?: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} aria-label={title}
      className="inline-flex h-8 flex-none items-center gap-1.5 rounded-lg border border-[#16a34a]/40 bg-white px-2.5 text-[13px] font-medium text-[#15803d] hover:bg-[#f0fdf4]">
      <Download size={14} /> {label}
    </button>
  );
}
const periodText = (from: string, to: string) => (from === to ? dmy(from) : `${dmy(from)} – ${dmy(to)}`);

export const KIND: Record<MoneyMove['kind'], { label: string; tone: string }> = {
  income: { label: 'Kirim', tone: 'bg-ok-soft text-ok' },
  expense: { label: 'Xarajat', tone: 'bg-bad-soft text-[#b91c1c]' },
  transfer: { label: 'O‘tkazma', tone: 'bg-primary-soft text-[#006b93]' },
  refund: { label: 'Qaytarish', tone: 'bg-warn-soft text-warn' },
};
const METHOD_ICON: Record<string, typeof Banknote> = { cash: Banknote, terminal: CreditCard, click: Smartphone, bank: Landmark, other: Banknote };

type Period = { from: string; to: string };
const today = () => isoDate(new Date());

function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = today();
  const presets: [string, Period][] = [
    ['Bugun', { from: t, to: t }],
    ['Kecha', { from: isoDate(addDays(new Date(), -1)), to: isoDate(addDays(new Date(), -1)) }],
    ['7 kun', { from: isoDate(addDays(new Date(), -6)), to: t }],
    ['Shu oy', { from: t.slice(0, 8) + '01', to: t }],
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map(([l, p]) => (
        <button key={l} type="button" onClick={() => onChange(p)}
          className={cx('h-7 rounded-lg px-2.5 text-[13px] font-medium', value.from === p.from && value.to === p.to ? 'bg-nav text-nav-fg' : 'text-sub hover:bg-muted')}>{l}</button>
      ))}
      <input type="date" aria-label="Boshlanish sanasi" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className="h-7 rounded-lg border border-line bg-white px-2 text-[13px]" />
      <span className="text-sub">—</span>
      <input type="date" aria-label="Tugash sanasi" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className="h-7 rounded-lg border border-line bg-white px-2 text-[13px]" />
    </div>
  );
}

const DAY = 86400000;
const shift = (d: string, n: number) => isoDate(addDays(new Date(`${d}T00:00:00`), n));
function presetList(): [string, Period][] {
  const t = today(), now = new Date();
  const mon = isoDate(addDays(now, -((now.getDay() + 6) % 7)));
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1), pmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return [['Bugun', { from: t, to: t }], ['Kecha', { from: shift(t, -1), to: shift(t, -1) }], ['Shu hafta', { from: mon, to: t }],
    ['Shu oy', { from: t.slice(0, 8) + '01', to: t }], ['O‘tgan oy', { from: isoDate(pm), to: isoDate(pmEnd) }]];
}
/** Davr nomi: "Bugun", "Kecha", "Shu oy" yoki sanalar. */
function periodLabel(p: Period) {
  const hit = presetList().find(([, x]) => x.from === p.from && x.to === p.to);
  if (hit) return hit[0];
  return p.from === p.to ? dmy(p.from) : `${dmy(p.from)} – ${dmy(p.to)}`;
}
/** Ixcham sana tanlash: ‹ [📅 Bugun ▾] ›, ochilganda tez tanlovlar va oraliq. */
function DateRange({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const len = Math.round((+new Date(`${value.to}T00:00:00`) - +new Date(`${value.from}T00:00:00`)) / DAY) + 1;
  const move = (dir: 1 | -1) => onChange({ from: shift(value.from, dir * len), to: shift(value.to, dir * len) });
  const B = 'grid h-10 w-9 place-items-center rounded-lg text-sub hover:bg-muted md:h-7 md:w-7';
  return (
    <div className="relative flex items-center">
      <button type="button" onClick={() => move(-1)} aria-label="Oldingi davr" className={B}><ChevronLeft size={16} /></button>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog"
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-sm font-medium md:h-7 md:text-[13px]">
        <CalendarDays size={14} className="text-primary" />{periodLabel(value)}<ChevronDown size={14} className="text-sub" />
      </button>
      <button type="button" onClick={() => move(1)} disabled={value.to >= today()} aria-label="Keyingi davr" className={cx(B, 'disabled:opacity-30')}><ChevronRight size={16} /></button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div role="dialog" aria-label="Davrni tanlash" className="absolute top-full right-0 z-50 mt-1 flex w-[300px] flex-col gap-2 rounded-xl border border-line bg-white p-3 shadow-pop">
          <div className="flex flex-wrap gap-1.5">
            {presetList().map(([l, p]) => (
              <button key={l} type="button" onClick={() => { onChange(p); setOpen(false); }}
                className={cx('h-8 rounded-lg px-2.5 text-[13px] font-medium', value.from === p.from && value.to === p.to ? 'bg-primary text-white' : 'bg-muted text-[#3d4858] hover:bg-[#e6edf2]')}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 border-t border-line pt-2">
            <input type="date" aria-label="Boshlanish sanasi" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 text-[13px]" />
            <span className="text-sub">—</span>
            <input type="date" aria-label="Tugash sanasi" value={value.to} min={value.from} max={today()} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 text-[13px]" />
          </div>
        </div>
      </>}
    </div>
  );
}

export function Cashbox() {
  useTitle('Kassa');
  const [sub, setSub] = useQueryParam<Sub>('tab', 'boxes');
  const [period, setPeriod] = useState<Period>({ from: today(), to: today() });
  const [boxPeriod, setBoxPeriod] = useState<Period>({ from: today(), to: today() }); // har ochilganda — bugun
  const [op, setOp] = useState<MoneyMove['kind'] | null>(null);
  const [gear, setGear] = useState(false);
  const { can, branch } = useOrg();
  const edit = can('cashbox.edit', branch.id);
  const ACT = 'inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 text-sm text-fg hover:bg-muted md:h-6 md:flex-none md:border-0 md:bg-transparent md:text-[13px] md:text-sub';

  return (
    <div className="flex flex-col gap-3 px-3 pt-2 pb-6 md:px-6 md:pt-1">
      <div className="flex flex-col gap-2 border-b border-line pb-2 md:flex-row md:flex-wrap md:items-center md:gap-1 md:pb-1">
        <div role="tablist" className="-mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {SUBS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={sub === t.key} onClick={() => setSub(t.key)}
              className={cx('inline-flex h-9 flex-none items-center gap-1.5 rounded-lg px-3 text-[15px] whitespace-nowrap md:h-5 md:rounded md:px-2 md:text-sm', sub === t.key ? 'bg-primary font-medium text-white' : 'text-[#3d4858] hover:text-fg')}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <span className="hidden flex-1 md:block" />
        <div className="flex flex-wrap items-center gap-1.5 md:gap-1">
          {sub === 'boxes' && <DateRange value={boxPeriod} onChange={setBoxPeriod} />}
          {edit && (sub === 'boxes' || sub === 'ops') && <>
            <button type="button" onClick={() => setOp('income')} className={ACT}><ArrowDownLeft size={14} className="text-ok" /> Kirim</button>
            <button type="button" onClick={() => setOp('expense')} className={ACT}><ArrowUpRight size={14} className="text-bad" /> Xarajat</button>
            <button type="button" onClick={() => setOp('transfer')} className={ACT}><ArrowLeftRight size={14} /> <span className="md:hidden">Ko‘chirish</span><span className="hidden md:inline">Kassadan kassaga</span></button>
          </>}
          <button type="button" onClick={() => setGear(true)} aria-label="Kassa sozlamalari" title="Kassa sozlamalari" className="ml-auto grid h-10 w-10 flex-none place-items-center rounded-lg text-sub hover:bg-muted md:ml-0 md:h-6 md:w-6 md:rounded"><Gear size={16} /></button>
        </div>
      </div>
      {sub === 'ops' && <PeriodPicker value={period} onChange={setPeriod} />}
      {sub === 'boxes' && <Boxes period={boxPeriod} />}
      {sub === 'ops' && <Operations period={period} />}
      {sub === 'parties' && <Parties />}
      {sub === 'expenses' && <Expenses onAdd={() => setOp('expense')} />}
      {op && <MoveModal kind={op} onClose={() => setOp(null)} />}
      {gear && (
        <Modal open onClose={() => setGear(false)} title="Kassa sozlamalari" width={720}>
          <div className="grid gap-4 md:grid-cols-2"><ExpenseCats /><Rates /></div>
        </Modal>
      )}
    </div>
  );
}

interface Summary { work_done: number; income: number; expense: number; profit: number; cashboxes: { cashbox_id: string; name: string; method: string; balance: number; period_income: number; period_out: number; period_in_transfer: number }[] }
const METHOD_COLOR: Record<string, string> = { cash: 'text-ok', terminal: 'text-primary', click: 'text-[#9333ea]', bank: 'text-sub', other: 'text-sub' };

interface Details {
  work: { patient_id: string; who: string; doc: string | null; work: number; paid: number }[];
  income: { id: string; at: string; kind: string; amount: number; who: string | null; box: string; by_name: string | null; doctor_id: string | null; doc: string | null }[];
  expense: { id: string; at: string; amount: number; box: string; by_name: string | null; who: string }[];
  shares: Share[];
  share_percent: number;
}
/** Har bir to'lovdan shifokorga: base — price (prays ulushi), default (umumiy foiz), mixed. */
interface Share { id: string; share: number; base: 'price' | 'default' | 'mixed'; works: string | null }
type IncomeRow = Details['income'][number] & { share: number; base: Share['base'] | null; works: string | null };
type CardKey = 'ish' | 'pul' | 'xar' | 'foyda';

function Boxes({ period }: { period: Period }) {
  const { branch } = useOrg();
  const { from, to } = period;
  const lbl = periodLabel(period);
  const oneDay = from === to;
  const s = useQuery({ queryKey: ['cash', 'summary', branch.id, from, to], queryFn: () => http.get<Summary>(`/api/cash/summary?branch_id=${branch.id}&from=${from}&to=${to}`) });
  const det = useQuery({ queryKey: ['cash', 'details', branch.id, from, to], queryFn: () => http.get<Details>(`/api/cash/details?branch_id=${branch.id}&from=${from}&to=${to}`) });
  const [open, setOpen] = useState<CardKey | null>(null);
  const [boxOpen, setBoxOpen] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  // Kassaga tushgan to'lovlar (qaytarishlar ham, minus bilan) va har biridan shifokorga.
  const incomeRows = useMemo<IncomeRow[]>(() => {
    const sm = new Map((det.data?.shares ?? []).map((x) => [x.id, x]));
    return (det.data?.income ?? []).map((m) => ({ ...m, share: Number(sm.get(m.id)?.share ?? 0), base: sm.get(m.id)?.base ?? null, works: sm.get(m.id)?.works ?? null }));
  }, [det.data]);
  const docs = useDocs(incomeRows);
  if (s.isLoading) return <PageLoader />;
  const d = s.data!;
  const x = det.data;
  const cards: [CardKey, string, number, string][] = [
    ['ish', 'qilingan ish', d.work_done, 'text-fg'], ['pul', 'kassaga tushgan pul', d.income, 'text-ok'], ['xar', 'xarajat', d.expense, 'text-[#b91c1c]'], ['foyda', 'foyda', d.profit, d.profit >= 0 ? 'text-[#0086b8]' : 'text-[#b91c1c]'],
  ];
  const titles: Record<CardKey, string> = { ish: 'Qilingan ish — har bir bemor bo‘yicha', pul: 'Kassaga tushgan pul — har bir to‘lov', xar: 'Xarajat — har bir chiqim', foyda: 'Foyda qanday hisoblandi' };
  const allIn = incomeRows.reduce((a, m) => a + (m.kind === 'refund' ? -m.amount : m.amount), 0);
  const TH_ = 'px-3 py-2 font-medium';
  const NUM = 'px-3 py-2 text-right whitespace-nowrap tabular-nums';
  const per = periodText(from, to);
  const tm = (at: string) => dmyhm(at);
  const fname = (what: string) => `${fileSafe(what)}_${fileSafe(branch.name)}_${from === to ? from : `${from}_${to}`}.xlsx`;
  // Kartalar tafsiloti → Excel
  function exportCard(k: CardKey) {
    if (!x) return;
    const head: XCell[][] = [[`${titles[k]} · ${branch.name} · ${per}`], []];
    let rows: XCell[][] = [];
    if (k === 'ish') rows = [['Bemor', 'Shifokor', 'Qilingan ish', 'To‘langan', 'Qarz'],
      ...x.work.map((w) => [w.who, w.doc ?? '', Number(w.work), Number(w.paid), Math.max(0, w.work - w.paid)]),
      ['Jami', '', Number(d.work_done), x.work.reduce((a, w) => a + Number(w.paid), 0), x.work.reduce((a, w) => a + Math.max(0, w.work - w.paid), 0)]];
    if (k === 'pul') rows = [['Vaqt', 'Bemor', 'Shifokor', 'To‘lov usuli', 'Kim kiritdi', 'Summa'],
      ...x.income.map((m) => [tm(m.at), m.who ?? '', m.doc ?? '', m.box, m.by_name ?? '', m.kind === 'refund' ? -Number(m.amount) : Number(m.amount)]),
      ['Jami', '', '', '', '', Number(d.income)]];
    if (k === 'xar') rows = [['Vaqt', 'Nima uchun / kimga', 'To‘lov usuli', 'Kim kiritdi', 'Summa'],
      ...x.expense.map((m) => [tm(m.at), m.who ?? '', m.box, m.by_name ?? '', Number(m.amount)]), ['Jami', '', '', '', Number(d.expense)]];
    if (k === 'foyda') rows = [['Ko‘rsatkich', 'Summa'], ['Kassaga tushgan pul', Number(d.income)], ['Xarajat', -Number(d.expense)], ['Foyda', Number(d.profit)]];
    downloadXlsx(fname(titles[k].split(' — ')[0]!), [{ name: titles[k].split(' — ')[0]!, rows: [...head, ...rows], bold: [0, 2, head.length + rows.length - 1] }]);
  }
  // Shifokor varag'i: har bir to'lov, qaysi ish uchun va shifokorga qancha.
  const baseText = (r: IncomeRow) => (r.base === 'price' ? r.works ?? 'prays' : r.base === 'mixed' ? `${r.works ?? ''} + umumiy ${x?.share_percent ?? 30}%` : `umumiy ${x?.share_percent ?? 30}%`);
  const signed = (r: IncomeRow) => (r.kind === 'refund' ? -r.amount : r.amount);
  const doctorSheet = (g: (typeof docs)[number]): XSheet => {
    const pays: XCell[][] = g.rows.map((r) => [tm(r.at), r.who ?? '', r.box, signed(r), baseText(r), r.share]);
    const rows: XCell[][] = [[`Shifokor: ${g.name}`], [`${branch.name} · ${per}`], [],
      ['Vaqt', 'Bemor', 'To‘lov usuli', 'To‘langan', 'Ish (ulush)', 'Shifokorga'], ...pays,
      ['Jami', `${g.patients} ta bemor`, '', g.sum, '', g.earned]];
    return { name: g.name, rows, bold: [0, 3, rows.length - 1], widths: [18, 26, 14, 14, 34, 14] };
  };
  const allEarned = docs.reduce((a, g) => a + g.earned, 0);
  function exportDoctors() {
    const sum: XCell[][] = [[`Shifokorlar qancha topdi · ${branch.name} · ${per}`], [], ['Shifokor', 'Bemorlar', 'Kassaga tushgan', 'Shifokorga'],
      ...docs.map((g) => [g.name, g.patients, g.sum, g.earned]),
      ['Jami', docs.reduce((a, g) => a + g.patients, 0), allIn, allEarned]];
    downloadXlsx(fname('Shifokorlar'), [{ name: 'Umumiy', rows: sum, bold: [0, 2, sum.length - 1], widths: [28, 12, 18, 16] }, ...docs.map(doctorSheet)]);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {cards.map(([k, l, v, c]) => (
          <button key={k} type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}
            className={cx('flex flex-[1_1_240px] flex-col items-start gap-2 rounded-card border p-6 text-left shadow-[0_1px_2px_rgba(7,18,30,.04),0_2px_8px_rgba(7,18,30,.04)]',
              open === k ? 'border-primary bg-[#f3fafd] shadow-[0_0_0_3px_rgba(0,161,219,.15)]' : 'border-line bg-white hover:border-[#b6e3f4]')}>
            <span className="flex w-full items-center justify-between text-sm text-sub">{lbl} — {l}<ChevronDown size={16} className={cx('transition-transform', open === k && 'rotate-180')} /></span>
            <span className={cx('text-[32px] leading-tight font-bold tracking-[-0.02em]', c)}>{som(v)}</span>
          </button>
        ))}
      </div>
      {open && (
        <section className="overflow-hidden rounded-2xl border border-[#b6e3f4] bg-white shadow-[0_1px_2px_rgba(7,18,30,.04),0_2px_8px_rgba(7,18,30,.04)]">
          <div className="flex items-center gap-2 border-b border-line bg-[#f3fafd] px-4 py-3">
            <h3 className="m-0 flex-1 text-[15px] font-semibold">{titles[open]}</h3>
            {x && <XlsBtn onClick={() => exportCard(open)} />}
            <button type="button" onClick={() => setOpen(null)} aria-label="Yopish" className="grid h-7 w-7 place-items-center rounded-md text-sub"><X size={16} /></button>
          </div>
          <div className="overflow-x-auto">
            {!x ? <div className="p-4"><PageLoader /></div> : open === 'foyda' ? (
              <div className="flex max-w-[520px] flex-col px-4 pt-2 pb-3.5">
                <div className="flex justify-between gap-4 border-b border-line py-2.5"><span>Kassaga tushgan pul</span><b className="text-ok tabular-nums">+ {som(d.income)}</b></div>
                <div className="flex justify-between gap-4 border-b border-line py-2.5"><span>Xarajat</span><b className="text-[#b91c1c] tabular-nums">− {som(d.expense)}</b></div>
                <div className="flex justify-between gap-4 pt-3 text-base"><b>Foyda</b><b className="text-[#0086b8] tabular-nums">= {som(d.profit)}</b></div>
                <span className="mt-2 text-xs text-sub">Foyda kassaga haqiqatda tushgan pul bo‘yicha hisoblanadi, qilingan ish bo‘yicha emas.</span>
              </div>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="bg-muted/50"><tr className="text-left text-xs text-sub uppercase">
                  {open === 'ish' && <><th className={TH_}>Bemor</th><th className={TH_}>Shifokor</th><th className={cx(TH_, 'text-right')}>Qilingan ish</th><th className={cx(TH_, 'text-right')}>To‘langan</th><th className={cx(TH_, 'text-right')}>Qarz</th></>}
                  {open === 'pul' && <><th className={TH_}>Vaqt</th><th className={TH_}>Bemor</th><th className={TH_}>Shifokor</th><th className={TH_}>To‘lov usuli</th><th className={TH_}>Kim kiritdi</th><th className={cx(TH_, 'text-right')}>Summa</th></>}
                  {open === 'xar' && <><th className={TH_}>Vaqt</th><th className={TH_}>Nima uchun / kimga</th><th className={TH_}>To‘lov usuli</th><th className={TH_}>Kim kiritdi</th><th className={cx(TH_, 'text-right')}>Summa</th></>}
                </tr></thead>
                <tbody>
                  {open === 'ish' && x.work.map((w) => { const debt = Math.max(0, w.work - w.paid); return (
                    <tr key={w.patient_id} className="border-t border-line"><td className="px-3 py-2 font-medium">{w.who}</td><td className="px-3 py-2 whitespace-nowrap text-[#3d4858]">{w.doc ?? '—'}</td>
                      <td className={cx(NUM, 'font-semibold')}>{som(w.work)}</td><td className={cx(NUM, 'text-ok')}>{som(w.paid)}</td>
                      <td className={cx(NUM, debt ? 'font-semibold text-warn' : 'text-sub')}>{debt ? som(debt) : '—'}</td></tr>); })}
                  {open === 'pul' && (x.income).map((m) => (
                    <tr key={m.id} className="border-t border-line"><td className="px-3 py-2 whitespace-nowrap text-sub">{oneDay ? hm(m.at) : dmyhm(m.at)}</td><td className="px-3 py-2 font-medium">{m.who ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-[#3d4858]">{m.doc ?? '—'}</td><td className="px-3 py-2 text-[#3d4858]">{m.box}</td><td className="px-3 py-2 text-sub">{m.by_name ?? '—'}</td>
                      <td className={cx(NUM, 'font-semibold', m.kind === 'refund' ? 'text-[#b91c1c]' : 'text-ok')}>{m.kind === 'refund' ? '−' : ''}{som(m.amount)}</td></tr>))}
                  {open === 'xar' && x.expense.map((m) => (
                    <tr key={m.id} className="border-t border-line"><td className="px-3 py-2 whitespace-nowrap text-sub">{oneDay ? hm(m.at) : dmyhm(m.at)}</td><td className="px-3 py-2 font-medium">{m.who || '—'}</td>
                      <td className="px-3 py-2 text-[#3d4858]">{m.box}</td><td className="px-3 py-2 text-sub">{m.by_name ?? '—'}</td><td className={cx(NUM, 'font-semibold text-[#b91c1c]')}>{som(m.amount)}</td></tr>))}
                  {((open === 'ish' && !x.work.length) || (open === 'pul' && !x.income.length) || (open === 'xar' && !x.expense.length)) && <tr><td colSpan={6} className="p-6 text-center text-sub">Bu davrda yozuv yo‘q</td></tr>}
                  <tr className="border-t-2 border-line bg-muted/50 font-bold">
                    {open === 'ish' && <><td className="px-3 py-2" colSpan={2}>Jami</td><td className={NUM}>{som(d.work_done)}</td><td className={cx(NUM, 'text-ok')}>{som(x.work.reduce((a, w) => a + w.paid, 0))}</td><td className={cx(NUM, 'text-warn')}>{som(x.work.reduce((a, w) => a + Math.max(0, w.work - w.paid), 0))}</td></>}
                    {open === 'pul' && <><td className="px-3 py-2" colSpan={5}>Jami</td><td className={cx(NUM, 'text-ok')}>{som(d.income)}</td></>}
                    {open === 'xar' && <><td className="px-3 py-2" colSpan={4}>Jami</td><td className={cx(NUM, 'text-[#b91c1c]')}>{som(d.expense)}</td></>}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {d.cashboxes.map((b) => {
          const Ic = METHOD_ICON[b.method] ?? Banknote;
          const on = boxOpen === b.cashbox_id;
          const out = Number(b.period_out), tin = Number(b.period_in_transfer);
          return (
            <button key={b.cashbox_id} type="button" onClick={() => setBoxOpen(on ? null : b.cashbox_id)} aria-expanded={on}
              className={cx('flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left', on ? 'border-primary bg-[#f2fbff]' : 'border-line bg-white hover:border-primary/50')}>
              <span className="flex w-full items-center gap-1.5 text-[13px] text-sub"><Ic size={16} className={METHOD_COLOR[b.method]} /> {b.name}
                <ChevronDown size={15} className={cx('ml-auto transition-transform', on && 'rotate-180')} /></span>
              <span className="text-xl font-semibold text-ok">{lbl}: +{som(b.period_income)}</span>
              <span className="text-xs text-sub">
                {out > 0 && <span className="text-bad">chiqim −{money(out)} · </span>}
                {tin > 0 && <span>kassadan +{money(tin)} · </span>}
                qoldiq <b className="font-semibold text-fg">{som(b.balance)}</b>
              </span>
            </button>
          );
        })}
      </div>
      {boxOpen && d.cashboxes.some((b) => b.cashbox_id === boxOpen) && (
        <BoxDetail box={d.cashboxes.find((b) => b.cashbox_id === boxOpen)!} from={from} to={to} lbl={lbl} oneDay={oneDay} onClose={() => setBoxOpen(null)} />
      )}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(7,18,30,.04),0_2px_8px_rgba(7,18,30,.04)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5">
          <Stethoscope size={18} className="text-primary" />
          <h3 className="m-0 flex-1 text-base font-semibold">{lbl} — shifokorlar qancha topdi</h3>
          <span className="text-[13px] text-sub">Kassaga tushgan: <b className="text-fg">{som(allIn)}</b> · shifokorlarga: <b className="text-[#5b21b6]">{som(allEarned)}</b></span>
          {docs.length > 0 && <XlsBtn onClick={exportDoctors} title="Barcha shifokorlar hisoboti (har biri alohida varaqda)" />}
        </div>
        {docs.length === 0 && <div className="p-6 text-center text-sm text-sub">Bu davrda to‘lov yo‘q</div>}
        {docs.map((g, i) => {
          const p = allIn ? Math.round((g.sum * 100) / allIn) : 0, on = doc === g.key;
          return (
            <div key={g.key} className={cx(i > 0 && 'border-t border-line', on && 'bg-[#f3fafd]')}>
              <button type="button" onClick={() => setDoc(on ? null : g.key)} aria-expanded={on} className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left">
                <ChevronRight size={16} className={cx('flex-none transition-transform', on && 'rotate-90')} />
                <span className="flex min-w-[160px] flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold">{g.name}</span><span className="text-xs text-sub">{g.patients} ta bemor · {p}%</span></span>
                <span className="h-1.5 w-[140px] overflow-hidden rounded-full bg-[#eef3f6]"><span className="block h-full rounded-full bg-primary" style={{ width: `${p}%` }} /></span>
                <span className="min-w-[130px] text-right text-base font-bold whitespace-nowrap tabular-nums">{som(g.sum)}</span>
                <span className="flex min-w-[150px] flex-col items-end gap-0.5 rounded-[10px] bg-[#f3effe] px-2.5 py-1.5 whitespace-nowrap tabular-nums">
                  <span className="text-[11px] text-[#5b21b6]">Shifokorga</span><b className="text-sm text-[#5b21b6]">{som(g.earned)}</b>
                </span>
              </button>
              {on && (
                <div className="overflow-x-auto px-4 pb-3.5 pl-11">
                  <div className="mb-2 flex justify-end"><XlsBtn label={`${g.name} — Excel`} title="Shu shifokorning hisoboti" onClick={() => downloadXlsx(fname(g.name), [doctorSheet(g)])} /></div>
                  <table className="w-full overflow-hidden rounded-[10px] border border-line bg-white text-sm">
                    <thead className="bg-muted/70"><tr className="text-left text-xs text-sub uppercase"><th className={TH_}>Vaqt</th><th className={TH_}>Bemor</th><th className={TH_}>To‘lov</th><th className={cx(TH_, 'text-right')}>To‘langan</th><th className={TH_}>Ish (ulush)</th><th className={cx(TH_, 'text-right')}>Shifokorga</th></tr></thead>
                    <tbody>{g.rows.map((r) => (
                      <tr key={r.id} className="border-t border-line"><td className="px-3 py-2 whitespace-nowrap text-sub">{oneDay ? hm(r.at) : dmyhm(r.at)}</td><td className="px-3 py-2 font-medium">{r.who ?? '—'}</td><td className="px-3 py-2 text-[#3d4858]">{r.box}</td>
                        <td className={cx(NUM, 'font-semibold', r.kind === 'refund' ? 'text-bad' : 'text-ok')}>{som(signed(r))}</td>
                        <td className={cx('px-3 py-2 text-[13px]', r.base === 'default' ? 'text-sub' : 'text-[#3d4858]')}>{baseText(r)}</td>
                        <td className={cx(NUM, 'font-semibold', r.share < 0 ? 'text-bad' : 'text-[#5b21b6]')}>{som(r.share)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** Kassa kartasi bosilganda: shu kassaning tanlangan davrdagi barcha harakatlari. */
function BoxDetail({ box, from, to, lbl, oneDay, onClose }: { box: Summary['cashboxes'][number]; from: string; to: string; lbl: string; oneDay: boolean; onClose: () => void }) {
  const { memberName } = useOrg();
  const range = { 'moved_at.gte': new Date(`${from}T00:00:00`).toISOString(), 'moved_at.lt': addDays(new Date(`${to}T00:00:00`), 1).toISOString() };
  const own = useList<MoneyMove>('money_moves', { cashbox_id: box.cashbox_id, ...range }, { limit: 2000 });
  const inc = useList<MoneyMove>('money_moves', { to_cashbox_id: box.cashbox_id, kind: 'transfer', ...range }, { limit: 2000 });
  const rows = [...(own.data ?? []), ...(inc.data ?? [])].sort((a, b) => b.moved_at.localeCompare(a.moved_at));
  const pids = [...new Set(rows.map((m) => m.patient_id).filter(Boolean))] as string[];
  const pats = useList<Patient>('patients', { 'id.in': pids }, { enabled: pids.length > 0 });
  const cps = useList<Counterparty>('counterparties');
  const boxes = useList<Box>('cashboxes');
  const pm = byId(pats.data), cm = byId(cps.data), bm = byId(boxes.data);
  // Shu kassa nuqtai nazaridan: + kirdi, − chiqdi.
  const sign = (m: MoneyMove) => (m.kind === 'income' || (m.kind === 'transfer' && m.to_cashbox_id === box.cashbox_id) ? 1 : -1);
  const KIND: Record<string, string> = { income: 'To‘lov', refund: 'Qaytarish', expense: 'Xarajat', transfer: 'Kassadan kassaga' };
  const who = (m: MoneyMove) => m.patient_id ? pm.get(m.patient_id)?.full_name ?? 'Bemor'
    : m.counterparty_id ? cm.get(m.counterparty_id)?.name ?? ''
    : m.kind === 'transfer' ? (sign(m) > 0 ? `${bm.get(m.cashbox_id)?.name ?? ''} dan` : `${bm.get(m.to_cashbox_id ?? '')?.name ?? ''} ga`) : '';
  const total = rows.reduce((a, m) => a + sign(m) * m.amount, 0);
  const NUM = 'px-3 py-2 text-right whitespace-nowrap tabular-nums';
  return (
    <section className="overflow-hidden rounded-2xl border border-primary bg-white">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="m-0 flex-1 text-base font-semibold">{box.name} — {lbl}</h3>
        {rows.length > 0 && <XlsBtn onClick={() => downloadXlsx(`${fileSafe(box.name)}_${from === to ? from : `${from}_${to}`}.xlsx`, [{
          name: box.name, bold: [0, 2, rows.length + 3],
          rows: [[`${box.name} · ${periodText(from, to)}`], [], ['Vaqt', 'Turi', 'Kimdan / kimga', 'Izoh', 'Kiritdi', 'Summa'],
            ...rows.map((m) => [dmyhm(m.moved_at), KIND[m.kind] ?? m.kind, who(m), m.note ?? '', memberName(m.created_by), sign(m) * m.amount]),
            ['Davr bo‘yicha jami', '', '', '', '', total]],
        }])} />}
        <button type="button" onClick={onClose} aria-label="Yopish" className="grid h-8 w-8 place-items-center rounded-md text-sub hover:bg-muted"><X size={16} /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/70"><tr className="text-left text-xs text-sub uppercase">
            <th className="px-3 py-2 font-medium">Vaqt</th><th className="px-3 py-2 font-medium">Turi</th><th className="px-3 py-2 font-medium">Kimdan / kimga</th>
            <th className="px-3 py-2 font-medium">Izoh</th><th className="px-3 py-2 font-medium">Kiritdi</th><th className={cx(NUM, 'font-medium')}>Summa</th>
          </tr></thead>
          <tbody>
            {(own.isLoading || inc.isLoading) && <tr><td colSpan={6} className="p-6 text-center text-sub">Yuklanmoqda…</td></tr>}
            {!own.isLoading && !inc.isLoading && rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sub">Bu davrda harakat yo‘q</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="px-3 py-2 whitespace-nowrap text-sub">{oneDay ? hm(m.moved_at) : dmyhm(m.moved_at)}</td>
                <td className="px-3 py-2">{KIND[m.kind] ?? m.kind}</td>
                <td className="px-3 py-2 font-medium">{who(m) || '—'}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-sub">{m.note}</td>
                <td className="px-3 py-2 text-sub">{memberName(m.created_by)}</td>
                <td className={cx(NUM, 'font-semibold', sign(m) > 0 ? 'text-ok' : 'text-bad')}>{sign(m) > 0 ? '+' : '−'}{money(m.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="border-t-2 border-line font-semibold"><td colSpan={5} className="px-3 py-2">Davr bo‘yicha jami</td>
            <td className={cx(NUM, total >= 0 ? 'text-ok' : 'text-bad')}>{total >= 0 ? '+' : '−'}{money(Math.abs(total))}</td></tr></tfoot>}
        </table>
      </div>
    </section>
  );
}

/** Shifokorlar bo'yicha guruhlash: to'lovda tanlangan shifokor (bo'lmasa akt shifokori). */
function useDocs(rows: IncomeRow[]) {
  return useMemo(() => {
    const m = new Map<string, { key: string; name: string; sum: number; earned: number; pats: Set<string>; rows: IncomeRow[] }>();
    for (const r of rows) {
      const key = r.doctor_id ?? '-';
      const g = m.get(key) ?? { key, name: r.doc ?? 'Shifokor ko‘rsatilmagan', sum: 0, earned: 0, pats: new Set<string>(), rows: [] };
      g.sum += r.kind === 'refund' ? -r.amount : r.amount; g.earned += r.share; if (r.who) g.pats.add(r.who); g.rows.push(r); m.set(key, g);
    }
    return [...m.values()].map((g) => ({ ...g, patients: g.pats.size })).sort((a, b) => b.sum - a.sum);
  }, [rows]);
}

function Operations({ period }: { period: Period }) {
  const { branch, members, memberName } = useOrg();
  const [kind, setKind] = useState('');
  const [pat, setPat] = useState('');
  const [by, setBy] = useState('');
  const [doc, setDoc] = useState('');
  const from = new Date(period.from + 'T00:00:00').toISOString();
  const to = new Date(addDays(new Date(period.to + 'T00:00:00'), 1)).toISOString();
  const moves = useList<MoneyMove>('money_moves', {
    branch_id: branch.id, 'moved_at.gte': from, 'moved_at.lt': to,
    kind: kind || undefined, created_by: by || undefined, doctor_id: doc || undefined,
  }, { limit: 2000 });
  const pids = [...new Set((moves.data ?? []).map((m) => m.patient_id).filter(Boolean) as string[])];
  const patients = useList<Patient>('patients', { 'id.in': pids }, { enabled: pids.length > 0 });
  const boxes = useList<Box>('cashboxes');
  const cps = useList<Counterparty>('counterparties');
  const cats = useList<ExpenseCategory>('expense_categories');
  const pm = byId(patients.data), bm = byId(boxes.data), cm = byId(cps.data), catm = byId(cats.data);
  const rows = (moves.data ?? []).filter((m) => !pat || (m.patient_id && pm.get(m.patient_id)?.full_name.toLowerCase().includes(pat.toLowerCase())));
  const sum = rows.reduce((a, m) => a + (m.kind === 'income' ? m.amount : m.kind === 'transfer' ? 0 : -m.amount), 0);
  const doctors = members.filter((m) => ['doctor', 'owner'].includes(m.role));
  const lbl = 'text-xs text-sub';
  const sel = 'h-8 rounded-lg border border-line bg-white px-2 text-sm';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5"><span className={lbl}>Turi</span>
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Hammasi</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lbl}>Bemor ismi</span>
          <input type="search" placeholder="Qidirish..." className={sel} value={pat} onChange={(e) => setPat(e.target.value)} /></label>
        <label className="flex flex-col gap-0.5"><span className={lbl}>Kim kiritdi</span>
          <select className={sel} value={by} onChange={(e) => setBy(e.target.value)}>
            <option value="">Hammasi</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lbl}>Shifokor</span>
          <select className={sel} value={doc} onChange={(e) => setDoc(e.target.value)}>
            <option value="">Hammasi</option>{doctors.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </select></label>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setKind(''); setPat(''); setBy(''); setDoc(''); }}>Tozalash</Button>
        <span className="ml-auto text-sm text-sub">{rows.length} ta operatsiya · jami <b className="text-fg">{som(sum)}</b></span>
        {rows.length > 0 && <XlsBtn onClick={() => downloadXlsx(`Operatsiyalar_${fileSafe(branch.name)}_${period.from}_${period.to}.xlsx`, [{
          name: 'Operatsiyalar', bold: [0, 2, rows.length + 3],
          rows: [[`Operatsiyalar · ${branch.name} · ${periodText(period.from, period.to)}`], [], ['Vaqt', 'Turi', 'Bemor / kontragent / kategoriya', 'Izoh', 'Shifokor', 'To‘lov usuli', 'Kim kiritdi', 'Summa'],
            ...rows.map((m) => [dmyhm(m.moved_at), KIND[m.kind].label,
              m.patient_id ? pm.get(m.patient_id)?.full_name ?? '' : m.counterparty_id ? cm.get(m.counterparty_id)?.name ?? '' : m.category_id ? catm.get(m.category_id)?.name ?? '' : '',
              m.note ?? '', m.doctor_id ? memberName(m.doctor_id) : '', `${bm.get(m.cashbox_id)?.name ?? ''}${m.to_cashbox_id ? ` → ${bm.get(m.to_cashbox_id)?.name ?? ''}` : ''}`,
              memberName(m.created_by), m.kind === 'income' ? m.amount : m.kind === 'transfer' ? m.amount : -m.amount]),
            ['Jami (o‘tkazmalarsiz)', '', '', '', '', '', '', sum]],
        }])} />}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-muted"><tr>
            <th className={TH}>Vaqt</th><th className={TH}>Turi</th><th className={TH}>Bemor / izoh</th><th className={TH}>Shifokor (kimning ishi)</th>
            <th className={TH}>To‘lov usuli</th><th className={TH}>Kim kiritdi</th><th className={`${TH} text-right`}>Summa</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-sub">Filtr bo‘yicha operatsiya topilmadi.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id}>
                <td className={`${TD} whitespace-nowrap text-sub`}>{dmyhm(m.moved_at)}</td>
                <td className={TD}><span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', KIND[m.kind].tone)}>{KIND[m.kind].label}</span></td>
                <td className={TD}>
                  {m.patient_id ? pm.get(m.patient_id)?.full_name : m.counterparty_id ? cm.get(m.counterparty_id)?.name : m.category_id ? catm.get(m.category_id)?.name : ''}
                  {m.note && <span className="text-sub"> · {m.note}</span>}
                </td>
                <td className={TD}>{m.doctor_id ? memberName(m.doctor_id) : '—'}</td>
                <td className={TD}>{bm.get(m.cashbox_id)?.name}{m.to_cashbox_id && ` → ${bm.get(m.to_cashbox_id)?.name}`}</td>
                <td className={TD}>{memberName(m.created_by)}</td>
                <td className={cx(TD, 'text-right font-semibold whitespace-nowrap', m.kind === 'income' ? 'text-ok' : m.kind === 'transfer' ? '' : 'text-bad')}>
                  {m.kind === 'income' ? '+' : m.kind === 'transfer' ? '' : '−'}{money(m.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MoveModal({ kind, onClose }: { kind: MoneyMove['kind']; onClose: () => void }) {
  const { branch, members } = useOrg();
  const boxes = useList<Box>('cashboxes', { branch_id: branch.id, archived: false });
  const cats = useList<ExpenseCategory>('expense_categories', { archived: false });
  const cps = useList<Counterparty>('counterparties', { archived: false });
  const ct = useCpTypes();
  const [box, setBox] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctor, setDoctor] = useState('');
  const [cat, setCat] = useState('');
  const [cp, setCp] = useState('');
  const [note, setNote] = useState('');
  const [newCat, setNewCat] = useState('');
  const doctors = members.filter((m) => ['doctor', 'owner'].includes(m.role));
  const cb = box || boxes.data?.[0]?.id || '';
  const save = useAction(async () => {
    if (!(Number(amount) > 0)) throw new Error('Summani kiriting');
    let category = cat;
    if (kind === 'expense' && newCat.trim()) category = (await db.insert<ExpenseCategory>('expense_categories', { name: newCat.trim() })).id;
    return db.insert('money_moves', {
      kind, cashbox_id: cb, amount: Math.round(Number(amount)), note,
      to_cashbox_id: kind === 'transfer' ? to : null,
      patient_id: kind === 'income' ? patient?.id ?? null : null,
      doctor_id: kind === 'income' ? doctor || null : null,
      category_id: kind === 'expense' ? category || null : null,
      counterparty_id: kind === 'expense' ? cp || null : null,
    });
  }, { invalidate: ['money_moves', 'cash', 'expense_categories', 'patients'], success: 'Saqlandi', onDone: onClose });
  const title = kind === 'income' ? 'Kirim' : kind === 'expense' ? 'Xarajat' : 'Kassadan kassaga o‘tkazish';

  return (
    <Modal open onClose={onClose} title={title} width={500}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'transfer' ? 'Qaysi kassadan' : 'Kassa'}>{(id) => (
            <Select id={id} value={cb} onChange={(e) => setBox(e.target.value)}>{(boxes.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>)}
          </Field>
          {kind === 'transfer' ? (
            <Field label="Qaysi kassaga">{(id) => (
              <Select id={id} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Tanlang</option>{(boxes.data ?? []).filter((b) => b.id !== cb).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>)}
            </Field>
          ) : <Field label="Summa, so‘m">{(id) => <Input id={id} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />}</Field>}
        </div>
        {kind === 'transfer' && <Field label="Summa, so‘m">{(id) => <Input id={id} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>}
        {kind === 'income' && <>
          <Field label="Bemor (ixtiyoriy)">{() => <PatientPicker value={patient} onChange={setPatient} branchId={branch.id} />}</Field>
          <Field label="Shifokor (kimning ishi)">{(id) => (
            <Select id={id} value={doctor} onChange={(e) => setDoctor(e.target.value)}><option value="">—</option>{doctors.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name}</option>)}</Select>)}
          </Field>
        </>}
        {kind === 'expense' && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Xarajat turi">{(id) => (
              <Select id={id} value={cat} onChange={(e) => { setCat(e.target.value); setNewCat(''); }}>
                <option value="">—</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>)}
            </Field>
            <Field label="yoki yangi tur">{(id) => <Input id={id} value={newCat} placeholder="Masalan: Ijara" onChange={(e) => { setNewCat(e.target.value); setCat(''); }} />}</Field>
          </div>
          <Field label="Kontragent (kimga)" hint="Yetkazib beruvchiga to‘lov uning qarzini kamaytiradi">{(id) => (
            <Select id={id} value={cp} onChange={(e) => setCp(e.target.value)}>
              <option value="">—</option>{(cps.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {ct.labelOf(c)}</option>)}
            </Select>)}
          </Field>
        </>}
        <Field label="Izoh">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

interface Debt { counterparty_id: string; purchased: number; paid: number }
interface Invoice { id: string; counterparty_id: string; inv_date: string; description: string; amount: number }

/** Kontragentlar: barchasi yoki texniklar (laboratoriya hisob-kitobi). */
function Parties() {
  const [mode, setMode] = useQueryParam<'all' | 'tech'>('cp', 'all');
  const [tech, setTech] = useQueryParam<string>('tech', '');
  if (tech) return <TechProfile id={tech} onBack={() => setTech('')} />;
  return (
    <div className="flex flex-col gap-3">
      <PillTabs tabs={[{ key: 'all', label: 'Barcha kontragentlar' }, { key: 'tech', label: 'Texniklar' }]} value={mode} onChange={setMode} />
      {mode === 'tech' ? <TechList onOpen={setTech} /> : <AllParties onTech={setTech} />}
    </div>
  );
}

/** Kontragentlar: jadval (saralash, filtr) va kontragent sahifasi (hisoblar va to'lovlar). */
function AllParties({ onTech }: { onTech: (id: string) => void }) {
  const { can, branch } = useOrg();
  const [type, setType] = useState('');
  const [f, setF] = useState({ name: '', phone: '', email: '', web: '', note: '' });
  const [arch, setArch] = useState(false);
  const [open, setOpen] = useState<Counterparty | 'new' | null>(null);
  const [prof, setProf] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'name', dir: 1 });
  const ct = useCpTypes();
  const [typesOpen, setTypesOpen] = useState(false);
  const cps = useList<Counterparty>('counterparties', { archived: arch });
  // Kontragentlar ikkala filialda umumiy, summalar esa faqat joriy filial bo'yicha.
  const inv = useList<Invoice>('counterparty_invoices', { branch_id: branch.id });
  const pays = useList<MoneyMove>('money_moves', { branch_id: branch.id, kind: 'expense', 'counterparty_id.not': null }, { limit: 5000 });
  const debts = useQuery({ queryKey: ['stock', 'debts', branch.id], queryFn: () => http.get<Debt[]>(`/api/stock/supplier-debts?branch_id=${branch.id}`) });
  // Texnik: bemorlar to'lagan sari hisoblangan laboratoriya ulushi ham "bajarilgan"ga kiradi.
  const techs = useQuery({ queryKey: ['lab', 'technicians', branch.id], queryFn: () => http.get<TechRow[]>(`/api/lab/technicians?branch_id=${branch.id}`) });
  const doneOf = (id: string) => (inv.data ?? []).filter((x) => x.counterparty_id === id).reduce((a, x) => a + x.amount, 0) + (debts.data?.find((d) => d.counterparty_id === id)?.purchased ?? 0)
    + (techs.data?.find((t) => t.id === id)?.earned ?? 0);
  const paidOf = (id: string) => (pays.data ?? []).filter((x) => x.counterparty_id === id).reduce((a, x) => a + x.amount, 0);
  const has = (v: string | null | undefined, n: string) => !n || (v ?? '').toLowerCase().includes(n.toLowerCase());
  const rows = (cps.data ?? []).filter((c) => (!type || ct.keyOf(c) === type) && has(c.name, f.name) && has(c.phone, f.phone) && has(c.email, f.email) && has(c.website, f.web) && has(c.note, f.note))
    .map((c) => ({ c, done: doneOf(c.id), paid: paidOf(c.id), bal: paidOf(c.id) - doneOf(c.id) }))
    .sort((a, b) => {
      const k = sort.k; const va = k === 'bal' ? a.bal : k === 'done' ? a.done : k === 'paid' ? a.paid : String((a.c as unknown as Record<string, unknown>)[k] ?? '');
      const vb = k === 'bal' ? b.bal : k === 'done' ? b.done : k === 'paid' ? b.paid : String((b.c as unknown as Record<string, unknown>)[k] ?? '');
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  const cur = prof ? cps.data?.find((c) => c.id === prof) : undefined;
  if (cur) return <PartyProfile cp={cur} invoices={(inv.data ?? []).filter((x) => x.counterparty_id === cur.id)} payments={(pays.data ?? []).filter((x) => x.counterparty_id === cur.id)} purchased={debts.data?.find((d) => d.counterparty_id === cur.id)?.purchased ?? 0} onBack={() => setProf(null)} onEdit={() => setOpen(cur)} editOpen={open} onCloseEdit={() => setOpen(null)} />;
  const COLS: [string, string][] = [['name', 'Nomi'], ['type', 'Subkategoriya'], ['phone', 'Telefon'], ['email', 'E-mail'], ['website', 'Veb-sayt'], ['note', 'Izoh'], ['bal', 'Balans'], ['done', 'Bajarilgan'], ['paid', 'To‘langan']];
  const fi = 'h-7 w-full min-w-[60px] rounded border border-line bg-white px-1.5 text-xs font-normal';
  const tot = rows.reduce((a, r) => a + r.bal, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {can('cashbox.edit') && <button type="button" onClick={() => setOpen('new')} className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-primary px-3.5 text-sm text-white"><Plus size={15} /> Kontragent qo‘shish</button>}
        {can('cashbox.edit') && <button type="button" onClick={() => setTypesOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-line bg-white px-3 text-sm">Turlar</button>}
        <label className="flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxiv</label>
        <span className="ml-auto text-sm text-sub">{branch.name} bo‘yicha · Ko‘rsatilganlar balansi: <b className={tot < 0 ? 'text-bad' : 'text-fg'}>{money(tot)}</b></span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>{COLS.map(([k, l]) => (
              <th key={k} className="border-b border-line p-0 text-left"><button type="button" onClick={() => setSort({ k, dir: sort.k === k ? (-sort.dir as 1 | -1) : 1 })} aria-label={`${l} bo‘yicha saralash`}
                className="flex h-10 w-full items-center justify-between gap-1.5 px-2.5 text-sm font-semibold whitespace-nowrap">{l}<span className={cx('text-[10px]', sort.k === k ? 'text-primary' : 'text-[#c9d2d9]')}>{sort.k === k ? (sort.dir > 0 ? '▲' : '▼') : '⇅'}</span></button></th>
            ))}<th className="border-b border-line" /></tr>
            <tr className="bg-surface">
              <th className="p-1.5"><input aria-label="Nomi bo‘yicha filtr" className={fi} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></th>
              <th className="p-1.5"><select aria-label="Subkategoriya bo‘yicha filtr" className={fi} value={type} onChange={(e) => setType(e.target.value)}><option value="">Hammasi</option>{ct.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></th>
              <th className="p-1.5"><input aria-label="Telefon bo‘yicha filtr" className={fi} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></th>
              <th className="p-1.5"><input aria-label="E-mail bo‘yicha filtr" className={fi} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></th>
              <th className="p-1.5"><input aria-label="Veb-sayt bo‘yicha filtr" className={fi} value={f.web} onChange={(e) => setF({ ...f, web: e.target.value })} /></th>
              <th className="p-1.5"><input aria-label="Izoh bo‘yicha filtr" className={fi} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></th>
              <th /><th /><th />
              <th className="p-1.5"><button type="button" onClick={() => { setF({ name: '', phone: '', email: '', web: '', note: '' }); setType(''); }} aria-label="Filtrlarni tozalash" title="Filtrlarni tozalash" className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-muted"><X size={14} /></button></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-sub">Filtr bo‘yicha kontragent topilmadi.</td></tr>}
            {rows.map(({ c, done, paid, bal }) => (
              <tr key={c.id} className="border-t border-line hover:bg-surface">
                <td className="px-2.5 py-2"><button type="button" onClick={() => (c.type === 'technician' ? onTech(c.id) : setProf(c.id))} title="Kontragent kartasini ochish" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UserRound size={14} />{c.name}</button></td>
                <td className="px-2.5 py-2">{ct.labelOf(c)}</td>
                <td className="px-2.5 py-2">{c.phone}</td>
                <td className="px-2.5 py-2">{c.email}</td>
                <td className="px-2.5 py-2">{c.website}</td>
                <td className="max-w-[200px] truncate px-2.5 py-2 text-sub">{c.note}</td>
                <td className={cx('px-2.5 py-2 text-right font-semibold whitespace-nowrap', bal < 0 ? 'text-bad' : bal > 0 ? 'text-ok' : '')}>{money(bal)}</td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap">{money(done)}</td>
                <td className="px-2.5 py-2 text-right whitespace-nowrap">{money(paid)}</td>
                <td className="px-2.5 py-2">{can('cashbox.edit') && <button type="button" aria-label="Tahrirlash" title="Kontragent kartasi" onClick={() => setOpen(c)} className="text-sub hover:text-fg"><Pencil size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex items-center gap-3 text-sm text-sub">
        <span>Jami: <b className="text-fg">{rows.length}</b></span>
        <XlsBtn onClick={() => downloadXlsx('Kontragentlar.xlsx', [{ name: 'Kontragentlar', rows: [COLS.map((c) => c[1]), ...rows.map(({ c, done, paid, bal }) => [c.name, ct.labelOf(c), c.phone ?? '', c.email ?? '', c.website ?? '', c.note ?? '', bal, done, paid])] }])} />
      </div>
      {open && <CounterpartyForm cp={open === 'new' ? undefined : open} onClose={() => setOpen(null)} />}
      {typesOpen && <CpTypesModal onClose={() => setTypesOpen(false)} />}
    </div>
  );
}

function PartyProfile({ cp, invoices, payments, purchased, onBack, onEdit, editOpen, onCloseEdit }: {
  cp: Counterparty; invoices: Invoice[]; payments: MoneyMove[]; purchased: number; onBack: () => void; onEdit: () => void; editOpen: Counterparty | 'new' | null; onCloseEdit: () => void;
}) {
  const { can, branch, branches } = useOrg();
  const boxes = useList<Box>('cashboxes', { branch_id: branch.id, archived: false });
  const allBoxes = useList<Box>('cashboxes');
  const others = branches.filter((b) => b.id !== branch.id && can('cashbox.edit', b.id));
  const moveInv = useAction(({ id, to }: { id: string; to: string }) => db.update('counterparty_invoices', id, { branch_id: to }),
    { invalidate: ['counterparty_invoices'], success: 'Hisob boshqa filialga o‘tkazildi' });
  const bm = byId(allBoxes.data);
  const [md, setMd] = useState<{ kind: 'inv' | 'pay'; id?: string; date: string; desc: string; amt: string; box: string } | null>(null);
  const invTot = invoices.reduce((a, x) => a + x.amount, 0) + purchased;
  const payTot = payments.reduce((a, x) => a + x.amount, 0);
  const save = useAction(() => {
    const m = md!; const amount = Math.round(Number(m.amt) || 0);
    if (amount <= 0) throw new Error('Summani kiriting');
    if (m.kind === 'inv') return m.id ? db.update('counterparty_invoices', m.id, { inv_date: m.date, description: m.desc, amount }) : db.insert('counterparty_invoices', { branch_id: branch.id, counterparty_id: cp.id, inv_date: m.date, description: m.desc, amount });
    return db.insert('money_moves', { kind: 'expense', cashbox_id: m.box || boxes.data?.[0]?.id, amount, counterparty_id: cp.id, note: m.desc, moved_at: new Date(m.date + 'T12:00:00').toISOString() });
  }, { invalidate: ['counterparty_invoices', 'money_moves', 'cash', 'stock'], success: 'Saqlandi', onDone: () => setMd(null) });
  const delInv = useAction((id: string) => db.remove('counterparty_invoices', id), { invalidate: ['counterparty_invoices'] });
  const edit = can('cashbox.edit', branch.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white px-4 py-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-sub"><UserRound size={26} /></span>
        <h2 className="m-0 text-xl font-semibold">{cp.name}</h2>
        {can('cashbox.edit') && <button type="button" onClick={onEdit} aria-label="Kontragent ma‘lumotlari" title="Kontragent ma‘lumotlari" className="grid h-8 w-8 place-items-center rounded text-sub hover:bg-muted"><Pencil size={16} /></button>}
        <span className="flex-1" />
        <span className={cx('text-base font-semibold', payTot - invTot < 0 ? 'text-bad' : 'text-ok')}>Balans: {money(payTot - invTot)} so‘m</span>
        <XlsBtn onClick={() => downloadXlsx(`${fileSafe(cp.name)}.xlsx`, [
          { name: 'Hisoblar', rows: [[`${cp.name} — hisoblar`], [], ['Sana', 'Nima uchun', 'Summa'], ...invoices.map((i) => [dmy(i.inv_date), i.description ?? '', i.amount]),
            ...(purchased ? [['', 'Ombor kirimlari', purchased] as XCell[]] : []), ['Jami', '', invTot]], bold: [0, 2, invoices.length + (purchased ? 4 : 3)] },
          { name: 'To‘lovlar', rows: [[`${cp.name} — to‘lovlar`], [], ['Sana', 'Kassa', 'Izoh', 'Summa'], ...payments.map((m) => [dmy(m.moved_at), bm.get(m.cashbox_id)?.name ?? '', m.note ?? '', m.amount]), ['Jami', '', '', payTot]], bold: [0, 2, payments.length + 3] },
          { name: 'Balans', rows: [['Ko‘rsatkich', 'Summa'], ['Hisoblar jami', invTot], ['To‘langan', payTot], ['Balans', payTot - invTot]], bold: [0, 3] },
        ])} />
        <button type="button" onClick={onBack} aria-label="Kontragentlar ro‘yxatiga qaytish" title="Ro‘yxatga qaytish" className="grid h-9 w-9 place-items-center rounded border border-line text-sub"><X size={16} /></button>
      </div>
      {edit && (
        <div className="flex flex-wrap gap-2">
          <span className="mr-2 self-center text-base font-medium">Moliya</span>
          <button type="button" onClick={() => setMd({ kind: 'inv', date: today(), desc: '', amt: '', box: '' })} className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-[#b45309] px-4 text-[15px] text-white"><Plus size={16} />Yangi hisob</button>
          <button type="button" onClick={() => setMd({ kind: 'pay', date: today(), desc: '', amt: String(Math.max(0, invTot - payTot) || ''), box: '' })} className="inline-flex h-10 items-center gap-1.5 rounded-[3px] bg-[#15803d] px-4 text-[15px] text-white"><Wallet size={16} />Kontragentga to‘lov</button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_120px_32px] gap-2 border-b border-line bg-muted px-3 py-2 text-xs font-semibold text-sub"><span>Sana</span><span>Hisoblar</span><span className="text-right">Summa</span><span /></div>
          {purchased > 0 && <div className="grid grid-cols-[100px_1fr_120px_32px] gap-2 border-b border-line px-3 py-2 text-sm"><span className="text-sub">—</span><span>Ombor kirimlari (nakladnoylar)</span><span className="text-right">{money(purchased)}</span><span /></div>}
          {invoices.map((x) => (
            <div key={x.id} className="grid grid-cols-[100px_1fr_120px_32px] items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0">
              <span className="text-sub">{dmy(x.inv_date)}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">{x.description || '—'}
                {edit && others.length > 0 && (
                  <select aria-label="Hisobni boshqa filialga o‘tkazish" title="Boshqa filialga o‘tkazish" value="" disabled={moveInv.isPending}
                    onChange={(e) => e.target.value && moveInv.mutate({ id: x.id, to: e.target.value })}
                    className="h-6 max-w-[150px] rounded border border-line bg-white px-1 text-[11px] text-sub">
                    <option value="">⇄ boshqa filialga</option>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </span><span className="text-right">{money(x.amount)}</span>
              {edit ? <button type="button" onClick={() => delInv.mutate(x.id)} aria-label="Hisobni o‘chirish" className="text-faint hover:text-bad"><Trash2 size={14} /></button> : <span />}
            </div>
          ))}
          <div className="flex justify-between border-t border-line px-3 py-2 text-sm font-semibold"><span>Jami hisoblar:</span><span>{money(invTot)}</span></div>
        </Card>
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_120px] gap-2 border-b border-line bg-muted px-3 py-2 text-xs font-semibold text-sub"><span>Sana</span><span>To‘lovlar</span><span className="text-right">Summa</span></div>
          {payments.length === 0 && <div className="px-3 py-4 text-center text-sm text-sub">To‘lov yo‘q</div>}
          {payments.map((x) => (
            <div key={x.id} className="grid grid-cols-[100px_1fr_120px] gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0">
              <span className="text-sub">{dmy(x.moved_at)}</span><span>{bm.get(x.cashbox_id)?.name}{x.note && <span className="text-sub"> · {x.note}</span>}</span><span className="text-right">{money(x.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line px-3 py-2 text-sm font-semibold"><span>Jami to‘lovlar:</span><span>{money(payTot)}</span></div>
        </Card>
      </div>
      {invoices.length === 0 && payments.length === 0 && purchased === 0 && <div className="text-center text-sm text-sub">Hali hisob yoki to‘lov yo‘q. «Yangi hisob» yoki «Kontragentga to‘lov» tugmasini bosing.</div>}
      {md && (
        <Modal open onClose={() => setMd(null)} title={md.kind === 'inv' ? 'Yangi hisob' : 'Kontragentga to‘lov'} width={480}
          footer={<><Button onClick={() => setMd(null)}>Bekor qilish</Button><span className="flex-1" /><Button variant="primary" loading={save.isPending} disabled={!(Number(md.amt) > 0) || (md.kind === 'inv' && !md.desc.trim())} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
          <div className="flex flex-col gap-3">
            <Field label="Sana *">{(id) => <Input id={id} type="date" value={md.date} onChange={(e) => setMd({ ...md, date: e.target.value })} />}</Field>
            <Field label={md.kind === 'inv' ? 'Nima uchun *' : 'Izoh'}>{(id) => <Input id={id} placeholder={md.kind === 'inv' ? 'Masalan: Material, Laboratoriya' : ''} value={md.desc} onChange={(e) => setMd({ ...md, desc: e.target.value })} />}</Field>
            {md.kind === 'pay' && <Field label="Kassa">{(id) => <Select id={id} value={md.box} onChange={(e) => setMd({ ...md, box: e.target.value })}>{(boxes.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>}
            <Field label="Summa *">{(id) => <Input id={id} type="number" min={0} placeholder="so‘m" value={md.amt} onChange={(e) => setMd({ ...md, amt: e.target.value })} />}</Field>
          </div>
        </Modal>
      )}
      {editOpen && <CounterpartyForm cp={editOpen === 'new' ? undefined : editOpen} onClose={onCloseEdit} />}
    </div>
  );
}

/** Xarajatlar jadvali (saralash va filtrlar bilan). */
function Expenses({ onAdd }: { onAdd: () => void }) {
  const { branch, can, members, memberName } = useOrg();
  const [f, setF] = useState({ from: '', to: '', box: '', cp: '', cat: '', note: '', by: '', min: '', max: '' });
  const moves = useList<MoneyMove>('money_moves', { branch_id: branch.id, kind: 'expense', ...(f.from ? { 'moved_at.gte': new Date(f.from + 'T00:00:00').toISOString() } : {}), ...(f.to ? { 'moved_at.lt': addDays(new Date(f.to + 'T00:00:00'), 1).toISOString() } : {}) }, { limit: 5000 });
  const boxes = useList<Box>('cashboxes', { branch_id: branch.id });
  const cps = useList<Counterparty>('counterparties');
  const cats = useList<ExpenseCategory>('expense_categories');
  const bm = byId(boxes.data), cm = byId(cps.data), catm = byId(cats.data);
  const has = (v: string | null | undefined, n: string) => !n || (v ?? '').toLowerCase().includes(n.toLowerCase());
  const rows = (moves.data ?? []).filter((m) => (!f.box || m.cashbox_id === f.box) && (!f.cp || m.counterparty_id === f.cp) && (!f.cat || m.category_id === f.cat)
    && has(m.note, f.note) && (!f.by || m.created_by === f.by) && (!f.min || m.amount >= Number(f.min)) && (!f.max || m.amount <= Number(f.max)));
  const fi = 'h-7 w-full min-w-[70px] rounded border border-line bg-white px-1.5 text-xs font-normal';
  const total = rows.reduce((a, m) => a + m.amount, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {can('cashbox.edit', branch.id) && <button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-primary px-3.5 text-sm text-white"><Plus size={15} />Xarajat qo‘shish</button>}
        <span className="ml-auto text-sm text-sub">{rows.length} ta xarajat · jami <b className="text-fg">{som(total)}</b></span>
        {rows.length > 0 && <XlsBtn onClick={() => downloadXlsx(`Xarajatlar_${fileSafe(branch.name)}${f.from ? `_${f.from}` : ''}${f.to ? `_${f.to}` : ''}.xlsx`, [{
          name: 'Xarajatlar', bold: [0, 2, rows.length + 3],
          rows: [[`Xarajatlar · ${branch.name}${f.from || f.to ? ` · ${f.from ? dmy(f.from) : '…'} – ${f.to ? dmy(f.to) : '…'}` : ''}`], [], ['Sana', 'Summa', 'Kassa', 'Kontragent', 'Kategoriya', 'Izoh', 'Kim yaratdi'],
            ...rows.map((m) => [dmyhm(m.moved_at), m.amount, bm.get(m.cashbox_id)?.name ?? '', m.counterparty_id ? cm.get(m.counterparty_id)?.name ?? '' : '', m.category_id ? catm.get(m.category_id)?.name ?? '' : '', m.note ?? '', memberName(m.created_by)]),
            ['Jami', total]],
        }])} />}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">{['Summa', 'Kassa', 'Kontragent', 'Kategoriya', 'Izoh', 'Sana', 'Kim yaratdi'].map((h) => <th key={h} className="h-10 border-b border-line px-2.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
            <tr className="bg-surface">
              <th className="p-1.5"><span className="flex gap-1"><input placeholder="dan" aria-label="Summa — dan" className={fi} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /><input placeholder="gacha" aria-label="Summa — gacha" className={fi} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></span></th>
              <th className="p-1.5"><select aria-label="Kassa bo‘yicha filtr" className={fi} value={f.box} onChange={(e) => setF({ ...f, box: e.target.value })}><option value="">Hammasi</option>{(boxes.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></th>
              <th className="p-1.5"><select aria-label="Kontragent bo‘yicha filtr" className={fi} value={f.cp} onChange={(e) => setF({ ...f, cp: e.target.value })}><option value="">Hammasi</option>{(cps.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></th>
              <th className="p-1.5"><select aria-label="Kategoriya bo‘yicha filtr" className={fi} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="">Hammasi</option>{(cats.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></th>
              <th className="p-1.5"><input aria-label="Izoh bo‘yicha filtr" className={fi} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></th>
              <th className="p-1.5"><span className="flex gap-1"><input type="date" aria-label="Sana — dan" className={fi} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><input type="date" aria-label="Sana — gacha" className={fi} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></span></th>
              <th className="p-1.5"><select aria-label="Kim yaratgani bo‘yicha filtr" className={fi} value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })}><option value="">Hammasi</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sub">Filtr bo‘yicha xarajat topilmadi.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="px-2.5 py-2 font-semibold whitespace-nowrap">{money(m.amount)}</td>
                <td className="px-2.5 py-2">{bm.get(m.cashbox_id)?.name}</td>
                <td className="px-2.5 py-2">{m.counterparty_id ? cm.get(m.counterparty_id)?.name : '—'}</td>
                <td className="px-2.5 py-2">{m.category_id ? catm.get(m.category_id)?.name : '—'}</td>
                <td className="px-2.5 py-2 text-sub">{m.note}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">{dmy(m.moved_at)}</td>
                <td className="px-2.5 py-2"><span className="inline-flex items-center gap-1.5"><span className="grid h-6 w-6 place-items-center rounded-full bg-nav text-[10px] font-semibold">{initials(memberName(m.created_by))}</span>{memberName(m.created_by)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ExpenseCats() {
  const { can } = useOrg();
  const cats = useList<ExpenseCategory>('expense_categories');
  const [name, setName] = useState('');
  const add = useAction(() => db.insert('expense_categories', { name }), { invalidate: ['expense_categories'], onDone: () => setName('') });
  const ren = useAction(({ id, n }: { id: string; n: string }) => db.update('expense_categories', id, { name: n }), { invalidate: ['expense_categories'] });
  const arch = useAction((c: ExpenseCategory) => db.update('expense_categories', c.id, { archived: !c.archived }), { invalidate: ['expense_categories'] });
  return (
    <Card className="p-4">
      <div className="mb-2 font-semibold">Xarajat kategoriyalari</div>
      {(cats.data ?? []).map((c) => (
        <div key={c.id} className={cx('flex items-center gap-2 py-1', c.archived && 'opacity-50')}>
          <input defaultValue={c.name} disabled={!can('cashbox.edit')} aria-label="Nomi" onBlur={(e) => e.target.value !== c.name && ren.mutate({ id: c.id, n: e.target.value })}
            className="h-8 flex-1 rounded-lg border border-transparent px-2 text-sm hover:border-line focus:border-primary focus:outline-none" />
          {can('cashbox.edit') && <button type="button" onClick={() => arch.mutate(c)} className="text-xs text-sub hover:text-fg">{c.archived ? 'Tiklash' : 'Arxivlash'}</button>}
        </div>
      ))}
      {can('cashbox.edit') && (
        <div className="mt-2 flex gap-2">
          <Input value={name} placeholder="Masalan: Kommunal" onChange={(e) => setName(e.target.value)} className="!h-8" />
          <Button size="sm" className="h-8" disabled={!name.trim()} onClick={() => add.mutate(undefined)}>Qo‘shish</Button>
        </div>
      )}
    </Card>
  );
}

interface Rate { id: string; currency: string; rate: number; rate_date: string }
function Rates() {
  const { can } = useOrg();
  const rates = useList<Rate>('currency_rates', {}, { limit: 60 });
  const [f, setF] = useState({ currency: 'USD', rate: '', rate_date: today() });
  const add = useAction(() => db.insert('currency_rates', { ...f, rate: Number(f.rate) }), { invalidate: ['currency_rates'], success: 'Kurs saqlandi', onDone: () => setF({ ...f, rate: '' }) });
  const del = useAction((id: string) => db.remove('currency_rates', id), { invalidate: ['currency_rates'] });
  return (
    <div className="flex max-w-xl flex-col gap-3">
      {can('cashbox.edit') && (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <Field label="Valyuta">{(id) => <Select id={id} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className="!w-24"><option>USD</option><option>EUR</option><option>RUB</option></Select>}</Field>
          <Field label="Kurs (1 birlik = so‘m)">{(id) => <Input id={id} type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} className="!w-40" />}</Field>
          <Field label="Sana">{(id) => <Input id={id} type="date" value={f.rate_date} onChange={(e) => setF({ ...f, rate_date: e.target.value })} />}</Field>
          <Button variant="primary" disabled={!(Number(f.rate) > 0)} onClick={() => add.mutate(undefined)}>Saqlash</Button>
        </Card>
      )}
      <Card className="overflow-hidden">
        {rates.data?.length === 0 ? <Empty>Kurs kiritilmagan</Empty> : (rates.data ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-4 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
            <span className="w-28 text-sub">{dmy(r.rate_date)}</span><span className="w-12 font-medium">{r.currency}</span>
            <span className="flex-1">{money(r.rate)} so‘m</span>
            {can('cashbox.edit') && <button type="button" aria-label="O‘chirish" onClick={() => del.mutate(r.id)} className="text-faint hover:text-bad"><Trash2 size={14} /></button>}
          </div>
        ))}
      </Card>
    </div>
  );
}
