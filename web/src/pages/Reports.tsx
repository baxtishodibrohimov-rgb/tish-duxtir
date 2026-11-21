import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/lib/auth';
import { http } from '@/lib/api';
import { addDays, dmy, dmyhm, isoDate, money, som } from '@/lib/format';
import { Link, useTitle } from '@/lib/router';
import { ArrowLeft, ChartColumn, CalendarCheck, ChartLine, Users, WalletCards, Download, Printer } from 'lucide-react';
import { downloadCsv } from './warehouse/Docs';
import { Card, Empty, Input, PageLoader, cx } from '@/components/ui';

interface Overview {
  byDoctor: { doctor_id: string | null; name: string; acts: number; total: number }[];
  byDay: { day: string; income: number; expense: number }[];
  byService: { name: string; qty: number; total: number }[];
  visits: { total: number; completed: number; no_show: number; cancelled: number };
  newPatients: number;
  byBranch: { id: string; name: string; income: number; expense: number }[];
}

export function Overview() {
  useTitle('Umumiy hisobot');
  const { branch } = useOrg();
  const t = new Date();
  const [from, setFrom] = useState(isoDate(new Date(t.getFullYear(), t.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(t));
  const br = branch.id; // hisobotlar faqat joriy filial bo'yicha
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
        <div className="flex flex-col gap-1">
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm !text-sub no-underline"><ArrowLeft size={15} /> Hisobotlar</Link>
          <h1 className="m-0 text-[22px] font-semibold">Umumiy hisobot <span className="text-base font-normal text-sub">· {branch.name}</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map(([l, f, tt]) => (
            <button key={l} type="button" onClick={() => { setFrom(f); setTo(tt); }}
              className={cx('h-8 rounded-lg px-2.5 text-[13px] font-medium', from === f && to === tt ? 'bg-nav' : 'text-sub hover:bg-muted')}>{l}</button>
          ))}
          <Input type="date" aria-label="Dan" value={from} onChange={(e) => setFrom(e.target.value)} className="!h-8 !w-36" />
          <Input type="date" aria-label="Gacha" value={to} onChange={(e) => setTo(e.target.value)} className="!h-8 !w-36" />
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

// ---------------- Hisobotlar menyusi (maketdagi ro'yxat) ----------------
const GROUPS: { title: string; icon: typeof Users; items: [string, string | null][] }[] = [
  { title: 'Klinika hisobotlari', icon: ChartColumn, items: [['Umumiy hisobot', 'umumiy'], ['Shifokorlar yuklamasi', 'shifokorlar-yuklamasi'], ['Kabinetlar bandligi', 'kabinetlar-bandligi'],
    ['Bajarilgan ishlar va ularning soni', 'bajarilgan-ishlar-soni'], ['Yangi bemorlar klinika haqida qayerdan bilgan', 'manba'], ['Tahrirlash jurnali', 'tahrirlash-jurnali'],
    ['Xarajat kategoriyalari', 'xarajat-kategoriyalari'], ['Xarajatlar', 'xarajatlar'], ['Bemorni qabul qilishdagi kechikishlar', null], ['Birlamchi bemorlar', 'birlamchi-bemorlar'],
    ['Moliyaviy hisobotlar', 'moliyaviy'], ['Davolash rejalari', 'davolash-rejalari'], ['Klinikadan tashqari ulashilgan bemorlar', null], ['Foyda va zarar', 'foyda-zarar']] },
  { title: 'Jadval, eslatmalar, kutish navbati', icon: CalendarCheck, items: [['Bemor vizitlari', 'bemor-vizitlari'], ['Shifokor smenalari', 'shifokor-smenalari'], ['Shifokor smenalarini nusxa ko‘chirish', null],
    ['Administrativ xodimlar smenalari', 'shifokor-smenalari'], ['Assistentlar smenalari', 'shifokor-smenalari'], ['Eslatmalar', 'eslatmalar'], ['Kutish navbati', 'kutish-navbati']] },
  { title: 'Mening hisobotlarim', icon: ChartLine, items: [['Mening bemorlar bo‘yicha bajarilgan ishlarim', 'mening-bemorlarim'], ['Mening bajarilgan ishlarim', 'mening-ishlarim']] },
  { title: 'Bemorlar', icon: Users, items: [['Bemorlar', 'bemorlar'], ['Depozitli bemorlar', null], ['Qarzdor bemorlar', 'qarzdor-bemorlar'], ['Avansli bemorlar', 'avansli-bemorlar'],
    ['Tashlab ketgan bemorlar', 'tashlab-ketgan'], ['Aktlar', 'aktlar'], ['Bajarilgan ishlar', 'bajarilgan-ishlar'], ['Bemor to‘lovlari', 'bemor-tolovlari'], ['Bemor depozitlari', null],
    ['Tug‘ilgan kunlar', 'tugilgan-kunlar'], ['O‘chirilgan bemorlar', 'ochirilgan-bemorlar'], ['Demografiya', 'demografiya']] },
  { title: 'Ish haqi (ZP)', icon: WalletCards, items: [['Ish haqi hisoblanmalari', null], ['Ish haqi berish jurnali', null], ['Ish haqi sozlamalari', null], ['Bajarilgan ishlar bo‘yicha ish haqi hisoblash', null]] },
];

export function Reports() {
  useTitle('Hisobotlar');
  return (
    <main className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-3xl font-semibold tracking-[-0.02em]">Hisobotlar</h1>
        <span className="text-sm text-sub">Klinika bo‘yicha statistika, moliya va xodimlar hisobotlari</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-stretch gap-6">
        {GROUPS.map((g) => (
          <section key={g.title} className="app-card flex flex-col gap-2 rounded-card border border-line bg-white p-4">
            <h2 className="m-0 mb-1 flex items-center gap-2 p-1 text-sm font-semibold tracking-[0.02em] text-primary uppercase"><g.icon size={18} />{g.title}</h2>
            {g.items.map(([l, slug]) => slug
              ? <Link key={l} to={`/reports/${slug}`} className="block rounded-[10px] border border-line bg-white px-3 py-[11px] text-center text-sm !text-fg no-underline hover:bg-surface">{l}</Link>
              : <span key={l} title="Bu hisobot hali tayyor emas" className="block rounded-[10px] border border-dashed border-line px-3 py-[11px] text-center text-sm text-faint">{l} <span className="text-xs">· tez orada</span></span>)}
          </section>
        ))}
      </div>
    </main>
  );
}

interface Table { title: string; cols: [string, string, ('money' | 'num' | 'date' | 'datetime')?][]; rows: Record<string, unknown>[] }

/** Bitta jadval hisoboti: davr, filial, CSV va chop etish. */
export function ReportPage({ slug }: { slug: string }) {
  const { branch } = useOrg();
  const t = new Date();
  const [from, setFrom] = useState(isoDate(new Date(t.getFullYear(), t.getMonth(), 1)));
  const [to, setTo] = useState(isoDate(t));
  const br = branch.id; // hisobotlar faqat joriy filial bo'yicha
  const q = useQuery({
    queryKey: ['reports', 'table', slug, from, to, br], enabled: slug !== 'umumiy',
    queryFn: () => http.get<Table>(`/api/reports/table/${slug}?from=${from}&to=${to}${br ? `&branch_id=${br}` : ''}`),
  });
  useTitle(q.data?.title ?? 'Hisobot');
  if (slug === 'umumiy') return <Overview />;
  const fmt = (v: unknown, k?: string) => v === null || v === undefined || v === '' ? '—' : k === 'money' ? money(Number(v)) : k === 'num' ? String(v) : k === 'date' ? dmy(String(v)) : k === 'datetime' ? dmyhm(String(v)) : String(v);
  const d = q.data;
  const sums = d?.cols.map(([k, , kind]) => (kind === 'money' ? d.rows.reduce((a, r) => a + Number(r[k] ?? 0), 0) : null));
  return (
    <main className="mx-auto flex max-w-[1300px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm !text-sub no-underline print:hidden"><ArrowLeft size={15} /> Hisobotlar</Link>
          <h1 className="m-0 text-[22px] font-semibold">{d?.title ?? "…"} <span className="text-base font-normal text-sub">· {branch.name}</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          <Input type="date" aria-label="Dan" value={from} onChange={(e) => setFrom(e.target.value)} className="!h-8 !w-40" />
          <Input type="date" aria-label="Gacha" value={to} onChange={(e) => setTo(e.target.value)} className="!h-8 !w-40" />
          {d && <button type="button" aria-label="Excel (CSV) ga yuklab olish" title="Excel (CSV) ga yuklab olish" onClick={() => downloadCsv(`${d.title}.csv`, [d.cols.map((c) => c[1]), ...d.rows.map((r) => d.cols.map(([k, , kind]) => (kind === 'money' || kind === 'num' ? Number(r[k] ?? 0) : fmt(r[k], kind))))])}
            className="grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Download size={16} /></button>}
          <button type="button" aria-label="Chop etish" title="Chop etish" onClick={() => window.print()} className="grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Printer size={16} /></button>
        </div>
      </div>
      {q.isLoading || !d ? <PageLoader /> : d.rows.length === 0 ? <Card><Empty>Bu davrda ma’lumot yo‘q</Empty></Card> : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-xs font-semibold text-sub"><tr>{d.cols.map(([k, l, kind]) => <th key={k} className={cx('px-3 py-2 whitespace-nowrap', kind === 'money' || kind === 'num' ? 'text-right' : 'text-left')}>{l}</th>)}</tr></thead>
            <tbody>{d.rows.map((r, i) => (
              <tr key={i} className="border-t border-line">{d.cols.map(([k, , kind]) => <td key={k} className={cx('px-3 py-2', kind === 'money' || kind === 'num' ? 'text-right whitespace-nowrap' : '')}>{fmt(r[k], kind)}</td>)}</tr>
            ))}</tbody>
            {sums?.some((x) => x !== null) && <tfoot><tr className="border-t-2 border-line font-semibold">{d.cols.map(([k], i) => <td key={k} className={cx('px-3 py-2', sums[i] !== null && 'text-right')}>{i === 0 ? 'Jami' : sums[i] !== null ? money(sums[i]) : ''}</td>)}</tr></tfoot>}
          </table>
        </Card>
      )}
      <span className="text-xs text-sub">{d ? `${d.rows.length} ta qator` : ''}</span>
    </main>
  );
}
