import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Plus, Banknote, CreditCard, Smartphone, Landmark, Pencil, Trash2 } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { addDays, dmy, dmyhm, isoDate, money, som } from '@/lib/format';
import { useQueryParam, useTitle } from '@/lib/router';
import type { Cashbox as Box, Counterparty, ExpenseCategory, MoneyMove, Patient } from '@/lib/types';
import { CounterpartyForm, CP_TYPE } from '@/components/CounterpartyForm';
import { PatientPicker } from '@/components/PatientPicker';
import { Button, Card, Empty, Field, Input, Modal, PageLoader, Select, TD, TH, UnderTabs, cx } from '@/components/ui';

type Sub = 'boxes' | 'ops' | 'parties' | 'expenses' | 'rates';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'boxes', label: 'Kassalar' }, { key: 'ops', label: 'Operatsiyalar' }, { key: 'parties', label: 'Kontragentlar' },
  { key: 'expenses', label: 'Xarajatlar' }, { key: 'rates', label: 'Valyuta kursi' },
];

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

export function Cashbox() {
  useTitle('Kassa');
  const [sub, setSub] = useQueryParam<Sub>('tab', 'boxes');
  const [period, setPeriod] = useState<Period>({ from: today(), to: today() });
  const [op, setOp] = useState<MoneyMove['kind'] | null>(null);
  const { can, branch } = useOrg();
  const edit = can('cashbox.edit', branch.id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <UnderTabs tabs={SUBS} value={sub} onChange={setSub} className="min-w-0 flex-1 border-b-0 [&_button]:h-7" />
        {edit && (sub === 'boxes' || sub === 'ops') && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => setOp('income')}><ArrowDownLeft size={14} className="text-ok" /> Kirim</Button>
            <Button size="sm" onClick={() => setOp('expense')}><ArrowUpRight size={14} className="text-bad" /> Xarajat</Button>
            <Button size="sm" onClick={() => setOp('transfer')}><ArrowLeftRight size={14} /> Kassadan kassaga</Button>
          </div>
        )}
      </div>
      {(sub === 'boxes' || sub === 'ops' || sub === 'expenses') && <PeriodPicker value={period} onChange={setPeriod} />}
      {sub === 'boxes' && <Boxes period={period} />}
      {sub === 'ops' && <Operations period={period} />}
      {sub === 'parties' && <Parties />}
      {sub === 'expenses' && <Expenses period={period} />}
      {sub === 'rates' && <Rates />}
      {op && <MoveModal kind={op} onClose={() => setOp(null)} />}
    </div>
  );
}

interface Summary { work_done: number; income: number; expense: number; profit: number; cashboxes: { cashbox_id: string; name: string; method: string; balance: number; period_income: number }[] }

function Boxes({ period }: { period: Period }) {
  const { branch } = useOrg();
  const s = useQuery({
    queryKey: ['cash', 'summary', branch.id, period],
    queryFn: () => http.get<Summary>(`/api/cash/summary?branch_id=${branch.id}&from=${period.from}&to=${period.to}`),
  });
  if (s.isLoading) return <PageLoader />;
  const d = s.data!;
  const isToday = period.from === today() && period.to === today();
  const pre = isToday ? 'Bugun' : period.from === period.to ? dmy(period.from) : `${dmy(period.from)} – ${dmy(period.to)}`;
  const cards: [string, number, string?][] = [
    ['qilingan ish', d.work_done], ['kassaga tushgan pul', d.income], ['xarajat', d.expense, 'text-bad'], ['foyda', d.profit, d.profit >= 0 ? 'text-ok' : 'text-bad'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([l, v, c]) => (
          <Card key={l} className="flex flex-col gap-1 p-5">
            <span className="text-[13px] text-sub">{pre} — {l}</span>
            <span className={cx('text-2xl font-semibold', c)}>{som(v)}</span>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {d.cashboxes.map((b) => {
          const Ic = METHOD_ICON[b.method] ?? Banknote;
          return (
            <Card key={b.cashbox_id} className="flex flex-col gap-1 p-5">
              <span className="flex items-center gap-2 text-[13px] text-sub"><Ic size={16} /> {b.name}</span>
              <span className="text-xl font-semibold">{som(b.balance)}</span>
              <span className="text-xs text-sub">{pre}: +{money(b.period_income)}</span>
            </Card>
          );
        })}
      </div>
      <p className="m-0 text-xs text-sub">Kassadagi qoldiq — barcha vaqt uchun. «Qilingan ish» — yopilgan aktlar summasi, «Kassaga tushgan pul» — to‘lovlar (qaytarilgan pul ayirilgan).</p>
    </div>
  );
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
              <option value="">—</option>{(cps.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {CP_TYPE[c.type]}</option>)}
            </Select>)}
          </Field>
        </>}
        <Field label="Izoh">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

interface Debt { counterparty_id: string; purchased: number; paid: number }

