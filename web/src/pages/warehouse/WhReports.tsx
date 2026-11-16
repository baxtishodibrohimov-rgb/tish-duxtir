import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { http } from '@/lib/api';
import { isoDate, money, qty as fq } from '@/lib/format';
import { useOrg } from '@/lib/auth';
import { Card, Empty, Input, PageLoader, Select, cx } from '@/components/ui';
import { WRITEOFF_REASON, type WhCtx } from './common';
import { downloadCsv } from './Docs';

type R = 'turnover' | 'value' | 'writeoffs' | 'debts';
const REPORTS: { key: R; title: string; desc: string }[] = [
  { key: 'turnover', title: 'Aylanma (oborot)', desc: 'Davr boshi, kirim, chiqim va davr oxiri — miqdor va tannarx' },
  { key: 'value', title: 'Qoldiq va uning qiymati', desc: 'Hozirgi qoldiq har bir omborda, FIFO tannarxida' },
  { key: 'writeoffs', title: 'Hisobdan chiqarishlar', desc: 'Sabab bo‘yicha: ishlatildi, buzildi, muddati o‘tdi, akt bo‘yicha' },
  { key: 'debts', title: 'Yetkazib beruvchilar qarzi', desc: 'Kirim − qaytarish − to‘lovlar' },
];

interface Turn { product_id: string; name: string; unit: string; open_qty: number; open_value: number; in_qty: number; in_value: number; out_qty: number; out_value: number; close_qty: number; close_value: number }
interface Wo { reason: string; product_id: string; name: string; unit: string; warehouse: string; qty: number; cost: number }
interface Debt { counterparty_id: string; name: string; purchased: number; paid: number }

