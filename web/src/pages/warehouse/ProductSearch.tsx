import { forwardRef, useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import type { Product } from '@/lib/types';
import { cx } from '@/components/ui';
import { fold } from '@/lib/format';
import { fmtQty, type WhCtx } from './common';

/**
 * Nakladnoyga tovar qo'shish: nomi, brendi, artikuli yoki shtrix-kodi bo'yicha qidirish.
 * ↑↓ va Enter bilan tanlanadi. Nakladnoyda bor tovar «qo'shilgan» deb belgilanadi.
 */
export const ProductSearch = forwardRef<HTMLInputElement, {
  wh: WhCtx; inDoc: Map<string, number>; whId: string; showStock: boolean;
  onPick: (p: Product) => void; onCreate: (name: string) => void;
}>(function ProductSearch({ wh, inDoc, whId, showStock, onPick, onCreate }, ref) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const found = useMemo(() => {
    const words = fold(q.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return wh.products.filter((p) => {
      if (p.archived) return false;
      const hay = fold(`${p.name} ${wh.brandMap.get(p.brand_id ?? '')?.name ?? ''} ${p.sku ?? ''} ${p.barcode ?? ''}`);
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => Number(fold(b.name).startsWith(words[0]!)) - Number(fold(a.name).startsWith(words[0]!)) || a.name.localeCompare(b.name, 'uz')).slice(0, 30);
  }, [q, wh.products, wh.brandMap]);
  const total = found.length + (q.trim() ? 1 : 0); // oxirgisi — «Yangi tovar»

  function pick(i: number) {
    if (i < found.length) onPick(found[i]!);
    else if (q.trim()) onCreate(q.trim());
    setQ(''); setHi(0); setOpen(false);
  }

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sub" />
      <input ref={ref} type="search" value={q} placeholder="Tovar qo‘shish: nomi, brendi, artikuli yoki shtrix-kodini yozing…" aria-label="Tovar qidirish"
        role="combobox" aria-expanded={open && total > 0} aria-controls="psList" aria-autocomplete="list" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((hi + 1) % Math.max(total, 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + total) % Math.max(total, 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (total) pick(hi); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        className="h-11 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-[15px] focus:border-primary focus:outline-none" />
      {open && total > 0 && (
        <ul id="psList" role="listbox" className="absolute top-12 right-0 left-0 z-30 m-0 max-h-[340px] list-none overflow-y-auto rounded-lg border border-line bg-white p-1 shadow-pop">
          {found.map((p, i) => {
            const had = inDoc.get(p.id);
            const brand = wh.brandMap.get(p.brand_id ?? '')?.name;
            return (
              <li key={p.id} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setHi(i)}
                className={cx('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', i === hi ? 'bg-primary-soft' : '')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-sub">{[brand, p.sku, showStock ? `omborda ${fmtQty(p, wh.qtyOf(p.id, whId))}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                {had !== undefined && <span className="inline-flex flex-none items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok"><Check size={12} /> qo‘shilgan · {fmtQty(p, had)}</span>}
              </li>
            );
          })}
          <li role="option" aria-selected={hi === found.length} onMouseDown={(e) => { e.preventDefault(); pick(found.length); }} onMouseEnter={() => setHi(found.length)}
            className={cx('flex cursor-pointer items-center gap-2 rounded-md border-t border-line px-3 py-2 text-sm text-primary', hi === found.length && 'bg-primary-soft')}>
            <Plus size={15} /> Yangi tovar: «{q.trim()}»
          </li>
        </ul>
      )}
    </div>
  );
});
