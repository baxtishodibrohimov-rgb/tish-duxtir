import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PackageMinus, ArrowLeftRight, Search } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dmyhm, money } from '@/lib/format';
import { navigate } from '@/lib/router';
import type { Product, StockDoc, StockHistoryRow } from '@/lib/types';
import { Drawer, Empty, Spinner, cx } from '@/components/ui';
import { DOC_TYPE, WRITEOFF_REASON, fmtQty, type WhCtx } from './common';

type Filter = 'all' | 'low' | 'out' | 'neg';

export function Stock({ wh }: { wh: WhCtx }) {
  const { branch } = useOrg();
  const mine = wh.warehouses.filter((w) => w.branch_id === branch.id);
  const others = wh.warehouses.filter((w) => w.branch_id !== branch.id);
  const tabs = [...mine, ...others];
  const [whId, setWhId] = useState(() => mine.find((w) => w.is_main)?.id ?? tabs[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const [hist, setHist] = useState<Product | null>(null);
  const cur = wh.whMap.get(whId);

  const quick = useAction(async ({ p, type }: { p: Product; type: 'writeoff' | 'transfer' }) => {
    const target = type === 'transfer' ? wh.warehouses.find((w) => w.id !== whId && w.branch_id === cur?.branch_id) ?? wh.warehouses.find((w) => w.id !== whId) : undefined;
    const d = await db.insert<StockDoc>('stock_docs', { type, warehouse_id: whId, to_warehouse_id: target?.id ?? null, reason: type === 'writeoff' ? 'usage' : null });
    await db.insert('stock_doc_lines', { doc_id: d.id, product_id: p.id, qty: 1 });
    return d;
  }, { invalidate: ['stock_docs'], onDone: (d) => navigate(`/warehouse?tab=docs&type=${d.type}&doc=${d.id}`) });

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const items = wh.products.filter((p) => {
      if (p.archived) return false;
      const s = wh.settingOf(p.id, whId);
      const qty = wh.qtyOf(p.id, whId);
      if (s && !s.visible && qty === 0) return false;
      if (!s && qty === 0 && f === 'all' && !ql) {
        // Bu omborda hech qachon bo'lmagan tovarni ko'rsatmaymiz
        if (!wh.balances.some((b) => b.product_id === p.id && b.warehouse_id === whId)) return false;
      }
      if (ql && !`${p.name} ${p.sku ?? ''} ${p.barcode ?? ''} ${wh.brandMap.get(p.brand_id ?? '')?.name ?? ''}`.toLowerCase().includes(ql)) return false;
      const min = s?.min_qty ?? 0;
      if (f === 'low') return min > 0 && qty <= min && qty > 0;
      if (f === 'out') return qty === 0;
      if (f === 'neg') return qty < 0;
      return true;
    });
    const m = new Map<string, Product[]>();
    for (const p of items) {
      const loc = wh.settingOf(p.id, whId)?.location || 'Joyi ko‘rsatilmagan';
      m.set(loc, [...(m.get(loc) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'uz'));
  }, [wh, whId, q, f]);

  if (!tabs.length) return <Empty>Omborlar yo‘q. Sozlamalarda ombor qo‘shing.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex flex-wrap gap-x-5 border-b border-line">
        {tabs.map((w) => (
          <button key={w.id} role="tab" aria-selected={w.id === whId} onClick={() => setWhId(w.id)}
            className={cx('-mb-px h-9 border-b-2 text-sm font-medium whitespace-nowrap', w.id === whId ? 'border-primary' : 'border-transparent text-sub hover:text-fg')}>
            {wh.whLabel(w)}{w.is_main && <span className="ml-1 text-xs text-faint">(asosiy)</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1 sm:max-w-md">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input type="search" aria-label="Qidirish" placeholder="Tovar, brend yoki artikul bo‘yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-8 w-full rounded-lg border border-line bg-white pr-2 pl-8 text-sm outline-none focus:border-primary" />
        </div>
        <select aria-label="Holat" value={f} onChange={(e) => setF(e.target.value as Filter)} className="h-8 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="all">Hammasi</option><option value="low">Kam qolgan</option><option value="out">Tugagan</option><option value="neg">Manfiy qoldiq</option>
        </select>
      </div>

      {groups.length === 0 && <Empty>Tovar topilmadi. Tovarlar kirim nakladnoyi orqali omborga tushadi.</Empty>}
      {groups.map(([loc, items]) => (
        <section key={loc} className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-semibold text-sub">{loc} <span className="font-normal text-faint">· {items.length}</span></h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((p) => {
              const qty = wh.qtyOf(p.id, whId);
              const s = wh.settingOf(p.id, whId);
              const min = s?.min_qty ?? 0;
              const otherQty = wh.warehouses.filter((w) => w.id !== whId).map((w) => ({ w, q: wh.qtyOf(p.id, w.id) })).filter((x) => x.q !== 0);
              const total = Math.max(qty, 0) + otherQty.reduce((a, x) => a + Math.max(x.q, 0), 0);
              const tone = qty < 0 ? 'text-bad' : qty === 0 ? 'text-faint' : min > 0 && qty <= min ? 'text-warn' : 'text-fg';
              return (
                <div key={p.id} className="flex flex-col gap-2 rounded-card border border-line bg-white p-4">
                  <button type="button" onClick={() => setHist(p)} aria-label={`${p.name}: tovar tarixi`} className="flex flex-col items-start gap-0.5 text-left">
                    <span className="text-xs text-sub">{wh.brandMap.get(p.brand_id ?? '')?.name ?? '—'}{p.sku && ` · ${p.sku}`}</span>
                    <span className="font-medium hover:underline">{p.name}</span>
                  </button>
                  <div className="flex items-end justify-between gap-2">
                    <span className={cx('text-lg font-semibold', tone)}>{fmtQty(p, qty)}</span>
                    {min > 0 && <span className="text-xs text-sub">min: {min}</span>}
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" title={otherQty.map((x) => `${wh.whLabel(x.w)}: ${fmtQty(p, x.q)}`).join('\n')}>
                    <span className="bg-primary" style={{ width: `${total ? (Math.max(qty, 0) / total) * 100 : 0}%` }} />
                    <span className="bg-[#9fd8ee]" style={{ width: `${total ? (100 - (Math.max(qty, 0) / total) * 100) : 0}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-sub">{otherQty.length ? `Boshqa omborlarda: ${otherQty.reduce((a, x) => a + x.q, 0)} ${p.unit}` : 'Boshqa omborlarda yo‘q'}</span>
                    {wh.canEdit(cur) && (
                      <span className="flex gap-1">
                        <button type="button" aria-label="Hisobdan chiqarish" title="Hisobdan chiqarish" onClick={() => quick.mutate({ p, type: 'writeoff' })}
                          className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-muted"><PackageMinus size={15} /></button>
                        {wh.warehouses.length > 1 && <button type="button" aria-label="Ko‘chirish" title="Boshqa omborga ko‘chirish" onClick={() => quick.mutate({ p, type: 'transfer' })}
                          className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-muted"><ArrowLeftRight size={15} /></button>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {hist && <History wh={wh} product={hist} whId={whId} onClose={() => setHist(null)} />}
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
                    {r.type === 'writeoff' && WRITEOFF_REASON[r.reason ?? 'other']}
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