function Parties() {
  const { can } = useOrg();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  const [open, setOpen] = useState<Counterparty | 'new' | null>(null);
  const cps = useList<Counterparty>('counterparties', { type: type || undefined, archived: arch }, { q: q || undefined });
  const debts = useQuery({ queryKey: ['stock', 'debts'], queryFn: () => http.get<Debt[]>('/api/stock/supplier-debts') });
  const dm = new Map((debts.data ?? []).map((d) => [d.counterparty_id, d.purchased - d.paid]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" placeholder="Qidirish" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" aria-label="Qidirish" />
        <select className="h-8 rounded-lg border border-line bg-white px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Turi">
          <option value="">Barcha turlar</option>{Object.entries(CP_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxiv</label>
        {can('cashbox.edit') && <Button variant="primary" size="sm" className="ml-auto" onClick={() => setOpen('new')}><Plus size={15} /> Kontragent qo‘shish</Button>}
      </div>
      <Card className="overflow-x-auto">
        {cps.data?.length === 0 ? <Empty>Kontragentlar yo‘q</Empty> : (
          <table className="w-full border-collapse">
            <thead className="bg-muted"><tr><th className={TH}>Nomi</th><th className={TH}>Turi</th><th className={TH}>Telefon</th><th className={TH}>STIR</th><th className={`${TH} text-right`}>Qarzimiz</th><th className={TH} /></tr></thead>
            <tbody>
              {(cps.data ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-surface">
                  <td className={`${TD} font-medium`}>{c.name}</td>
                  <td className={TD}>{CP_TYPE[c.type]}</td>
                  <td className={TD}>{c.phone}</td>
                  <td className={TD}>{c.inn}</td>
                  <td className={`${TD} text-right ${(dm.get(c.id) ?? 0) > 0 ? 'font-semibold text-bad' : 'text-sub'}`}>{c.type === 'supplier' ? money(dm.get(c.id) ?? 0) : ''}</td>
                  <td className={`${TD} w-10`}>{can('cashbox.edit') && <button type="button" aria-label="Tahrirlash" onClick={() => setOpen(c)} className="text-sub hover:text-fg"><Pencil size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {open && <CounterpartyForm cp={open === 'new' ? undefined : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Expenses({ period }: { period: Period }) {
  const { branch, can } = useOrg();
  const cats = useList<ExpenseCategory>('expense_categories');
  const from = new Date(period.from + 'T00:00:00').toISOString();
  const to = new Date(addDays(new Date(period.to + 'T00:00:00'), 1)).toISOString();
  const moves = useList<MoneyMove>('money_moves', { branch_id: branch.id, kind: 'expense', 'moved_at.gte': from, 'moved_at.lt': to }, { limit: 5000 });
  const [name, setName] = useState('');
  const add = useAction(() => db.insert('expense_categories', { name }), { invalidate: ['expense_categories'], onDone: () => setName('') });
  const ren = useAction(({ id, n }: { id: string; n: string }) => db.update('expense_categories', id, { name: n }), { invalidate: ['expense_categories'] });
  const arch = useAction((c: ExpenseCategory) => db.update('expense_categories', c.id, { archived: !c.archived }), { invalidate: ['expense_categories'] });
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of moves.data ?? []) m.set(x.category_id ?? '', (m.get(x.category_id ?? '') ?? 0) + x.amount);
    return m;
  }, [moves.data]);
  const all = [...totals.values()].reduce((a, b) => a + b, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="font-semibold">Xarajatlar turi bo‘yicha</span><span className="font-semibold">{som(all)}</span></div>
        {[...(cats.data ?? []), { id: '', name: 'Turi ko‘rsatilmagan', archived: false } as ExpenseCategory].filter((c) => totals.get(c.id)).map((c) => (
          <div key={c.id || 'none'} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
            <span className="flex-1">{c.name}</span>
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${((totals.get(c.id) ?? 0) / (all || 1)) * 100}%` }} /></span>
            <span className="w-32 text-right font-medium">{money(totals.get(c.id))}</span>
          </div>
        ))}
        {all === 0 && <Empty>Bu davrda xarajat yo‘q</Empty>}
      </Card>
      <Card className="p-4">
        <div className="mb-2 font-semibold">Xarajat turlari</div>
        {(cats.data ?? []).map((c) => (
          <div key={c.id} className={cx('flex items-center gap-2 py-1', c.archived && 'opacity-50')}>
            <input defaultValue={c.name} disabled={!can('cashbox.edit')} aria-label="Nomi" onBlur={(e) => e.target.value !== c.name && ren.mutate({ id: c.id, n: e.target.value })}
              className="h-8 flex-1 rounded-lg border border-transparent px-2 text-sm hover:border-line focus:border-primary focus:outline-none" />
            {can('cashbox.edit') && <button type="button" onClick={() => arch.mutate(c)} className="text-xs text-sub hover:text-fg">{c.archived ? 'Tiklash' : 'Arxivlash'}</button>}
          </div>
        ))}
        {can('cashbox.edit') && (
          <div className="mt-2 flex gap-2">
            <Input value={name} placeholder="Yangi tur, masalan: Kommunal" onChange={(e) => setName(e.target.value)} className="h-8" />
            <Button size="sm" className="h-8" disabled={!name.trim()} onClick={() => add.mutate(undefined)}>Qo‘shish</Button>
          </div>
        )}
      </Card>
    </div>
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
          <Field label="Valyuta">{(id) => <Select id={id} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className="w-24"><option>USD</option><option>EUR</option><option>RUB</option></Select>}</Field>
          <Field label="Kurs (1 birlik = so‘m)">{(id) => <Input id={id} type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} className="w-40" />}</Field>
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
