import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus, UserRound, Wallet, X } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { dmy, isoDate, money } from '@/lib/format';
import { downloadXlsx, fileSafe } from '@/lib/xlsx';
import { LAB_STATUS, type LabOrder, type TechRow } from '@/lib/lab';
import type { Cashbox } from '@/lib/types';
import { CounterpartyForm } from '@/components/CounterpartyForm';
import { Button, Card, Field, Input, Modal, PageLoader, Select, cx } from '@/components/ui';

/** Texnikka yozilgan pul (bemor to'lagan sari) − texnikka to'langan = qarz. */
export function TechList({ onOpen }: { onOpen: (id: string) => void }) {
  const { can, branch } = useOrg();
  const [add, setAdd] = useState(false);
  const [arch, setArch] = useState(false);
  const q = useQuery({ queryKey: ['lab', 'technicians', branch.id], queryFn: () => http.get<TechRow[]>(`/api/lab/technicians?branch_id=${branch.id}`) });
  if (q.isLoading) return <PageLoader />;
  const rows = (q.data ?? []).filter((r) => arch || !r.archived);
  const tot = rows.reduce((a, r) => ({ earned: a.earned + r.earned, paid: a.paid + r.paid, planned: a.planned + r.planned }), { earned: 0, paid: 0, planned: 0 });
  const H = 'h-10 border-b border-line px-3 text-left text-xs font-semibold whitespace-nowrap text-sub';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {can('cashbox.edit') && <button type="button" onClick={() => setAdd(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-primary px-3.5 text-sm text-white"><Plus size={15} /> Texnik qo‘shish</button>}
        <label className="flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxiv</label>
        <span className="flex-1" />
        <span className="text-sm text-sub">{branch.name} bo‘yicha · Jami qarz: <b className={tot.earned - tot.paid > 0 ? 'text-bad' : 'text-fg'}>{money(tot.earned - tot.paid)} so‘m</b></span>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            <th className={H}>Texnik</th><th className={H}>Telefon</th><th className={cx(H, 'text-right')}>Buyurtmalar</th>
            <th className={cx(H, 'text-right')} title="Barcha buyurtmalar bo‘yicha texnik narxi (bemor to‘liq to‘lasa)">Umumiy ish</th>
            <th className={cx(H, 'text-right')} title="Bemorlar to‘lagan qismiga mos">Hisoblangan</th>
            <th className={cx(H, 'text-right')}>To‘langan</th><th className={cx(H, 'text-right')}>Qarz</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const debt = r.earned - r.paid;
              return (
                <tr key={r.id} onClick={() => onOpen(r.id)} className={cx('cursor-pointer border-t border-line hover:bg-surface', r.archived && 'text-faint')}>
                  <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 font-medium text-primary"><UserRound size={14} />{r.name}</span></td>
                  <td className="px-3 py-2.5">{r.phone}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.orders}{r.active > 0 && <span className="text-sub"> ({r.active} faol)</span>}</td>
                  <td className="px-3 py-2.5 text-right text-sub tabular-nums">{money(r.planned)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(r.earned)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(r.paid)}</td>
                  <td className={cx('px-3 py-2.5 text-right font-semibold tabular-nums', debt > 0 ? 'text-bad' : debt < 0 ? 'text-ok' : '')}>{money(debt)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sub">Texnik yo‘q. «Texnik qo‘shish» tugmasini bosing.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="border-t-2 border-line font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>Jami</td>
              <td className="px-3 py-2.5 text-right text-sub tabular-nums">{money(tot.planned)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(tot.earned)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(tot.paid)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(tot.earned - tot.paid)}</td>
            </tr></tfoot>
          )}
        </table>
      </Card>
      <p className="m-0 text-xs text-sub">Texnikka pul bemor to‘lagan sari yoziladi: bemor ishning yarmini to‘lasa — texnik ulushining yarmi, to‘liq to‘lasa — to‘liq. Pul qaytarilsa yoki akt bekor qilinsa, o‘zi kamayadi.</p>
      {add && <CounterpartyForm fixedType="technician" onClose={() => { setAdd(false); void q.refetch(); }} />}
    </div>
  );
}

interface TechDetail { id: string; name: string; phone: string | null; note: string | null; orders: LabOrder[]; payments: { id: string; moved_at: string; amount: number; note: string | null; box: string; by_name: string | null }[] }

export function TechProfile({ id, onBack }: { id: string; onBack: () => void }) {
  const { can, branch } = useOrg();
  const q = useQuery({ queryKey: ['lab', 'technician', id, branch.id], queryFn: () => http.get<TechDetail>(`/api/lab/technicians/${id}?branch_id=${branch.id}`) });
  const boxes = useList<Cashbox>('cashboxes', { branch_id: branch.id, archived: false });
  const [pay, setPay] = useState<{ date: string; amt: string; note: string; box: string } | null>(null);
  const save = useAction(() => {
    const amount = Math.round(Number(pay!.amt) || 0);
    if (amount <= 0) throw new Error('Summani kiriting');
    return db.insert('money_moves', { kind: 'expense', cashbox_id: pay!.box || boxes.data?.[0]?.id, amount, counterparty_id: id, note: pay!.note.trim() || 'Texnikka to‘lov', moved_at: new Date(pay!.date + 'T12:00:00').toISOString() });
  }, { invalidate: ['lab', 'money_moves', 'cash'], success: 'To‘lov saqlandi', onDone: () => setPay(null) });

  const t = q.data;
  if (!t) return <PageLoader />;
  const live = t.orders.filter((o) => o.status !== 'cancelled');
  const earned = live.reduce((a, o) => a + o.earned, 0);
  const planned = live.reduce((a, o) => a + o.tech_amount, 0);
  const paid = t.payments.reduce((a, p) => a + p.amount, 0);
  const debt = earned - paid;
  const pct = (o: LabOrder) => (o.act_total ? Math.round(((o.act_paid ?? 0) * 100) / o.act_total) : 0);
  const C = 'px-3 py-2';
  const H = 'h-9 px-3 text-left text-xs font-semibold whitespace-nowrap text-sub';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white px-4 py-3">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f3e8ff] text-[#7c3aed]"><UserRound size={26} /></span>
        <div className="flex flex-col"><h2 className="m-0 text-xl font-semibold">{t.name}</h2><span className="text-sm text-sub">Texnik{t.phone && ` · ${t.phone}`} · {branch.name} bo‘yicha</span></div>
        <span className="flex-1" />
        <Button size="sm" onClick={() => downloadXlsx(`${fileSafe(t.name)}.xlsx`, [
          { name: 'Buyurtmalar', bold: [0, 2, live.length + 3], rows: [[`${t.name} — buyurtmalar`], [], ['№', 'Sana', 'Bemor', 'Ish', 'Tish', 'Holat', 'Texnik narxi', 'Bemor to‘lagan %', 'Hisoblangan'],
            ...live.map((o) => [o.number, dmy(o.created_at), o.patient_name, o.work_name, o.tooth ?? '', LAB_STATUS[o.status].label, o.tech_amount, pct(o), o.earned]), ['Jami', '', '', '', '', '', planned, '', earned]] },
          { name: 'To‘lovlar', bold: [0, 2, t.payments.length + 3], rows: [[`${t.name} — to‘lovlar`], [], ['Sana', 'Kassa', 'Izoh', 'Kim', 'Summa'], ...t.payments.map((p) => [dmy(p.moved_at), p.box, p.note ?? '', p.by_name ?? '', p.amount]), ['Jami', '', '', '', paid]] },
          { name: 'Balans', bold: [0, 4], rows: [['Ko‘rsatkich', 'Summa'], ['Hisoblangan', earned], ['To‘langan', paid], ['Umumiy ish (to‘liq to‘lansa)', planned], ['Qarz', debt]] },
        ])}><Download size={14} /> Excel</Button>
        <button type="button" onClick={onBack} aria-label="Texniklar ro‘yxatiga qaytish" title="Ro‘yxatga qaytish" className="grid h-9 w-9 place-items-center rounded border border-line text-sub"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {[['Umumiy ish', planned, 'text-sub'], ['Hisoblangan', earned, 'text-fg'], ['To‘langan', paid, 'text-ok'], ['Qarz', debt, debt > 0 ? 'text-bad' : 'text-fg']].map(([l, v, tone]) => (
          <Card key={l as string} className="flex flex-col gap-1 p-3 md:p-4"><span className="text-sm text-sub">{l}</span><b className={cx('text-xl tabular-nums', tone as string)}>{money(v as number)} so‘m</b></Card>
        ))}
      </div>

      {can('cashbox.edit', branch.id) && (
        <button type="button" onClick={() => setPay({ date: isoDate(new Date()), amt: String(Math.max(0, debt) || ''), note: '', box: '' })}
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-[3px] bg-[#15803d] px-4 text-[15px] text-white"><Wallet size={16} />Texnikka to‘lov</button>
      )}

      <Card className="overflow-x-auto">
        <div className="border-b border-line bg-muted px-3 py-2 text-sm font-semibold">Buyurtmalar</div>
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['№', 'Sana', 'Bemor', 'Ish', 'Holat', 'Texnik narxi', 'Bemor to‘lagan', 'Hisoblangan'].map((h, i) => <th key={h} className={cx(H, i >= 5 && 'text-right')}>{h}</th>)}</tr></thead>
          <tbody>
            {t.orders.map((o) => (
              <tr key={o.id} className={cx('border-t border-line', o.status === 'cancelled' && 'text-faint')}>
                <td className={cx(C, 'font-semibold')}>{o.number}</td>
                <td className={cx(C, 'whitespace-nowrap text-sub')}>{dmy(o.created_at)}</td>
                <td className={C}>{o.patient_name}</td>
                <td className={C}>{o.work_name}{o.tooth && <span className="text-sub"> · {o.tooth}</span>}</td>
                <td className={cx(C, 'whitespace-nowrap')}>{LAB_STATUS[o.status].label}</td>
                <td className={cx(C, 'text-right tabular-nums')}>{money(o.tech_amount)}</td>
                <td className={cx(C, 'text-right tabular-nums')}>
                  <span className="inline-flex items-center gap-2"><span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-ok" style={{ width: `${pct(o)}%` }} /></span>{pct(o)}%</span>
                </td>
                <td className={cx(C, 'text-right font-semibold tabular-nums')}>{money(o.earned)}</td>
              </tr>
            ))}
            {t.orders.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-sub">Buyurtma yo‘q</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line bg-muted px-3 py-2 text-sm font-semibold">To‘lovlar</div>
        {t.payments.map((p) => (
          <div key={p.id} className="grid grid-cols-[100px_1fr_120px] gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0">
            <span className="text-sub">{dmy(p.moved_at)}</span><span>{p.box}{p.note && <span className="text-sub"> · {p.note}</span>}</span><span className="text-right tabular-nums">{money(p.amount)}</span>
          </div>
        ))}
        {t.payments.length === 0 && <div className="px-3 py-4 text-center text-sm text-sub">To‘lov yo‘q</div>}
      </Card>

      {pay && (
        <Modal open onClose={() => setPay(null)} title={`Texnikka to‘lov · ${t.name}`} width={480}
          footer={<><Button onClick={() => setPay(null)}>Bekor qilish</Button><span className="flex-1" /><Button variant="primary" loading={save.isPending} disabled={!(Number(pay.amt) > 0)} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-surface px-3 py-2 text-sm">Qarz: <b className={debt > 0 ? 'text-bad' : ''}>{money(debt)} so‘m</b></div>
            <Field label="Sana *">{(fid) => <Input id={fid} type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />}</Field>
            <Field label="Kassa">{(fid) => <Select id={fid} value={pay.box} onChange={(e) => setPay({ ...pay, box: e.target.value })}>{(boxes.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>
            <Field label="Summa *">{(fid) => <Input id={fid} type="number" min={0} placeholder="so‘m" value={pay.amt} onChange={(e) => setPay({ ...pay, amt: e.target.value })} />}</Field>
            <Field label="Izoh">{(fid) => <Input id={fid} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />}</Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