export function WhReports({ wh }: { wh: WhCtx }) {
  const { branch } = useOrg();
  const [r, setR] = useState<R>('turnover');
  const t = new Date();
  const [from, setFrom] = useState(isoDate(new Date(t.getFullYear(), t.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(t));
  const [whId, setWhId] = useState(() => wh.warehouses.find((w) => w.branch_id === branch.id && w.is_main)?.id ?? wh.warehouses[0]?.id ?? '');

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-2">
        {REPORTS.map((x) => (
          <button key={x.key} type="button" onClick={() => setR(x.key)}
            className={cx('rounded-xl border p-3 text-left', r === x.key ? 'border-primary bg-primary-soft/50' : 'border-line bg-white hover:bg-muted')}>
            <div className="text-sm font-semibold">{x.title}</div><div className="text-xs text-sub">{x.desc}</div>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {(r === 'turnover' || r === 'writeoffs') && (
          <div className="flex flex-wrap items-center gap-2">
            {r === 'turnover' && <Select aria-label="Ombor" value={whId} onChange={(e) => setWhId(e.target.value)} className="h-8 w-60">
              {wh.warehouses.map((w) => <option key={w.id} value={w.id}>{wh.whLabel(w)}</option>)}
            </Select>}
            <Input type="date" aria-label="Dan" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
            <span className="text-sub">—</span>
            <Input type="date" aria-label="Gacha" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
          </div>
        )}
        {r === 'turnover' && <Turnover whId={whId} from={from} to={to} />}
        {r === 'value' && <Value wh={wh} />}
        {r === 'writeoffs' && <Writeoffs from={from} to={to} />}
        {r === 'debts' && <Debts />}
      </div>
    </div>
  );
}

function Table({ head, rows, foot, name }: { head: string[]; rows: (string | number)[][]; foot?: (string | number)[]; name: string }) {
  if (!rows.length) return <Card><Empty>Ma’lumot yo‘q</Empty></Card>;
  const num = (v: string | number) => typeof v === 'number';
  return (
    <Card className="overflow-x-auto">
      <div className="flex justify-end px-2 pt-2"><button type="button" aria-label="Excel’ga yuklab olish" title="Excel’ga yuklab olish" onClick={() => downloadCsv(`${name}.csv`, [head, ...rows])} className="grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Download size={16} /></button></div>
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-xs font-semibold text-sub"><tr>{head.map((h, i) => <th key={i} className={cx('px-3 py-2 whitespace-nowrap', i ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-line">{row.map((c, j) => <td key={j} className={cx('px-3 py-2', j && num(c) ? 'text-right whitespace-nowrap' : '')}>{num(c) ? (Number.isInteger(c) ? money(c as number) : fq(c as number)) : c}</td>)}</tr>)}</tbody>
        {foot && <tfoot><tr className="border-t-2 border-line font-semibold">{foot.map((c, j) => <td key={j} className={cx('px-3 py-2', j ? 'text-right' : '')}>{typeof c === 'number' ? money(c) : c}</td>)}</tr></tfoot>}
      </table>
    </Card>
  );
}

function Turnover({ whId, from, to }: { whId: string; from: string; to: string }) {
  const q = useQuery({ queryKey: ['stock', 'turnover', whId, from, to], enabled: !!whId, queryFn: () => http.get<Turn[]>(`/api/stock/turnover?warehouse_id=${whId}&from=${from}&to=${to}`) });
  if (q.isLoading) return <PageLoader />;
  const d = q.data ?? [];
  const s = (k: keyof Turn) => d.reduce((a, x) => a + Number(x[k]), 0);
  return <Table name="Aylanma" head={['Tovar', 'Boshida', 'Summa', 'Kirim', 'Summa', 'Chiqim', 'Summa', 'Oxirida', 'Summa']}
    rows={d.map((x) => [`${x.name} (${x.unit})`, x.open_qty, Math.round(x.open_value), x.in_qty, Math.round(x.in_value), x.out_qty, Math.round(x.out_value), x.close_qty, Math.round(x.close_value)])}
    foot={['Jami', '', Math.round(s('open_value')), '', Math.round(s('in_value')), '', Math.round(s('out_value')), '', Math.round(s('close_value'))]} />;
}

function Value({ wh }: { wh: WhCtx }) {
  const rows = wh.balances.filter((b) => b.qty !== 0).map((b) => {
    const p = wh.prodMap.get(b.product_id);
    return [p?.name ?? '', wh.whLabel(wh.whMap.get(b.warehouse_id)), `${fq(b.qty)} ${p?.unit ?? ''}`, Math.round(b.value)] as (string | number)[];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return <Table name="Qoldiq" head={['Tovar', 'Ombor', 'Qoldiq', 'Tannarx, so‘m']} rows={rows} foot={['Jami', '', '', Math.round(wh.balances.reduce((a, b) => a + b.value, 0))]} />;
}

function Writeoffs({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['stock', 'writeoffs', from, to], queryFn: () => http.get<Wo[]>(`/api/stock/writeoffs?from=${from}&to=${to}`) });
  if (q.isLoading) return <PageLoader />;
  const d = q.data ?? [];
  return <Table name="Hisobdan chiqarishlar" head={['Tovar', 'Sabab', 'Ombor', 'Miqdor', 'Tannarx, so‘m']}
    rows={d.map((x) => [x.name, WRITEOFF_REASON[x.reason] ?? x.reason, x.warehouse, `${fq(x.qty)} ${x.unit}`, Math.round(x.cost)])}
    foot={['Jami', '', '', '', Math.round(d.reduce((a, x) => a + x.cost, 0))]} />;
}

function Debts() {
  const q = useQuery({ queryKey: ['stock', 'debts'], queryFn: () => http.get<Debt[]>('/api/stock/supplier-debts') });
  if (q.isLoading) return <PageLoader />;
  const d = q.data ?? [];
  return (
    <>
      <Table name="Yetkazib beruvchilar qarzi" head={['Yetkazib beruvchi', 'Olingan tovar', 'To‘langan', 'Qarz']}
        rows={d.map((x) => [x.name, Math.round(x.purchased), Math.round(x.paid), Math.round(x.purchased - x.paid)])}
        foot={['Jami', Math.round(d.reduce((a, x) => a + x.purchased, 0)), Math.round(d.reduce((a, x) => a + x.paid, 0)), Math.round(d.reduce((a, x) => a + x.purchased - x.paid, 0))]} />
      <p className="m-0 text-xs text-sub">Kirim nakladnoyi kassadan pul chiqarmaydi — u faqat qarzni oshiradi. To‘lov Kassa → Xarajat orqali, kontragentni tanlab kiritiladi.</p>
    </>
  );
}
