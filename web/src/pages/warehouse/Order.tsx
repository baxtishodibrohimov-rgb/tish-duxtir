import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';
import { useOrg } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { navigate } from '@/lib/router';
import type { StockDoc } from '@/lib/types';
import { Button, Card, Empty, PageLoader, Select } from '@/components/ui';
import { fmtQty, type WhCtx } from './common';

interface Low { product_id: string; warehouse_id: string; name: string; unit: string; warehouse_name: string; qty: number; min_qty: number; order_qty: number }

/** Kritik qoldiqqa tushgan tovarlar — ombor bo'yicha guruhlangan buyurtma ro'yxati. */
export function Order({ wh }: { wh: WhCtx }) {
  const { branch } = useOrg();
  const low = useQuery({ queryKey: ['stock', 'low', branch.id], queryFn: () => http.get<Low[]>(`/api/stock/low?branch_id=${branch.id}`) });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sup, setSup] = useState<Record<string, string>>({});
  const groups = useMemo(() => {
    const m = new Map<string, Low[]>();
    for (const r of low.data ?? []) m.set(r.warehouse_id, [...(m.get(r.warehouse_id) ?? []), r]);
    return [...m.entries()];
  }, [low.data]);
  const make = useAction(({ w, rows }: { w: string; rows: Low[] }) => http.post<StockDoc>('/api/stock/order-to-receipt', {
    warehouse_id: w, counterparty_id: sup[w] || null,
    lines: rows.map((r) => ({ product_id: r.product_id, qty: qty[`${r.product_id}|${w}`] ?? suggest(r) })),
  }), { invalidate: ['stock_docs'], success: 'Kirim qoralamasi yaratildi', onDone: (d) => navigate(`/warehouse?tab=docs&type=receipt&doc=${d.id}`) });

  if (low.isLoading) return <PageLoader />;
  if (!groups.length) return <Card><Empty>Barcha tovarlar yetarli. Kritik qoldiq tovar kartasida (Sozlamalar → Tovarlar) har bir ombor uchun belgilanadi.</Empty></Card>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map(([w, rows]) => (
        <Card key={w} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <span className="font-semibold">{wh.whLabel(wh.whMap.get(w))}</span>
            <span className="text-sm text-sub">· {rows.length} ta tovar</span>
            {wh.canEdit(wh.whMap.get(w)) && <>
              <Select aria-label="Yetkazib beruvchi" value={sup[w] ?? ''} onChange={(e) => setSup({ ...sup, [w]: e.target.value })} className="ml-auto h-8 w-56">
                <option value="">Yetkazib beruvchi…</option>{wh.suppliers.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Button variant="primary" size="sm" loading={make.isPending} onClick={() => make.mutate({ w, rows })}>Kirim qoralamasini yaratish</Button>
            </>}
          </div>
          {rows.map((r) => {
            const p = wh.prodMap.get(r.product_id);
            const k = `${r.product_id}|${w}`;
            return (
              <div key={k} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
                <span className="min-w-[200px] flex-1 font-medium">{r.name}</span>
                <span className={r.qty <= 0 ? 'text-bad' : 'text-warn'}>Qoldiq: {fmtQty(p, r.qty)}</span>
                <span className="text-sub">Min: {r.min_qty}</span>
                <label className="flex items-center gap-1.5 text-sub">Buyurtma
                  <input type="number" min={0} value={qty[k] ?? suggest(r)} onChange={(e) => setQty({ ...qty, [k]: Number(e.target.value) })} className="h-8 w-24 rounded-lg border border-line px-2 text-right" /> {r.unit}
                </label>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

const suggest = (r: Low) => (r.order_qty > 0 ? r.order_qty : Math.max(r.min_qty * 2 - r.qty, r.min_qty));
