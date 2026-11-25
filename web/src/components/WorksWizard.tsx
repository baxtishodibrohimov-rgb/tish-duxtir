import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, X, Check, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { http } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dmy, qty as fq } from '@/lib/format';
import { Link } from '@/lib/router';
import type { CatIcon, Patient, Visit } from '@/lib/types';
import { ProductThumb } from './ProductThumb';
import { PageLoader, cx } from './ui';

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

// ---- Tish formulasi (FDI)
const ADULT = [[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]];
const CHILD = [[55, 54, 53, 52, 51, 61, 62, 63, 64, 65], [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]];

interface CatRow { id: string; name: string; icon: CatIcon; ask_teeth: boolean }
interface ItemRow { id: string; category_id: string | null; name: string; price: number }
interface GroupRow { id: string; price_item_id: string; name: string; position: number }
interface CardRow { price_item_id: string; product_id: string; qty: number; group_id: string | null; position: number }
interface ProdRow { id: string; name: string; unit: string; brand: string | null; image_path: string | null; qty: number }
interface Catalog { warehouse_id: string | null; cats: CatRow[]; items: ItemRow[]; groups: GroupRow[]; cards: CardRow[]; products: ProdRow[] }
type Step = 'cats' | 'teeth' | 'works' | 'mats' | 'sum';

/** Tanlangan tishlar matni: hammasi bo'lsa — "Barcha tishlar", aks holda tartiblangan raqamlar. */
function teethText(sel: Set<number>) {
  if (!sel.size) return '';
  const all = (rows: number[][]) => rows.flat().every((t) => sel.has(t)) && [...sel].every((t) => rows.flat().includes(t));
  if (all(ADULT)) return 'Barcha tishlar';
  if (all(CHILD)) return 'Barcha sut tishlari';
  return [...sel].sort((a, b) => a - b).join(', ');
}

/**
 * "Material xarajat": kategoriya → (tish formulasi) → ish → material guruhlari birin-ketin → yakun.
 * Tasdiqlanganda akt yopiladi, materiallar ombordan chiqadi va bemor davolash tarixiga yoziladi.
 */
