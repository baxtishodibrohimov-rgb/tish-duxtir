import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { money } from '@/lib/format';
import type { PriceCategory, PriceItem } from '@/lib/types';
import { Card, PageLoader, Toggle, cx } from '@/components/ui';

/**
 * Laboratoriya → Narxlar: qaysi ish laboratoriyaga boradi va texnikka 1 tish uchun qancha to'lanadi.
 * Ma'lumot prays qatorining o'zida saqlanadi (is_lab, tech_price).
 */
export function LabPrices() {
  const { can, org, refresh } = useOrg();
  const edit = can('settings.edit');
  const cats = useList<PriceCategory>('price_categories');
  const items = useList<PriceItem>('price_items', { archived: false });
  const [onlyLab, setOnlyLab] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [warn, setWarn] = useState(String(org.lab_warn_days ?? 2));
  const upd = useAction(({ id, patch }: { id: string; patch: Partial<PriceItem> }) => db.update('price_items', id, patch), { invalidate: ['price_items', 'works'] });
  const saveWarn = useAction(() => http.patch('/api/org', { lab_warn_days: Math.min(60, Math.max(0, Math.round(Number(warn) || 0))) }), { success: 'Saqlandi', onDone: () => { void refresh(); } });

  if (cats.isLoading || items.isLoading) return <PageLoader />;
  const all = items.data ?? [];
  const commit = (it: PriceItem) => {
    const v = draft[it.id];
    if (v === undefined) return;
    const n = Math.max(0, Math.round(Number(v.replace(/\s/g, '')) || 0));
    setDraft((d) => { const x = { ...d }; delete x[it.id]; return x; });
    if (n !== Number(it.tech_price)) upd.mutate({ id: it.id, patch: { tech_price: n } });
  };
  // Ortopediya kategoriyasi birinchi.
  const sorted = [...(cats.data ?? [])].sort((a, b) => Number(/ortoped/i.test(b.name)) - Number(/ortoped/i.test(a.name)) || a.position - b.position);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e9d5ff] bg-[#faf5ff] px-4 py-3 text-sm text-[#4c1d95]">
        <FlaskConical size={18} />
        <span className="flex-1">«Lab ishi» belgilangan ish «Material xarajat»da tanlanganda texnik, ma’sul shaxs, rang, qolip va muddat so‘raladi.
          Texnikka pul bemor to‘lagan sari yoziladi: to‘liq to‘lasa — to‘liq, yarmini to‘lasa — yarmi.</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={onlyLab} onChange={(e) => setOnlyLab(e.target.checked)} />Faqat lab ishlari</label>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-sm">
          Muddatdan
          <input type="number" min={0} max={60} aria-label="Necha kun oldin ogohlantirish" disabled={!edit} value={warn} onChange={(e) => setWarn(e.target.value)}
            className="h-9 w-16 rounded-lg border border-line bg-white px-2 text-center text-sm" />
          kun oldin qo‘ng‘iroqchada ogohlantirish
          {edit && String(org.lab_warn_days ?? 2) !== warn && <button type="button" onClick={() => saveWarn.mutate(undefined)} className="h-9 rounded-lg bg-primary px-3 text-white">Saqlash</button>}
        </label>
      </div>
      {!edit && <div className="text-xs text-sub">O‘zgartirish uchun «Klinika sozlamalari» ruxsati kerak.</div>}
      {sorted.map((c) => {
        const list = all.filter((i) => i.category_id === c.id && (!onlyLab || i.is_lab));
        if (!list.length) return null;
        return (
          <Card key={c.id} className="overflow-x-auto">
            <div className="border-b border-line bg-surface px-4 py-2 font-semibold">{c.name}</div>
            <table className="w-full border-collapse text-sm">
              <thead><tr className="text-left text-xs text-sub">
                <th className="h-9 px-4 font-semibold">Ish</th><th className="px-3 text-right font-semibold">Klinika narxi</th>
                <th className="px-3 font-semibold">Lab ishi</th><th className="px-3 font-semibold">Texnik narxi (1 tish)</th><th className="px-3 text-right font-semibold">Klinikaga qoladi</th>
              </tr></thead>
              <tbody>
                {list.map((it) => {
                  const tp = Number(it.tech_price);
                  return (
                    <tr key={it.id} className={cx('border-t border-line', it.is_lab && 'bg-[#fdfbff]')}>
                      <td className="px-4 py-2 font-medium">{it.name}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{money(it.price)}</td>
                      <td className="px-3 py-2"><Toggle on={it.is_lab} disabled={!edit} label={`${it.name}: laboratoriya ishi`} onChange={(v) => upd.mutate({ id: it.id, patch: { is_lab: v } })} /></td>
                      <td className="px-3 py-2">
                        {it.is_lab ? (
                          <input inputMode="numeric" aria-label={`${it.name}: texnik narxi`} disabled={!edit}
                            value={draft[it.id] ?? (tp ? money(tp) : '')} placeholder="0"
                            onChange={(e) => setDraft({ ...draft, [it.id]: e.target.value.replace(/[^\d\s]/g, '') })}
                            onBlur={() => commit(it)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="h-9 w-36 rounded-lg border border-line bg-white px-2 text-right text-sm tabular-nums" />
                        ) : <span className="text-faint">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-sub tabular-nums">{it.is_lab ? money(Number(it.price) - tp) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
