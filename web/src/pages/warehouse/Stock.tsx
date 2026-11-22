import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Recycle, Move, List as ListIcon, Minus, Plus, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { db, http } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { toast } from 'sonner';
import { dmyhm, money } from '@/lib/format';
import { navigate } from '@/lib/router';
import type { Product, StockDoc, StockHistoryRow } from '@/lib/types';
import { Drawer, Empty, Spinner, cx } from '@/components/ui';
import { DOC_TYPE, WRITEOFF_REASON, fmtQty, type WhCtx } from './common';

type Filter = 'all' | 'ok' | 'low' | 'out' | 'neg';

export function Stock({ wh }: { wh: WhCtx }) {
  const mine = wh.warehouses;
  const tabs = mine;
  const [whId, setWhId] = useState<string>('all');
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [hist, setHist] = useState<Product | null>(null);
  const all = whId === 'all';
  const actWh = all ? mine.find((w) => w.is_main) ?? mine[0] : wh.whMap.get(whId);
  const qtyIn = (p: string) => (all ? wh.warehouses.reduce((a, w) => a + wh.qtyOf(p, w.id), 0) : wh.qtyOf(p, whId));
  const minIn = (p: string) => (all ? wh.warehouses.reduce((a, w) => a + (wh.settingOf(p, w.id)?.min_qty ?? 0), 0) : wh.settingOf(p, whId)?.min_qty ?? 0);

  // Tez chiqarish savati: kartochkadagi tugma bosilganda shu yerga 1 tadan qo'shiladi (miqdor eng kichik birlikda).
  const cartKey = actWh ? `td-out-${actWh.id}` : '';
  const [cart, setCart] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setCart(cartKey ? JSON.parse(sessionStorage.getItem(cartKey) || '{}') : {}); } catch { setCart({}); }
  }, [cartKey]);
  const putCart = (c: Record<string, number>) => {
    setCart(c);
    try { if (cartKey) sessionStorage.setItem(cartKey, JSON.stringify(c)); } catch { /* saqlab bo'lmasa ham ishlaydi */ }
  };
  const bump = (pid: string, delta: number) => {
    const n = +Math.max(0, (cart[pid] ?? 0) + delta).toFixed(3);
    const c = { ...cart }; if (n > 0) c[pid] = n; else delete c[pid];
    putCart(c);
  };
  const setQtyCart = (pid: string, n: number) => { const c = { ...cart }; if (n > 0) c[pid] = n; else delete c[pid]; putCart(c); };
  const [reason, setReason] = useState('usage');
  const [panelMin, setPanelMin] = useState(false);
  const writeOff = useAction(async () => {
    if (!actWh) throw new Error('Ombor tanlanmagan');
    const rows = Object.entries(cart).filter(([, q]) => q > 0);
    if (!rows.length) throw new Error('Chiqariladigan tovar yo‘q');
    const d = await db.insert<StockDoc>('stock_docs', { type: 'writeoff', warehouse_id: actWh.id, reason, note: 'Ombordan tez chiqarish' });
    await db.insertMany('stock_doc_lines', rows.map(([product_id, qty], i) => ({ doc_id: d.id, product_id, qty, position: i })));
    try { await http.post(`/api/stock-docs/${d.id}/post`); } catch (e) {
      await db.remove('stock_docs', d.id).catch(() => undefined);
      throw e;
    }
    return rows.length;
  }, { invalidate: ['stock_docs', 'stock_balances', 'stock'], onDone: (n) => { putCart({}); toast.success(`${n} xil tovar ombordan chiqarildi`); } });
  const cartRows = Object.entries(cart).map(([pid, q]) => ({ p: wh.prodMap.get(pid), q })).filter((r): r is { p: Product; q: number } => !!r.p);
  const changeWh = (id: string) => {
    if (cartRows.length && !confirm('Chiqarish ro‘yxatida tovarlar bor. Boshqa omborga o‘tilsa, ro‘yxat shu omborda saqlanib qoladi. Davom etasizmi?')) return;
    setWhId(id);
  };

  const quick = useAction(async ({ p, type }: { p: Product; type: 'writeoff' | 'transfer' }) => {
    if (!actWh) throw new Error('Ombor tanlanmagan');
    const target = type === 'transfer' ? wh.warehouses.find((w) => w.id !== actWh.id) : undefined;
    const d = await db.insert<StockDoc>('stock_docs', { type, warehouse_id: actWh.id, to_warehouse_id: target?.id ?? null, reason: type === 'writeoff' ? 'usage' : null });
    await db.insert('stock_doc_lines', { doc_id: d.id, product_id: p.id, qty: 1 });
    return d;
  }, { invalidate: ['stock_docs'], onDone: (d) => navigate(`/warehouse?tab=docs&type=${d.type}&doc=${d.id}`) });

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const items = wh.products.filter((p) => {
      if (p.archived) return false;
      const qty = qtyIn(p.id), min = minIn(p.id);
      if (!all) {
        const s = wh.settingOf(p.id, whId);
        if (s && !s.visible && qty === 0) return false;
        if (!s && qty === 0 && !wh.balances.some((b) => b.product_id === p.id && b.warehouse_id === whId) && !ql) return false;
      }
      if (ql && !`${p.name} ${p.sku ?? ''} ${p.barcode ?? ''} ${wh.brandMap.get(p.brand_id ?? '')?.name ?? ''}`.toLowerCase().includes(ql)) return false;
      if (f === 'ok') return qty > min && qty > 0;
      if (f === 'low') return min > 0 && qty <= min && qty > 0;
      if (f === 'out') return qty <= 0;
      if (f === 'neg') return qty < 0;
      return true;
    });
    const m = new Map<string, Product[]>();
    for (const p of items) {
      const loc = (all ? wh.warehouses.map((w) => wh.settingOf(p.id, w.id)?.location).find(Boolean) : wh.settingOf(p.id, whId)?.location) || 'Joyi ko‘rsatilmagan';
      m.set(loc, [...(m.get(loc) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'uz'));
  }, [wh, whId, q, f]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tabs.length) return <Empty>Omborlar yo‘q. Sozlamalarda ombor qo‘shing.</Empty>;
  const UNDER = (on: boolean) => cx('-mb-px h-9 border-b-2 px-2.5 text-[15px] whitespace-nowrap', on ? 'border-primary font-medium text-fg' : 'border-transparent text-sub hover:text-fg');

  return (
    <div className={cx('flex flex-col gap-4', cartRows.length > 0 && (panelMin ? 'pb-20' : 'pb-[360px]'))}>
      <div className="-mt-3 flex flex-wrap items-center gap-3 border-b border-line">
        <div role="tablist" className="flex flex-wrap items-center gap-1">
          <button type="button" role="tab" aria-selected={all} onClick={() => changeWh('all')} className={UNDER(all)}>Barcha omborlar</button>
          {tabs.map((w) => <button key={w.id} type="button" role="tab" aria-selected={w.id === whId} onClick={() => changeWh(w.id)} className={UNDER(w.id === whId)}>{wh.whLabel(w)}</button>)}
        </div>
        <div className="ml-auto flex flex-wrap gap-2 pb-1.5">
          <input type="search" aria-label="Tovar, brend yoki artikul bo‘yicha qidirish" placeholder="Tovar, brend yoki artikul bo‘yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-8 w-80 max-w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-primary" />
          <select aria-label="Holat" value={f} onChange={(e) => setF(e.target.value as Filter)} className="h-8 w-40 rounded-lg border border-line bg-white px-2 text-sm">
            <option value="all">Hammasi</option><option value="ok">Yetarli</option><option value="low">Kam qolgan</option><option value="out">Tugagan</option><option value="neg">Manfiy qoldiq</option>
          </select>
        </div>
      </div>

      {groups.length === 0 && <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-sub">Hech narsa topilmadi. Tovarlar kirim nakladnoyi orqali omborga tushadi.</div>}
      {groups.map(([loc, items]) => (
        <section key={loc} className="flex flex-col gap-3">
          <h2 className="m-0 mt-1 flex items-center gap-2.5 text-xl font-medium"><ListIcon size={22} className="text-primary" />{loc}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {items.map((p) => {
              const qty = qtyIn(p.id), min = minIn(p.id);
              const st = qty <= 0 ? 'out' : min > 0 && qty <= min ? 'low' : 'ok';
              const nWh = wh.warehouses.filter((w) => wh.qtyOf(p.id, w.id) > 0).length;
              const other = all ? 0 : wh.warehouses.filter((w) => w.id !== whId).reduce((a, w) => a + Math.max(0, wh.qtyOf(p.id, w.id)), 0);
              const bar = all ? (nWh > 0 ? `${nWh} ta omborda bor` : 'Hech qaysi omborda yo‘q') : other > 0 ? `Boshqa omborlarda: ${other} ${p.unit}` : 'Boshqa omborlarda yo‘q';
              const barColor = (all ? nWh === 0 : qty <= 0 && other === 0) ? '#f59e0b' : '#94a3b8';
              const qtyText = qty < 0 ? `Minusda: ${qty} ${p.unit}` : qty === 0 ? 'Tugagan' : `${fmtQty(p, qty).split(' (')[0]}${st === 'low' ? ' · kam qoldi' : ''}`;
              const can = wh.canEdit(actWh);
              const inCart = cart[p.id] ?? 0;
              return (
                <article key={p.id} className={cx('relative flex flex-col overflow-hidden rounded-xl border', inCart ? 'border-bad ring-2 ring-bad/20' : 'border-line', ' shadow-[0_1px_2px_rgba(7,18,30,.04),0_4px_12px_rgba(7,18,30,.06)]', st === 'out' ? 'bg-[#fff5f5]' : 'bg-white')}>
                  <div className="flex h-[26px] items-center px-3 text-[13px] font-semibold text-white" style={{ background: barColor }}>{bar}</div>
                  {inCart > 0 && <span className="absolute top-9 right-2 rounded-full bg-bad px-2.5 py-1 text-sm font-bold text-white shadow">−{inCart}</span>}
                  <button type="button" onClick={() => setHist(p)} aria-label={`${p.name}: tovar tarixi`} className="grid h-[170px] w-full place-items-center">
                    <Package size={88} strokeWidth={1.4} className={st === 'out' ? 'text-[#e5c4c4]' : 'text-[#c3ccd5]'} />
                  </button>
                  <div className="flex flex-1 flex-col gap-1 px-3 pb-3">
                    <div className={cx('self-end font-semibold', st === 'out' ? 'text-lg text-bad' : st === 'low' ? 'text-[15px] text-warn' : 'text-[15px] text-primary-hover')}>{qtyText}</div>
                    <div className={cx('text-[15px] font-semibold', st === 'out' ? 'text-bad' : 'text-primary-hover')}>{p.name}</div>
                    <div className={cx('text-xs', st === 'out' ? 'text-[#f87171]' : 'text-sub')}>{wh.brandMap.get(p.brand_id ?? '')?.name ?? '—'}{p.sku && ` · ${p.sku}`}</div>
                    {p.pack_unit && p.pack_qty > 1 && <div className={cx('text-xs', st === 'out' ? 'text-[#f87171]' : 'text-sub')}>1 {p.pack_unit} = {p.pack_qty} {p.unit}</div>}
                  </div>
                  {can && (
                    <div className="flex gap-1.5 px-2 pb-2">
                      {inCart ? (
                        <span className="flex h-9 flex-1 items-center overflow-hidden rounded-md border border-bad">
                          <button type="button" aria-label={`${p.name}: kamaytirish`} onClick={() => bump(p.id, -1)} className="grid h-full w-9 place-items-center text-bad hover:bg-bad-soft"><Minus size={16} /></button>
                          <span className="flex-1 text-center text-sm font-semibold text-bad">−{inCart} {p.unit}</span>
                          <button type="button" aria-label={`${p.name}: yana bitta chiqarish`} onClick={() => bump(p.id, 1)} className="grid h-full w-9 place-items-center text-bad hover:bg-bad-soft"><Plus size={16} /></button>
                        </span>
                      ) : (
                        <button type="button" aria-label={`${p.name}: ombordan chiqarish`} title="Ombordan chiqarish (1 ta)" onClick={() => bump(p.id, 1)}
                          className={cx('grid h-9 flex-1 place-items-center rounded-md text-white', st === 'out' ? 'bg-[#fca5a5]' : 'bg-primary')}><Recycle size={18} /></button>
                      )}
                      {wh.warehouses.length > 1 && <button type="button" aria-label="Ko‘chirish" title="Boshqa omborga ko‘chirish" onClick={() => quick.mutate({ p, type: 'transfer' })}
                        className={cx('grid h-9 flex-1 place-items-center rounded-md text-white', st === 'out' ? 'bg-[#fca5a5]' : 'bg-primary')}><Move size={18} /></button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {cartRows.length > 0 && actWh && (
        <aside aria-label="Ombordan chiqarish" className="fixed right-4 bottom-4 z-50 flex max-h-[70vh] w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="flex items-center gap-2 border-b border-line bg-bad-soft px-4 py-2.5">
            <Recycle size={18} className="text-bad" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Ombordan chiqarish · {cartRows.length} xil</div>
              <div className="truncate text-xs text-sub">{wh.whLabel(actWh)}</div>
            </div>
            <button type="button" aria-label={panelMin ? 'Ochish' : 'Yig‘ish'} title={panelMin ? 'Ochish' : 'Yig‘ish'} onClick={() => setPanelMin(!panelMin)} className="grid h-8 w-8 place-items-center rounded-md text-sub hover:bg-white">{panelMin ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
            <button type="button" aria-label="Ro‘yxatni tozalash" title="Ro‘yxatni tozalash" onClick={() => putCart({})} className="grid h-8 w-8 place-items-center rounded-md text-sub hover:bg-white"><X size={18} /></button>
          </div>
          {!panelMin && <>
            <ul className="m-0 flex-1 list-none overflow-y-auto p-0">
              {cartRows.map(({ p, q }) => {
                const have = wh.qtyOf(p.id, actWh.id);
                return (
                  <li key={p.id} className="flex items-center gap-2 border-b border-line px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className={cx('text-xs', have - q < 0 ? 'text-bad' : 'text-sub')}>Omborda {fmtQty(p, have)} → qoladi {+(have - q).toFixed(3)} {p.unit}</div>
                    </div>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={`${p.name}: kamaytirish`} onClick={() => bump(p.id, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-line hover:bg-muted"><Minus size={13} /></button>
                      <input type="number" min={0} step="any" aria-label={`${p.name}: miqdor`} value={q} onChange={(e) => setQtyCart(p.id, Math.max(0, Number(e.target.value) || 0))}
                        className="h-7 w-14 rounded-md border border-line px-1 text-center text-sm" />
                      <button type="button" aria-label={`${p.name}: ko‘paytirish`} onClick={() => bump(p.id, 1)} className="grid h-7 w-7 place-items-center rounded-md border border-line hover:bg-muted"><Plus size={13} /></button>
                    </span>
                    <button type="button" aria-label={`${p.name}: ro‘yxatdan olib tashlash`} onClick={() => setQtyCart(p.id, 0)} className="grid h-7 w-7 place-items-center rounded-md text-sub hover:text-bad"><Trash2 size={14} /></button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-2 border-t border-line p-3">
              <label className="flex items-center gap-2 text-sm"><span className="text-sub">Sabab</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 flex-1 rounded-md border border-line bg-white px-2 text-sm">
                  {Object.entries(WRITEOFF_REASON).filter(([k]) => k !== 'act').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <button type="button" disabled={writeOff.isPending} onClick={() => writeOff.mutate(undefined)}
                className="h-10 rounded-lg bg-bad text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {writeOff.isPending ? 'Chiqarilmoqda…' : `Ombordan chiqarish (${cartRows.length} xil)`}
              </button>
            </div>
          </>}
        </aside>
      )}
      {hist && <History wh={wh} product={hist} whId={all ? actWh?.id ?? '' : whId} onClose={() => setHist(null)} />}
    </div>
  );
}

function History({ wh, product, whId, onClose }: { wh: WhCtx; product: Product; whId: string; onClose: () => void }) {
  const h = useQuery({ queryKey: ['stock', 'history', product.id, whId], queryFn: () => http.get<StockHistoryRow[]>(`/api/stock/history?product_id=${product.id}&warehouse_id=${whId}`) });
  // Qoldiqni oxirgidan orqaga qarab hisoblaymiz
  let run = wh.qtyOf(product.id, whId);
  const rows = (h.data ?? []).map((r) => { const after = run; run -= r.qty; return { ...r, after }; });
  return (
    <Drawer open onClose={onClose} title={product.name} width={520}>
      <div className="mb-4 text-sm"><span className="text-sub">{wh.whLabel(wh.whMap.get(whId))}:</span> <b>{fmtQty(product, wh.qtyOf(product.id, whId))}</b></div>
      {h.isLoading ? <Spinner /> : rows.length === 0 ? <Empty>Harakat yo‘q</Empty> : (
        <table className="w-full border-collapse text-sm">
          <thead><tr className="text-left text-xs text-sub"><th className="pb-2 font-medium">Sana</th><th className="pb-2 font-medium">Hujjat</th><th className="pb-2 text-right font-medium">Miqdor</th><th className="pb-2 text-right font-medium">Qoldiq</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2 pr-2 whitespace-nowrap text-sub">{dmyhm(r.moved_at)}</td>
                <td className="py-2 pr-2">
                  <button type="button" onClick={() => navigate(`/warehouse?tab=docs&type=${r.type}&doc=${r.doc_id}`)} className="text-left text-primary hover:underline">
                    {DOC_TYPE[r.type].label} · {r.number}
                  </button>
                  <div className="text-xs text-sub">
                    {r.type === 'receipt' && wh.supMap.get(r.counterparty_id ?? '')?.name}
                    {r.type === 'writeoff' && (r.act_patient ? `Bajarilgan ish · ${r.act_patient}${r.act_works ? ` (${r.act_works})` : ''}` : WRITEOFF_REASON[r.reason ?? 'other'])}
                    {r.type === 'transfer' && (r.qty > 0 ? `${wh.whLabel(wh.whMap.get(r.doc_warehouse_id))} dan` : `${wh.whLabel(wh.whMap.get(r.to_warehouse_id ?? ''))} ga`)}
                    {r.status === 'reversed' && ' · bekor qilingan'}
                  </div>
                </td>
                <td className={cx('py-2 text-right font-medium whitespace-nowrap', r.qty > 0 ? 'text-ok' : 'text-bad')}>{r.qty > 0 ? '+' : ''}{r.qty}</td>
                <td className="py-2 text-right whitespace-nowrap">{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-xs text-sub">Tannarx FIFO bo‘yicha hisoblanadi. Oxirgi kirim narxi: {money(product.last_cost)} so‘m / {product.unit}.</p>
    </Drawer>
  );
}
