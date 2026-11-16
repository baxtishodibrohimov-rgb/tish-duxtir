import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/lib/auth';
import { http } from '@/lib/api';
import { addDays, dmy, isoDate, money, som } from '@/lib/format';
import { useTitle } from '@/lib/router';
import { Card, Empty, Input, PageLoader, Select, cx } from '@/components/ui';

interface Overview {
  byDoctor: { doctor_id: string | null; name: string; acts: number; total: number }[];
  byDay: { day: string; income: number; expense: number }[];
  byService: { name: string; qty: number; total: number }[];
  visits: { total: number; completed: number; no_show: number; cancelled: number };
  newPatients: number;
  byBranch: { id: string; name: string; income: number; expense: number }[];
}

export function Reports() {
  useTitle('Hisobotlar');
  const { branches, branch } = useOrg();
  const t = new Date();
  const [from, setFrom] = useState(isoDate(new Date(t.getFullYear(), t.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(t));
  const [br, setBr] = useState(branches.length > 1 ? '' : branch.id);
  const q = useQuery({
    queryKey: ['reports', from, to, br],
    queryFn: () => http.get<Overview>(`/api/reports/overview?from=${from}&to=${to}${br ? `&branch_id=${br}` : ''}`),
  });
  const presets: [string, string, string][] = [
    ['Shu oy', isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), isoDate(t)],
    ['O‘tgan oy', isoDate(new Date(t.getFullYear(), t.getMonth() - 1, 1)), isoDate(new Date(t.getFullYear(), t.getMonth(), 0))],
    ['30 kun', isoDate(addDays(t, -29)), isoDate(t)],
    ['Shu yil', `${t.getFullYear()}-01-01`, isoDate(t)],
  ];
  const d = q.data;
  const income = d?.byDay.reduce((a, x) => a + x.income, 0) ?? 0;
  const expense = d?.byDay.reduce((a, x) => a + x.expense, 0) ?? 0;
  const maxDay = Math.max(1, ...(d?.byDay ?? []).map((x) => Math.max(x.income, x.expense)));
  const work = d?.byDoctor.reduce((a, x) => a + x.total, 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-[1300px] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[22px] font-semibold">Hisobotlar</h1>
          <span className="text-sm text-sub">Klinika bo‘yicha statistika, moliya va xodimlar</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {branches.length > 1 && (
            <Select aria-label="Filial" value={br} onChange={(e) => setBr(e.target.value)} className="h-8 w-44">
              <option value="">Barcha filiallar</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          {presets.map(([l, f, tt]) => (
            <button key={l} type="button" onClick={() => { setFrom(f); setTo(tt); }}
              className={cx('h-8 rounded-lg px-2.5 text-[13px] font-medium', from === f && to === tt ? 'bg-nav' : 'text-sub hover:bg-muted')}>{l}</button>
          ))}
          <Input type="date" aria-label="Dan" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
          <Input type="date" aria-label="Gacha" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
        </div>
      </div>

      {q.isLoading || !d ? <PageLoader /> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {([['Qilingan ish', som(work)], ['Kassaga tushgan', som(income)], ['Xarajat', som(expense)], ['Foyda', som(income - expense)],
            ['Yangi bemorlar', String(d.newPatients)]] as const).map(([l, v]) => (
            <Card key={l} className="p-4"><div className="text-xs text-sub">{l}</div><div className="mt-1 text-lg font-semibold">{v}</div></Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="m-0 mb-3 text-base font-semibold">Qabullar</h2>
            <div className="grid grid-cols-4 gap-2 text-center">
              {([['Jami', d.visits.total, ''], ['Tugatilgan', d.visits.completed, 'text-ok'], ['Kelmadi', d.visits.no_show, 'text-bad'], ['Bekor qilingan', d.visits.cancelled, 'text-sub']] as const).map(([l, v, c]) => (
                <div key={l} className="rounded-xl bg-surface p-3"><div className={cx('text-xl font-semibold', c)}>{v}</div><div className="text-xs text-sub">{l}</div></div>
              ))}
            </div>
          </Card>
          {branches.length > 1 && (
            <Card className="p-4">
              <h2 className="m-0 mb-3 text-base font-semibold">Filiallar bo‘yicha</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-sub"><th className="pb-2 font-medium">Filial</th><th className="pb-2 text-right font-medium">Kirim</th><th className="pb-2 text-right font-medium">Xarajat</th><th className="pb-2 text-right font-medium">Foyda</th></tr></thead>
                <tbody>{d.byBranch.map((b) => (
                  <tr key={b.id} className="border-t border-line"><td className="py-2">{b.name}</td><td className="py-2 text-right">{money(b.income)}</td><td className="py-2 text-right text-bad">{money(b.expense)}</td><td className="py-2 text-right font-semibold">{money(b.income - b.expense)}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="m-0 mb-3 text-base font-semibold">Shifokorlar bo‘yicha qilingan ish</h2>
            {d.byDoctor.length === 0 ? <Empty>Yopilgan aktlar yo‘q</Empty> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-sub"><th className="pb-2 font-medium">Shifokor</th><th className="pb-2 text-right font-medium">Aktlar</th><th className="pb-2 text-right font-medium">Summa</th><th className="pb-2 text-right font-medium">Ulushi</th></tr></thead>
                <tbody>{d.byDoctor.map((x) => (
                  <tr key={x.doctor_id ?? 'none'} className="border-t border-line"><td className="py-2">{x.name}</td><td className="py-2 text-right">{x.acts}</td><td className="py-2 text-right font-medium">{money(x.total)}</td><td className="py-2 text-right text-sub">{work ? Math.round((x.total / work) * 100) : 0}%</td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="m-0 mb-3 text-base font-semibold">Eng ko‘p bajarilgan xizmatlar</h2>
            {d.byService.length === 0 ? <Empty>Ma’lumot yo‘q</Empty> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-sub"><th className="pb-2 font-medium">Xizmat</th><th className="pb-2 text-right font-medium">Soni</th><th className="pb-2 text-right font-medium">Summa</th></tr></thead>
                <tbody>{d.byService.map((x) => (
                  <tr key={x.name} className="border-t border-line"><td className="py-2">{x.name}</td><td className="py-2 text-right">{x.qty}</td><td className="py-2 text-right font-medium">{money(x.total)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
        </div>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <h2 className="m-0 text-base font-semibold">Kunlar bo‘yicha kirim va xarajat</h2>
            <span className="flex items-center gap-1.5 text-xs text-sub"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Kirim</span>
            <span className="flex items-center gap-1.5 text-xs text-sub"><span className="h-2.5 w-2.5 rounded-sm bg-[#f59e9e]" /> Xarajat</span>
          </div>
          <div className="flex flex-col gap-1">
            {d.byDay.filter((x) => x.income || x.expense).map((x) => (
              <div key={x.day} className="grid grid-cols-[90px_1fr_220px] items-center gap-3 text-xs">
                <span className="text-sub">{dmy(x.day)}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="h-2 rounded-sm bg-primary" style={{ width: `${(x.income / maxDay) * 100}%` }} />
                  <span className="h-2 rounded-sm bg-[#f59e9e]" style={{ width: `${(x.expense / maxDay) * 100}%` }} />
                </span>
                <span className="text-right"><b className="font-medium">{money(x.income)}</b> <span className="text-sub">/ −{money(x.expense)}</span></span>
              </div>
            ))}
            {!d.byDay.some((x) => x.income || x.expense) && <Empty>Bu davrda pul harakati yo‘q</Empty>}
          </div>
        </Card>
        <p className="m-0 text-xs text-sub">Ombor hisobotlari (aylanma, qoldiq qiymati, hisobdan chiqarishlar, yetkazib beruvchilar qarzi) — Ombor → Hisobotlar bo‘limida.</p>
      </>}
    </div>
  );
}