export function WorksWizard({ visit, patient, branchId, onClose }: { visit?: Visit; patient: Patient; branchId: string; onClose: () => void }) {
  const { memberName, me } = useOrg();
  const cat_ = useQuery({ queryKey: ['works', 'catalog', branchId], queryFn: () => http.get<Catalog>(`/api/works/catalog?branch_id=${branchId}`) });
  const c = cat_.data;
  const pm = useMemo(() => new Map((c?.products ?? []).map((p) => [p.id, p])), [c]);

  const [step, setStep] = useState<Step>('cats');
  const [catId, setCatId] = useState<string | null>(null);
  const [child, setChild] = useState(false);
  const [teeth, setTeeth] = useState<Set<number>>(new Set());
  const [workId, setWorkId] = useState<string | null>(null);
  const [gi, setGi] = useState(0);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [done, setDone] = useState<{ work: string; tooth: string; mats: { name: string; q: number; unit: string; left: number }[] } | null>(null);

  const cat = c?.cats.find((x) => x.id === catId);
  const works = (c?.items ?? []).filter((i) => i.category_id === catId);
  const work = c?.items.find((i) => i.id === workId);
  // Ishning material guruhlari tartib bilan; guruhsizlari oxirida "Boshqa materiallar".
  const groups = useMemo(() => {
    if (!c || !workId) return [];
    const cards = c.cards.filter((x) => x.price_item_id === workId && pm.has(x.product_id)).sort((a, b) => a.position - b.position);
    const gs = c.groups.filter((g) => g.price_item_id === workId).sort((a, b) => a.position - b.position)
      .map((g) => ({ id: g.id, name: g.name, cards: cards.filter((x) => x.group_id === g.id) })).filter((g) => g.cards.length);
    const free = cards.filter((x) => !x.group_id || !gs.some((g) => g.id === x.group_id));
    if (free.length) gs.push({ id: 'free', name: gs.length ? 'Boshqa materiallar' : 'Materiallar', cards: free });
    return gs;
  }, [c, workId, pm]);
  const grp = groups[gi];
  const chosen = Object.entries(used).filter(([, q]) => q > 0);
  const tooth = cat?.ask_teeth ? teethText(teeth) : '';

  const setU = (pid: string, q: number) => { const u = { ...used }; if (q > 0) u[pid] = +q.toFixed(3); else delete u[pid]; setUsed(u); };
  const pickCat = (id: string) => { const x = c!.cats.find((k) => k.id === id)!; setCatId(id); setWorkId(null); setUsed({}); setStep(x.ask_teeth ? 'teeth' : 'works'); };
  const pickWork = (id: string) => { if (id !== workId) setUsed({}); setWorkId(id); setGi(0); setStep('mats'); };
  const toggleTooth = (t: number) => { const s = new Set(teeth); if (s.has(t)) s.delete(t); else s.add(t); setTeeth(s); };
  const setRows = (rows: number[][]) => { const all = rows.flat().every((t) => teeth.has(t)); const s = new Set(teeth); rows.flat().forEach((t) => (all ? s.delete(t) : s.add(t))); setTeeth(s); };
  const back = () => {
    if (step === 'sum') { setStep(groups.length ? 'mats' : 'works'); setGi(Math.max(0, groups.length - 1)); }
    else if (step === 'mats') { if (gi > 0) setGi(gi - 1); else setStep('works'); }
    else if (step === 'works') setStep(cat?.ask_teeth ? 'teeth' : 'cats');
    else if (step === 'teeth') setStep('cats');
  };
  const next = () => {
    if (step === 'teeth') setStep('works');
    else if (step === 'mats') { if (gi < groups.length - 1) setGi(gi + 1); else setStep('sum'); }
  };

  const accept = useAction(() => {
    const body = { items: [workId], tooth: tooth || null, materials: chosen.map(([product_id, qty]) => ({ product_id, qty })), warehouse_id: c?.warehouse_id ?? null };
    return visit ? http.post<{ left: { product_id: string; qty: number }[] }>(`/api/visits/${visit.id}/works`, body)
      : http.post<{ left: { product_id: string; qty: number }[] }>(`/api/patients/${patient.id}/works`, { ...body, branch_id: branchId });
  }, {
    invalidate: ['acts', 'patients', 'visits', 'stock_balances', 'stock_docs', 'stock', 'works', 'patient-works', 'patient-history'],
    onDone: (r) => setDone({
      work: work?.name ?? '', tooth,
      mats: chosen.map(([pid, q]) => ({ name: pm.get(pid)?.name ?? '', q, unit: pm.get(pid)?.unit ?? '', left: r.left.find((x) => x.product_id === pid)?.qty ?? 0 })),
    }),
  });
  const reset = () => { setDone(null); setUsed({}); setTeeth(new Set()); setWorkId(null); setCatId(null); setStep('cats'); };

  const crumbs: [string, Step | null][] = [['Kategoriya', 'cats']];
  if (cat) { if (cat.ask_teeth) crumbs.push([tooth ? `Tish: ${tooth}` : 'Tish formulasi', 'teeth']); crumbs.push([cat.name, 'works']); }
  if (work) crumbs.push([work.name, 'mats']);
  if (step === 'sum') crumbs.push(['Yakun', 'sum']);
  const BTN = 'inline-flex h-11 items-center gap-1.5 rounded-lg px-[18px] text-[15px]';

  return (
    <div role="dialog" aria-modal="true" aria-label="Material xarajat" className="fixed inset-0 z-[2000] flex flex-col bg-surface text-fg">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#e6f6fc] text-primary-hover"><CatIconSvg icon="tooth" size={20} /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="m-0 text-lg font-semibold">Material xarajat</h2>
          <span className="truncate text-[13px] text-sub">{patient.full_name}{patient.card_number && ` · №${patient.card_number}`} · {memberName(visit?.doctor_id ?? me.user_id)} · {dmy(visit?.starts_at ?? new Date().toISOString())}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Yopish" className="grid h-10 w-10 place-items-center rounded-lg text-sub hover:bg-muted"><X size={22} /></button>
      </div>

      {cat_.isLoading ? <PageLoader /> : done ? (
        <div className="flex flex-1 justify-center overflow-auto px-4 py-12">
          <div className="flex w-full max-w-[560px] flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ok-soft text-ok"><CheckCircle2 size={24} /></span>
              <div className="flex flex-col"><span className="text-xl font-semibold">Saqlandi</span>
                <span className="text-sm text-sub">{done.mats.length ? 'Materiallar ombordan chiqarildi va davolash tarixiga yozildi.' : 'Ish davolash tarixiga yozildi.'}</span></div>
            </div>
            <section className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="border-b border-line px-4 py-3 font-semibold">{done.work}{done.tooth && <span className="font-normal text-sub"> · tish {done.tooth}</span>}</div>
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
              <Link to={`/patients/${patient.id}?tab=history`} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-[18px] text-sm !text-fg no-underline">Davolash tarixini ochish</Link>
            </div>
          </div>
        </div>
      ) : <>
        <nav aria-label="Qadamlar" className="flex flex-wrap items-center gap-1 border-b border-line bg-white px-4 py-2 sm:px-6">
          {crumbs.map(([l, s], i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className="text-faint">›</span>}
              <button type="button" onClick={() => s && setStep(s)} className={cx('max-w-[260px] truncate rounded-md px-2 py-1.5 text-[15px]', s === step ? 'font-semibold text-fg' : 'text-primary-hover')}>{l}</button>
            </span>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
          {step === 'cats' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
              {(c?.cats ?? []).map((k, i) => {
                const t = TINT[i % TINT.length]!;
                return (
                  <button key={k.id} type="button" onClick={() => pickCat(k.id)} className={cx(CARD(k.id === catId), 'min-h-[124px] !gap-1.5 !p-3 sm:min-h-[190px] sm:!gap-2.5 sm:!p-[18px]')}>
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] sm:h-[68px] sm:w-[68px] sm:rounded-[18px]" style={{ background: t[0], color: t[1] }}><CatIconSvg icon={k.icon} size={28} /></span>
                    <span className="mt-auto text-lg leading-tight font-bold sm:text-2xl">{k.name}</span>
                    <span className="text-xs text-sub sm:text-[15px]">{c!.items.filter((w) => w.category_id === k.id).length} ta ish{k.ask_teeth ? ' · tish formulasi' : ''}</span>
                  </button>
                );
              })}
              {!c?.cats.length && <div className="text-sm text-sub">Ro‘yxat bo‘sh. Sozlamalar → Bajarilgan ish bo‘limida kategoriya va ishlarni qo‘shing.</div>}
            </div>
          )}

          {step === 'teeth' && (
            <div className="mx-auto flex max-w-[980px] flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label="Tish formulasi" className="flex rounded-lg bg-muted p-[3px]">
                  {[['Kattalar', false], ['Bolalar', true]].map(([l, v]) => (
                    <button key={String(l)} type="button" role="radio" aria-checked={child === v} onClick={() => { setChild(v as boolean); setTeeth(new Set()); }}
                      className={cx('h-9 rounded-md px-4 text-sm', child === v ? 'bg-white font-semibold shadow-[0_1px_3px_rgba(7,18,30,.12)]' : 'text-sub')}>{String(l)}</button>
                  ))}
                </div>
                <span className="flex-1" />
                {(() => { const R = child ? CHILD : ADULT; return <>
                  <button type="button" onClick={() => setRows(R)} className="h-9 rounded-lg border border-line bg-white px-3 text-sm">Hammasi</button>
                  <button type="button" onClick={() => setRows([R[0]!])} className="h-9 rounded-lg border border-line bg-white px-3 text-sm">Yuqori jag‘</button>
                  <button type="button" onClick={() => setRows([R[1]!])} className="h-9 rounded-lg border border-line bg-white px-3 text-sm">Pastki jag‘</button>
                  <button type="button" onClick={() => setTeeth(new Set())} disabled={!teeth.size} className="h-9 rounded-lg px-3 text-sm text-sub disabled:opacity-40">Tozalash</button>
                </>; })()}
              </div>
              <div className="overflow-x-auto rounded-2xl border border-line bg-white p-2 sm:p-4">
                <div className="mx-auto flex w-max flex-col gap-3">
                  {(child ? CHILD : ADULT).map((row, ri) => (
                    // Har jag' ikki yarmi: telefonda ikki qator, kattaroq ekranda bitta qator.
                    <div key={ri} className={cx('flex flex-col gap-1.5 sm:flex-row sm:gap-3', ri === 1 && 'border-t-2 border-dashed border-line pt-3')}>
                      {[row.slice(0, row.length / 2), row.slice(row.length / 2)].map((half, hi) => (
                        <div key={hi} className="flex gap-1">
                          {half.map((t) => {
                            const on = teeth.has(t);
                            return (
                              <button key={t} type="button" aria-pressed={on} aria-label={`Tish ${t}`} onClick={() => toggleTooth(t)}
                                className={cx('flex w-[38px] flex-col items-center gap-0.5 rounded-lg border py-1.5 sm:w-[52px] sm:gap-1 sm:py-2', on ? 'border-primary bg-primary text-white' : 'border-line bg-white text-[#3d4858] hover:border-primary')}>
                                {ri === 1 && <span className="text-[13px] font-semibold sm:text-sm">{t}</span>}
                                <span className={ri === 1 ? 'rotate-180' : ''}><CatIconSvg icon="tooth" size={22} /></span>
                                {ri === 0 && <span className="text-[13px] font-semibold sm:text-sm">{t}</span>}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-sm text-sub">{teeth.size ? <>Tanlandi: <b className="text-fg">{tooth}</b></> : 'Tishni bosib belgilang (bir nechta bo‘lishi mumkin) yoki «Hammasi»ni bosing.'}</div>
            </div>
          )}

          {step === 'works' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4">
              {works.map((w) => {
                const n = c!.cards.filter((x) => x.price_item_id === w.id).length;
                return (
                  <button key={w.id} type="button" onClick={() => pickWork(w.id)} className={cx(CARD(w.id === workId), 'min-h-[104px] !p-3 sm:min-h-[150px] sm:!p-[18px]')}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base leading-tight font-semibold sm:text-[19px]">{w.name}</span>
                      {w.id === workId && <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-primary text-white"><Check size={16} /></span>}
                    </span>
                    <span className="mt-auto text-sm text-sub">{n ? `${n} ta material` : 'Material biriktirilmagan'}</span>
                  </button>
                );
              })}
              {works.length === 0 && <div className="text-sm text-sub">Bu kategoriyada ish yo‘q.</div>}
            </div>
          )}

          {step === 'mats' && (
            groups.length === 0 ? (
              <div className="mx-auto max-w-[560px] rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-sub">
                Bu ishga material biriktirilmagan. Sozlamalar → Bajarilgan ish bo‘limida qo‘shish mumkin.<br />Materialsiz saqlash uchun «Yakunlash»ni bosing.
              </div>
            ) : grp && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {groups.map((g, i) => {
                    const n = g.cards.filter((x) => (used[x.product_id] ?? 0) > 0).length;
                    return (
                      <button key={g.id} type="button" onClick={() => setGi(i)}
                        className={cx('inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm', i === gi ? 'bg-primary font-semibold text-white' : n ? 'bg-[#e6f6fc] text-[#075985]' : 'bg-white text-sub ring-1 ring-line')}>
                        <span className="tabular-nums">{i + 1}.</span> {g.name}{n > 0 && <span className={cx('rounded-full px-1.5 text-xs', i === gi ? 'bg-white/25' : 'bg-white')}>{n}</span>}
                      </button>
                    );
                  })}
                </div>
                <h3 className="m-0 text-xl font-semibold">{grp.name} <span className="text-base font-normal text-sub">· guruh {gi + 1}/{groups.length}</span></h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-4">
                  {grp.cards.map((x) => {
                    const p = pm.get(x.product_id)!;
                    const q = used[p.id] ?? 0, on = q > 0, st = x.qty % 1 ? x.qty : 1;
                    return (
                      <div key={p.id} className={cx('flex flex-col overflow-hidden rounded-[14px] bg-white', on ? 'border-2 border-primary' : 'border border-line')}>
                        <button type="button" onClick={() => setU(p.id, on ? 0 : x.qty)} aria-pressed={on} aria-label={`${p.name}${on ? ': olib tashlash' : ': tanlash'}`} className="relative">
                          <ProductThumb id={p.id} path={p.image_path} size={0} className="h-[104px] w-full rounded-none sm:h-[130px]" />
                          {on && <span className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-white shadow"><Check size={16} /></span>}
                        </button>
                        <div className="flex flex-1 flex-col gap-1.5 p-3">
                          <span className="text-[15px] leading-tight font-semibold">{p.name}</span>
                          <span className="text-xs text-sub">{[p.brand, `omborda ${fq(p.qty)} ${p.unit}`].filter(Boolean).join(' · ')}</span>
                          {on ? (
                            <span className="mt-auto flex items-center overflow-hidden rounded-lg border border-[#b6e3f4]">
                              <button type="button" onClick={() => setU(p.id, q - st)} aria-label={`${p.name}: kamaytirish`} className="grid h-10 w-10 place-items-center bg-[#f2fbff]"><Minus size={16} /></button>
                              <span className="flex-1 text-center text-[15px] font-bold tabular-nums">{fq(q)} {p.unit}</span>
                              <button type="button" onClick={() => setU(p.id, q + st)} aria-label={`${p.name}: ko‘paytirish`} className="grid h-10 w-10 place-items-center bg-[#f2fbff]"><Plus size={16} /></button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setU(p.id, x.qty)} className="mt-auto h-10 rounded-lg border border-dashed border-primary text-sm text-primary-hover">+ {fq(x.qty)} {p.unit}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {step === 'sum' && (
            <div className="mx-auto flex max-w-[640px] flex-col gap-3">
              <section className="overflow-hidden rounded-xl border border-line bg-white">
                <div className="border-b border-line px-4 py-3">
                  <div className="text-lg font-semibold">{work?.name}</div>
                  <div className="text-sm text-sub">{cat?.name}{tooth && <> · tish <b className="text-fg">{tooth}</b></>}</div>
                </div>
                {chosen.length === 0 && <div className="px-4 py-4 text-sm text-sub">Material tanlanmagan — faqat ish yoziladi.</div>}
                {chosen.map(([pid, q]) => {
                  const p = pm.get(pid)!;
                  const left = p.qty - q;
                  return (
                    <div key={pid} className="flex items-center gap-3 border-t border-muted px-4 py-2 text-sm">
                      <ProductThumb id={p.id} path={p.image_path} size={36} />
                      <span className="flex-1">{p.name}</span>
                      <b className="text-[#b91c1c] tabular-nums">−{fq(q)} {p.unit}</b>
                      <span className={cx('min-w-[120px] text-right text-xs', left < 0 ? 'font-semibold text-[#b91c1c]' : 'text-sub')}>omborda {fq(p.qty)} → {fq(left)}</span>
                    </div>
                  );
                })}
              </section>
              {chosen.some(([pid, q]) => (pm.get(pid)?.qty ?? 0) - q < 0) && <div role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Ba’zi materiallar omborda yetarli emas — qoldiq minusga tushadi.</div>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-4 py-3 sm:px-6">
          {step !== 'cats' && <button type="button" onClick={back} className={cx(BTN, 'border border-line bg-white')}><ChevronLeft size={18} /> Orqaga</button>}
          <span className="flex-1 text-sm text-sub"><span className="hidden sm:inline">{work ? `${work.name} · ${chosen.length} ta material` : ''}</span></span>
          <button type="button" onClick={onClose} className={cx(BTN, 'border border-line bg-white')}>Bekor qilish</button>
          {step === 'teeth' && <button type="button" disabled={!teeth.size} onClick={next} className={cx(BTN, 'bg-primary font-semibold text-white disabled:opacity-50')}>Davom etish <ChevronRight size={18} /></button>}
          {step === 'mats' && (groups.length && gi < groups.length - 1
            ? <button type="button" onClick={next} className={cx(BTN, 'bg-primary font-semibold text-white')}>Keyingi guruh <ChevronRight size={18} /></button>
            : <button type="button" onClick={() => setStep('sum')} className={cx(BTN, 'bg-primary font-semibold text-white')}>Yakunlash <ChevronRight size={18} /></button>)}
          {step === 'sum' && <button type="button" disabled={accept.isPending} onClick={() => accept.mutate(undefined)} className={cx(BTN, 'bg-ok font-semibold text-white disabled:opacity-60')}><Check size={18} /> Tasdiqlash</button>}
        </div>
      </>}
    </div>
  );
}
