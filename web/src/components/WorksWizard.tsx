import { useMemo, useState } from 'react';
import { CheckCircle2, X, Plus, Trash2, Check } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { dmy, qty as fq } from '@/lib/format';
import { Link } from '@/lib/router';
import type { CalcCard, CatIcon, Patient, PriceCategory, PriceItem, Product, StockBalance, Visit, Warehouse } from '@/lib/types';
import { cx } from './ui';

/** Prays kategoriyasi belgisi (maketdagi chiziqli belgilar). */
const ICON_PATHS: Record<CatIcon, string[]> = {
  cons: ['M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3', 'M8 15v1a6 6 0 0 0 6 6a6 6 0 0 0 6-6v-4', 'M20 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4z'],
  tooth: ['M7 3c-2.5 0-4 2-4 4.5c0 3 1.5 4.5 2 7c.5 2.5 1 6.5 2.5 6.5S9 18 10 16c.5-1 1.5-1 2-1s1.5 0 2 1c1 2 1 5 2.5 5s2-4 2.5-6.5c.5-2.5 2-4 2-7C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z'],
  hyg: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z', 'M20 3v4', 'M22 5h-4', 'M4 17v2', 'M5 18H3'],
  crown: ['M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z', 'M5 21h14'],
  braces: ['M2 12h20', 'M4 8.5h3.5v7H4z', 'M10.25 8.5h3.5v7h-3.5z', 'M16.5 8.5H20v7h-3.5z'],
  surg: ['m18 2 4 4', 'm17 7 3-3', 'M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5', 'm9 11 4 4', 'm5 19-3 3', 'm14 4 6 6'],
};
export const CAT_ICONS: { key: CatIcon; label: string }[] = [
  { key: 'cons', label: 'Konsultatsiya' }, { key: 'tooth', label: 'Tish' }, { key: 'hyg', label: 'Gigiyena' },
  { key: 'crown', label: 'Toj' }, { key: 'braces', label: 'Breket' }, { key: 'surg', label: 'Xirurgiya' },
];
export function CatIconSvg({ icon, size = 24 }: { icon: CatIcon | undefined; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(ICON_PATHS[icon ?? 'tooth'] ?? ICON_PATHS.tooth).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
const TINT: [string, string][] = [['#e6f6fc', '#0086b8'], ['#dcfce7', '#15803d'], ['#e0f2fe', '#0369a1'], ['#fef3c7', '#b45309'], ['#f3e8ff', '#7c3aed'], ['#ffe4e6', '#be123c']];
const CARD = (on: boolean) => cx('flex min-h-[150px] flex-col items-stretch gap-2.5 rounded-[14px] p-[18px] text-left shadow-[0_1px_2px_rgba(7,18,30,.04),0_2px_8px_rgba(7,18,30,.04)]',
  on ? 'border-2 border-primary bg-[#f2fbff]' : 'border border-line bg-white');

/** Jadvaldagi qabul uchun "Bajarilgan ish": kategoriya → ish → materiallar, so'ng qabul qilish. */
export function WorksWizard({ visit, patient, onClose }: { visit: Visit; patient: Patient; onClose: () => void }) {
  const { memberName } = useOrg();
  const cats = useList<PriceCategory>('price_categories');
  const items = useList<PriceItem>('price_items', { archived: false });
  const cards = useList<CalcCard>('calc_cards');
  const products = useList<Product>('products', { archived: false });
  const whs = useList<Warehouse>('warehouses', { branch_id: visit.branch_id, archived: false });
  const wh = whs.data?.find((w) => w.is_main) ?? whs.data?.[0];
  const bal = useList<StockBalance>('stock_balances', { warehouse_id: wh?.id ?? '' }, { enabled: !!wh });
  const pm = byId(products.data);
  const stockOf = (pid: string) => bal.data?.find((b) => b.product_id === pid)?.qty ?? 0;

  const [step, setStep] = useState<'cats' | 'works' | 'mats'>('cats');
  const [catId, setCatId] = useState<string | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [used, setUsed] = useState<Record<string, number>>({});      // `${item}|${product}` → miqdor
  const [extra, setExtra] = useState<Record<string, string[]>>({});  // ish → qo'shimcha materiallar
  const [done, setDone] = useState<{ works: string; mats: { name: string; q: number; unit: string; left: number }[] } | null>(null);

  const catList = cats.data ?? [];
  const cat = catList.find((c) => c.id === catId) ?? catList[0];
  const catIdx = Math.max(0, catList.indexOf(cat!));
  const works = (items.data ?? []).filter((i) => i.category_id === cat?.id);
  const curItem = items.data?.find((i) => i.id === cur);
  const selItems = sel.map((id) => items.data?.find((i) => i.id === id)).filter(Boolean) as PriceItem[];
  const defMats = (itemId: string) => (cards.data ?? []).filter((c) => c.price_item_id === itemId).map((c) => ({ pid: c.product_id, def: c.qty }));
  const curMats = useMemo(() => {
    if (!cur) return [];
    const list = defMats(cur);
    for (const pid of extra[cur] ?? []) if (!list.some((m) => m.pid === pid)) list.push({ pid, def: 1 });
    return list.filter((m) => pm.has(m.pid));
  }, [cur, cards.data, extra, products.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalOf = (pid: string) => Object.entries(used).reduce((a, [k, q]) => a + (k.split('|')[1] === pid && sel.includes(k.split('|')[0]!) ? q : 0), 0);
  const setU = (k: string, q: number) => { const u = { ...used }; if (q > 0) u[k] = q; else delete u[k]; setUsed(u); };
  const nUsed = (id: string) => Object.keys(used).filter((k) => k.startsWith(id + '|') && used[k]! > 0).length;
  const unsel = (id: string) => {
    setSel(sel.filter((x) => x !== id));
    setUsed(Object.fromEntries(Object.entries(used).filter(([k]) => !k.startsWith(id + '|'))));
    if (cur === id) { setCur(null); setStep('works'); }
  };
  const matCount = Object.entries(used).filter(([k, q]) => q > 0 && sel.includes(k.split('|')[0]!)).length;

  const accept = useAction(() => {
    const agg = new Map<string, number>();
    for (const [k, q] of Object.entries(used)) {
      const [w, pid] = k.split('|') as [string, string];
      if (sel.includes(w) && q > 0) agg.set(pid, (agg.get(pid) ?? 0) + q);
    }
    return http.post<{ left: { product_id: string; qty: number }[] }>(`/api/visits/${visit.id}/works`, {
      items: sel, materials: [...agg].map(([product_id, qty]) => ({ product_id, qty })), warehouse_id: wh?.id ?? null,
    }).then((r) => ({ r, agg }));
  }, {
    invalidate: ['acts', 'patients', 'visits', 'stock_balances', 'stock_docs', 'stock'],
    onDone: ({ r, agg }) => setDone({
      works: selItems.map((i) => i.name).join(', '),
      mats: [...agg].map(([pid, q]) => ({ name: pm.get(pid)?.name ?? '', q, unit: pm.get(pid)?.unit ?? '', left: r.left.find((x) => x.product_id === pid)?.qty ?? 0 })),
    }),
  });
  const reset = () => { setDone(null); setSel([]); setUsed({}); setExtra({}); setStep('cats'); setCur(null); };
  const crumb = (active: boolean) => cx('rounded-md px-2.5 py-1.5 text-[15px]', active ? 'font-semibold text-fg' : 'text-primary-hover');

  return (
    <div role="dialog" aria-modal="true" aria-label="Bajarilgan ish" className="fixed inset-0 z-[2000] flex flex-col bg-surface text-fg">
      <div className="flex items-center gap-3 border-b border-line bg-white px-6 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#e6f6fc] text-primary-hover"><CatIconSvg icon="tooth" size={20} /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="m-0 text-lg font-semibold">Bajarilgan ish</h2>
          <span className="truncate text-[13px] text-sub">{patient.full_name} · №{patient.card_number} · {memberName(visit.doctor_id)} · {dmy(visit.starts_at)}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Yopish" className="grid h-10 w-10 place-items-center rounded-lg text-sub hover:bg-muted"><X size={22} /></button>
      </div>

      {done ? (
        <div className="flex flex-1 justify-center overflow-auto px-4 py-12">
          <div className="flex w-full max-w-[560px] flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
              <div className="flex flex-col"><span className="text-xl font-semibold">Qabul qilindi</span>
                <span className="text-sm text-sub">{done.mats.length ? 'Materiallar ombordan chiqarildi va bemor tarixiga yozildi.' : 'Ishlar bemor tarixiga yozildi.'}</span></div>
            </div>
            <section className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="border-b border-line px-4 py-3 font-semibold">{done.works}</div>
              {done.mats.map((d) => (
                <div key={d.name} className="flex items-center gap-3 border-t border-muted px-4 py-2.5 text-sm">
                  <span className="flex-1">{d.name}</span><b className="text-[#b91c1c] tabular-nums">−{fq(d.q)} {d.unit}</b>
                  <span className={cx('min-w-[110px] text-right text-xs', d.left < 0 ? 'text-[#b91c1c]' : 'text-sub')}>qoldi: {fq(d.left)} {d.unit}</span>
                </div>
              ))}
            </section>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onClose} className="h-10 rounded-lg bg-primary px-[18px] text-sm font-medium text-white">Yopish</button>
              <button type="button" onClick={reset} className="h-10 rounded-lg border border-line bg-white px-[18px] text-sm">Yana ish qo‘shish</button>
              <Link to={`/patients/${patient.id}?tab=history`} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-[18px] text-sm !text-fg no-underline">Bemor tarixini ochish</Link>
            </div>
          </div>
        </div>
      ) : <>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-6 py-2.5">
          <nav aria-label="Qadamlar" className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => setStep('cats')} className={crumb(step === 'cats')}>Kategoriyalar</button>
            {step !== 'cats' && <><span aria-hidden="true" className="text-faint">›</span><button type="button" onClick={() => setStep('works')} className={crumb(step === 'works')}>{cat?.name}</button></>}
            {step === 'mats' && <><span aria-hidden="true" className="text-faint">›</span><span className="px-2.5 py-1.5 text-[15px] font-semibold">{curItem?.name}</span></>}
          </nav>
          <span className="flex-1" />
          {selItems.map((w) => (
            <span key={w.id} className="inline-flex h-[30px] items-center gap-0.5 rounded-full bg-[#e6f6fc] pr-1 pl-2.5 text-[13px] text-[#075985]">
              <button type="button" onClick={() => { setCur(w.id); setCatId(w.category_id); setStep('mats'); }}>{w.name} · {nUsed(w.id)} ta</button>
              <button type="button" onClick={() => unsel(w.id)} aria-label="Ishni olib tashlash" className="h-6 w-6 rounded-full">×</button>
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {step === 'cats' && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
              {catList.map((c, i) => {
                const n = (items.data ?? []).filter((w) => w.category_id === c.id);
                const ns = n.filter((w) => sel.includes(w.id)).length;
                const t = TINT[i % TINT.length]!;
                return (
                  <button key={c.id} type="button" onClick={() => { setCatId(c.id); setStep('works'); }} className={cx(CARD(ns > 0), 'min-h-[220px] p-[22px]')}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="grid h-[76px] w-[76px] place-items-center rounded-[20px]" style={{ background: t[0], color: t[1] }}><CatIconSvg icon={c.icon} size={38} /></span>
                      {ns > 0 && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">{ns} tanlandi</span>}
                    </span>
                    <span className="mt-auto text-2xl font-bold">{c.name}</span>
                    <span className="text-[15px] text-sub">{n.length} ta ish</span>
                  </button>
                );
              })}
              {catList.length === 0 && <div className="text-sm text-sub">Ishlar ro‘yxati bo‘sh. Sozlamalar → Bajarilgan ish bo‘limida kategoriya va ishlarni qo‘shing.</div>}
            </div>
          )}
          {step === 'works' && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {works.map((w) => {
                const on = sel.includes(w.id);
                return (
                  <button key={w.id} type="button" onClick={() => { setCur(w.id); setStep('mats'); if (!on) setSel([...sel, w.id]); }} className={CARD(on)}>
                    <span className="grid h-[52px] w-[52px] place-items-center rounded-[14px]" style={{ background: TINT[catIdx % TINT.length]![0], color: TINT[catIdx % TINT.length]![1] }}><CatIconSvg icon={cat?.icon} size={26} /></span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[19px] font-semibold">{w.name}</span>
                      {on && <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-primary text-white"><Check size={16} /></span>}
                    </span>
                    <span className="text-sm text-sub">{defMats(w.id).length} ta material kerak</span>
                    <span className="mt-auto text-[13px] text-primary-hover">{on ? `${nUsed(w.id)} ta material belgilangan` : 'Tanlash uchun bosing'}</span>
                  </button>
                );
              })}
              {works.length === 0 && <div className="text-sm text-sub">Bu kategoriyada ish yo‘q.</div>}
            </div>
          )}
          {step === 'mats' && cur && (
            <div className="flex flex-col gap-3">
              <span className="text-sm text-sub">Kartochkani bossangiz material qo‘shiladi. Sonini + va − bilan o‘zgartiring, xato bo‘lsa o‘chiring.</span>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {curMats.map((m) => {
                  const p = pm.get(m.pid)!;
                  const k = `${cur}|${m.pid}`, q = used[k] ?? 0, on = q > 0;
                  const stock = stockOf(m.pid), left = stock - totalOf(m.pid);
                  const step_ = m.def % 1 ? m.def : 1;
                  return (
                    <div key={m.pid} className={cx('flex min-h-[150px] overflow-hidden rounded-[14px]', on ? 'border-2 border-primary bg-[#f2fbff]' : 'border border-line bg-white')}>
                      {!on ? (
                        <button type="button" onClick={() => setU(k, m.def)} className="flex flex-1 flex-col items-start gap-2 p-4 text-left">
                          <span className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-dashed border-primary text-primary"><Plus size={18} /></span>
                          <span className="text-base font-semibold">{p.name}</span>
                          <span className="text-[13px] text-sub">odatda {fq(m.def)} {p.unit}</span>
                          <span className={cx('mt-auto text-xs', stock <= 0 ? 'text-[#b91c1c]' : 'text-sub')}>omborda {fq(stock)} {p.unit}</span>
                        </button>
                      ) : (
                        <div className="flex flex-1 flex-col gap-2.5 p-4">
                          <span className="flex items-start gap-2">
                            <span className="flex-1 text-base font-semibold">{p.name}</span>
                            <button type="button" onClick={() => setU(k, 0)} aria-label="O‘chirish" title="O‘chirish" className="-mt-1.5 -mr-1.5 grid h-9 w-9 place-items-center rounded-lg text-[#b91c1c]"><Trash2 size={18} /></button>
                          </span>
                          <span className="flex items-center overflow-hidden rounded-[10px] border border-[#b6e3f4] bg-white">
                            <button type="button" onClick={() => setU(k, Math.max(step_, +(q - step_).toFixed(3)))} aria-label="Kamaytirish" className="h-11 w-12 bg-[#f2fbff] text-[22px]">−</button>
                            <span className="flex-1 text-center text-[17px] font-bold tabular-nums">{fq(q)} {p.unit}</span>
                            <button type="button" onClick={() => setU(k, +(q + step_).toFixed(3))} aria-label="Ko‘paytirish" className="h-11 w-12 bg-[#f2fbff] text-[22px]">+</button>
                          </span>
                          <span className={cx('text-xs', left < 0 ? 'font-semibold text-[#b91c1c]' : 'text-sub')}>omborda qoladi: {fq(left)} {p.unit}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex min-h-[150px] flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#c9d2d9] bg-white p-4">
                  <label htmlFor="bxExtra" className="text-base font-semibold">Boshqa material</label>
                  <span className="text-[13px] text-sub">Ro‘yxatda yo‘q bo‘lsa, ombordan tanlang</span>
                  <select id="bxExtra" value="" onChange={(e) => { const pid = e.target.value; if (!pid) return; setExtra({ ...extra, [cur]: [...(extra[cur] ?? []), pid] }); setU(`${cur}|${pid}`, 1); }}
                    className="mt-auto h-10 rounded-lg border border-line bg-white px-2 text-sm">
                    <option value="">Tanlang…</option>
                    {(products.data ?? []).filter((p) => !curMats.some((m) => m.pid === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-white px-6 py-3">
          <span className="flex-1 text-sm text-sub">{selItems.length ? `${selItems.length} ta ish · ${matCount} ta material belgilandi` : 'Ish tanlanmagan'}</span>
          {step === 'mats' && <button type="button" onClick={() => setStep('cats')} className="h-11 rounded-lg border border-primary bg-white px-[18px] text-[15px] text-primary-hover">+ Yana ish qo‘shish</button>}
          <button type="button" onClick={onClose} className="h-11 rounded-lg border border-line bg-white px-[18px] text-[15px]">Bekor qilish</button>
          <button type="button" disabled={!sel.length || accept.isPending} onClick={() => accept.mutate(undefined)}
            className={cx('h-11 rounded-lg px-[22px] text-[15px] font-semibold text-white', sel.length ? 'bg-ok' : 'bg-faint')}>Qabul qilish</button>
        </div>
      </>}
    </div>
  );
}
