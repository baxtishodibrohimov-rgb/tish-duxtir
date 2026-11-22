import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, FolderPlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { db } from '@/lib/api';
import { useAction, byId } from '@/lib/hooks';
import { fold, qty as fq } from '@/lib/format';
import type { Brand, CalcCard, PriceItem, Product, WorkMatGroup } from '@/lib/types';
import { ProductThumb } from '@/components/ProductThumb';
import { cx } from '@/components/ui';

const INV = { invalidate: ['calc_cards', 'work_mat_groups'] };

/**
 * Sozlamalar → Bajarilgan ish → bitta ishning materiallari.
 * Materiallar guruhlarga bo'linadi; shifokor "Material xarajat"da guruhlarni shu tartibda birin-ketin ko'radi.
 */
export function WorkMaterials({ work, allWorks, products, brands, cards, groups }: {
  work: PriceItem; allWorks: PriceItem[]; products: Product[]; brands: Brand[]; cards: CalcCard[]; groups: WorkMatGroup[];
}) {
  const mats = cards.filter((c) => c.price_item_id === work.id).sort((a, b) => a.position - b.position);
  const grs = groups.filter((g) => g.price_item_id === work.id).sort((a, b) => a.position - b.position);
  const pm = byId(products), bm = byId(brands);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [ren, setRen] = useState<{ id: string; name: string } | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const found = useMemo(() => {
    const words = fold(q.trim()).split(/\s+/).filter(Boolean);
    return products.filter((p) => !p.archived && !mats.some((m) => m.product_id === p.id)
      && words.every((w) => fold(`${p.name} ${bm.get(p.brand_id ?? '')?.name ?? ''} ${p.sku ?? ''} ${p.barcode ?? ''}`).includes(w)));
  }, [q, products, mats, bm]);

  const nextPos = () => (mats.length ? Math.max(...mats.map((m) => m.position)) + 1 : 0);
  const addMat = useAction((pid: string) => db.insert('calc_cards', { price_item_id: work.id, product_id: pid, qty: 1, position: nextPos() }), INV);
  const setQty = useAction(({ id, qty }: { id: string; qty: number }) => db.update('calc_cards', id, { qty }), INV);
  const delMat = useAction((id: string) => db.remove('calc_cards', id), INV);
  const toGroup = useAction(async ({ ids, group }: { ids: string[]; group: string | null }) => {
    for (const id of ids) await db.update('calc_cards', id, { group_id: group });
  }, { ...INV, onDone: () => setSel(new Set()) });
  const makeGroup = useAction(async (name: string) => {
    const g = await db.insert<WorkMatGroup>('work_mat_groups', { price_item_id: work.id, name, position: grs.length ? Math.max(...grs.map((x) => x.position)) + 1 : 0 });
    for (const id of sel) await db.update('calc_cards', id, { group_id: g.id });
  }, { ...INV, success: 'Guruh yaratildi', onDone: () => { setSel(new Set()); setNewGroup(''); } });
  const renGroup = useAction(({ id, name }: { id: string; name: string }) => db.update('work_mat_groups', id, { name }), { ...INV, onDone: () => setRen(null) });
  const delGroup = useAction((id: string) => db.remove('work_mat_groups', id), INV);
  const moveGroup = useAction(async ({ i, dir }: { i: number; dir: -1 | 1 }) => {
    const a = grs[i]!, b = grs[i + dir]!;
    await db.update('work_mat_groups', a.id, { position: b.position === a.position ? a.position + dir : b.position });
    await db.update('work_mat_groups', b.id, { position: a.position });
  }, INV);
  // Nusxa: boshqa ishning faqat tanlangan guruhlari ('free' — guruhsiz materiallari).
  const [pick, setPick] = useState<Set<string>>(new Set());
  const srcGroups = useMemo(() => {
    if (!copyFrom) return [];
    const sc = cards.filter((c) => c.price_item_id === copyFrom);
    const sg = groups.filter((g) => g.price_item_id === copyFrom).sort((x, y) => x.position - y.position)
      .map((g) => ({ id: g.id, name: g.name, cards: sc.filter((c) => c.group_id === g.id) })).filter((g) => g.cards.length);
    const free = sc.filter((c) => !c.group_id || !sg.some((g) => g.id === c.group_id));
    if (free.length) sg.push({ id: 'free', name: 'Guruhsiz materiallar', cards: free });
    return sg;
  }, [copyFrom, cards, groups]);
  const copy = useAction(async () => {
    const have = new Set(mats.map((m) => m.product_id));
    let gp = grs.length ? Math.max(...grs.map((x) => x.position)) + 1 : 0;
    let p = nextPos(), n = 0;
    for (const g of srcGroups.filter((x) => pick.has(x.id))) {
      const rows = g.cards.filter((c) => !have.has(c.product_id)).sort((x, y) => x.position - y.position);
      if (!rows.length) continue;
      let gid: string | null = null;
      if (g.id !== 'free') {
        const same = grs.find((x) => fold(x.name.trim()) === fold(g.name.trim()));
        gid = same ? same.id : (await db.insert<WorkMatGroup>('work_mat_groups', { price_item_id: work.id, name: g.name, position: gp++ })).id;
      }
      await db.insertMany('calc_cards', rows.map((c) => ({ price_item_id: work.id, product_id: c.product_id, qty: c.qty, group_id: gid, position: p++ })));
      rows.forEach((c) => have.add(c.product_id));
      n += rows.length;
    }
    return n;
  }, { ...INV, onDone: (n) => {
    setCopyFrom(''); setPick(new Set());
    if (!n) alert('Qo‘shiladigan yangi material yo‘q — tanlangan guruhlardagi materiallar bu ishda allaqachon bor.');
  } });

  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  const others = allWorks.filter((w) => w.id !== work.id && cards.some((c) => c.price_item_id === w.id));

  const row = (m: CalcCard) => {
    const p = pm.get(m.product_id);
    return (
      <div key={m.id} className={cx('flex flex-wrap items-center gap-2.5 border-t border-muted py-1.5 pr-2 pl-2.5 first:border-t-0', sel.has(m.id) && 'bg-primary-soft/50')}>
        <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} aria-label={`${p?.name ?? ''}: tanlash`} className="h-4 w-4 accent-[var(--color-primary)]" />
        <ProductThumb id={m.product_id} path={p?.image_path} size={34} />
        <span className="flex-[1_1_140px] text-sm">{p?.name ?? '—'}{p?.brand_id && <span className="text-xs text-sub"> · {bm.get(p.brand_id)?.name}</span>}</span>
        <span className="inline-flex items-center overflow-hidden rounded-lg border border-line" title="Odatiy miqdor (shifokor tanlaganda qo‘yiladi)">
          <button type="button" onClick={() => setQty.mutate({ id: m.id, qty: Math.max(m.qty % 1 ? m.qty / 2 : 1, m.qty - 1) })} aria-label="Kamaytirish" className="h-8 w-8 bg-surface">−</button>
          <span className="min-w-[72px] text-center text-sm font-semibold tabular-nums">{fq(m.qty)} {p?.unit}</span>
          <button type="button" onClick={() => setQty.mutate({ id: m.id, qty: m.qty + 1 })} aria-label="Ko‘paytirish" className="h-8 w-8 bg-surface">+</button>
        </span>
        <button type="button" onClick={() => delMat.mutate(m.id)} aria-label="Materialni o‘chirish" title="O‘chirish" className="grid h-8 w-8 place-items-center rounded-md text-[#b91c1c]"><Trash2 size={15} /></button>
      </div>
    );
  };
  const free = mats.filter((m) => !m.group_id || !grs.some((g) => g.id === m.group_id));

  return (
    <div className="flex flex-col gap-3">
      {grs.map((g, i) => {
        const list = mats.filter((m) => m.group_id === g.id);
        return (
          <div key={g.id} className="overflow-hidden rounded-[10px] border border-line">
            <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1.5">
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">{i + 1}</span>
              {ren?.id === g.id ? (
                <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); if (ren.name.trim()) renGroup.mutate({ id: g.id, name: ren.name.trim() }); }}>
                  <input autoFocus aria-label="Guruh nomi" value={ren.name} onChange={(e) => setRen({ id: g.id, name: e.target.value })} onBlur={() => ren.name.trim() && ren.name.trim() !== g.name ? renGroup.mutate({ id: g.id, name: ren.name.trim() }) : setRen(null)}
                    className="h-8 flex-1 rounded-md border border-primary px-2 text-sm" />
                </form>
              ) : <span className="flex-1 text-sm font-semibold">{g.name} <span className="font-normal text-sub">· {list.length}</span></span>}
              <button type="button" onClick={() => setRen({ id: g.id, name: g.name })} aria-label={`${g.name}: nomini o‘zgartirish`} title="Nomini o‘zgartirish" className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-white"><Pencil size={14} /></button>
              <button type="button" disabled={i === 0} onClick={() => moveGroup.mutate({ i, dir: -1 })} aria-label={`${g.name}: yuqoriga`} title="Oldinroq ko‘rsatish" className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-white disabled:opacity-30"><ArrowUp size={14} /></button>
              <button type="button" disabled={i === grs.length - 1} onClick={() => moveGroup.mutate({ i, dir: 1 })} aria-label={`${g.name}: pastga`} title="Keyinroq ko‘rsatish" className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-white disabled:opacity-30"><ArrowDown size={14} /></button>
              <button type="button" onClick={() => { if (confirm(`«${g.name}» guruhi o‘chirilsinmi? Materiallari guruhsiz qoladi.`)) delGroup.mutate(g.id); }} aria-label={`${g.name}: guruhni o‘chirish`} title="Guruhni o‘chirish" className="grid h-7 w-7 place-items-center rounded text-sub hover:text-bad"><X size={15} /></button>
            </div>
            {list.length === 0 ? <div className="px-3 py-2 text-xs text-sub">Bo‘sh guruh — materiallarni belgilab shu guruhga o‘tkazing.</div> : list.map(row)}
          </div>
        );
      })}

      <div className="overflow-hidden rounded-[10px] border border-line">
        {grs.length > 0 && <div className="bg-surface px-3 py-1.5 text-sm font-semibold text-sub">Guruhsiz · {free.length}</div>}
        {mats.length === 0 && <div className="p-4 text-sm text-sub">Bu ishga hali material biriktirilmagan.</div>}
        {free.map(row)}
      </div>

      {sel.size > 0 && (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-white p-2.5 shadow-pop">
          <span className="text-sm font-semibold">{sel.size} ta tanlandi</span>
          <form className="flex flex-1 gap-1.5" onSubmit={(e) => { e.preventDefault(); if (newGroup.trim()) makeGroup.mutate(newGroup.trim()); }}>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Yangi guruh nomi, masalan: Anesteziya" aria-label="Yangi guruh nomi" className="h-9 min-w-[160px] flex-1 rounded-md border border-line px-2.5 text-sm" />
            <button type="submit" disabled={!newGroup.trim() || makeGroup.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white disabled:opacity-50"><FolderPlus size={15} /> Guruhga ajratish</button>
          </form>
          {grs.length > 0 && (
            <select value="" aria-label="Mavjud guruhga o‘tkazish" onChange={(e) => e.target.value && toGroup.mutate({ ids: [...sel], group: e.target.value === '-' ? null : e.target.value })} className="h-9 rounded-md border border-line bg-white px-2 text-sm">
              <option value="">Guruhga o‘tkazish…</option>
              {grs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="-">— Guruhdan chiqarish</option>
            </select>
          )}
          <button type="button" onClick={() => setSel(new Set())} className="h-9 px-2 text-sm text-sub">Bekor</button>
        </div>
      )}

      {picker ? (
        <div className="flex flex-col overflow-hidden rounded-[10px] border border-primary">
          <div className="flex items-center gap-2 border-b border-line p-2">
            <Search size={16} className="ml-1 text-sub" />
            <input ref={searchRef} autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Material nomi, brendi yoki artikulini yozing…" aria-label="Material qidirish"
              className="h-9 flex-1 text-sm outline-none" />
            <button type="button" onClick={() => { setPicker(false); setQ(''); }} aria-label="Yopish" className="grid h-8 w-8 place-items-center rounded text-sub hover:bg-muted"><X size={16} /></button>
          </div>
          <ul className="m-0 max-h-[320px] list-none overflow-y-auto p-1">
            {found.length === 0 && <li className="p-3 text-sm text-sub">{q ? 'Topilmadi. Yangi tovar Ombor → Sozlamalar → Tovarlar bo‘limida qo‘shiladi.' : 'Ombordagi barcha tovarlar qo‘shilgan.'}</li>}
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { addMat.mutate(p.id); searchRef.current?.focus(); }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-primary-soft">
                  <ProductThumb id={p.id} path={p.image_path} size={32} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm">{p.name}</span><span className="block text-xs text-sub">{[bm.get(p.brand_id ?? '')?.name, p.sku, p.unit].filter(Boolean).join(' · ')}</span></span>
                  <Plus size={16} className="text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPicker(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white"><Plus size={15} /> Material qo‘shish</button>
          {others.length > 0 && (
            <span className="ml-auto flex items-center gap-1.5">
              <Copy size={14} className="text-sub" />
              <select value={copyFrom} onChange={(e) => { setCopyFrom(e.target.value); setPick(new Set()); }} aria-label="Qaysi ishdan nusxa olish" className="h-9 max-w-[240px] rounded-md border border-line bg-white px-2 text-sm">
                <option value="">Boshqa ishdan guruh nusxalash…</option>
                {others.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </span>
          )}
        </div>
      )}
      {copyFrom && !picker && (
        <div className="flex flex-col overflow-hidden rounded-[10px] border border-primary">
          <div className="flex items-center gap-2 border-b border-line bg-[#f2fbff] px-3 py-2">
            <Copy size={15} className="text-primary" />
            <span className="flex-1 text-sm font-semibold">«{allWorks.find((w) => w.id === copyFrom)?.name}» — qaysi guruhlar nusxalansin?</span>
            <button type="button" onClick={() => setPick(pick.size === srcGroups.length ? new Set() : new Set(srcGroups.map((g) => g.id)))} className="text-xs text-primary-hover">{pick.size === srcGroups.length ? 'Hech qaysi' : 'Hammasi'}</button>
            <button type="button" onClick={() => { setCopyFrom(''); setPick(new Set()); }} aria-label="Yopish" className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-white"><X size={15} /></button>
          </div>
          <ul className="m-0 max-h-[320px] list-none overflow-y-auto p-0">
            {srcGroups.map((g) => {
              const on = pick.has(g.id), fresh = g.cards.filter((c) => !mats.some((m) => m.product_id === c.product_id)).length;
              return (
                <li key={g.id} className="border-t border-muted first:border-t-0">
                  <label className={cx('flex cursor-pointer items-start gap-2.5 px-3 py-2', on && 'bg-primary-soft/50')}>
                    <input type="checkbox" checked={on} onChange={() => { const s2 = new Set(pick); if (on) s2.delete(g.id); else s2.add(g.id); setPick(s2); }} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{g.name} <span className="font-normal text-sub">· {g.cards.length} ta{fresh < g.cards.length ? `, ${g.cards.length - fresh} tasi bu ishda bor` : ''}</span></span>
                      <span className="block truncate text-xs text-sub">{g.cards.map((c) => pm.get(c.product_id)?.name).filter(Boolean).join(', ')}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-end gap-2 border-t border-line p-2">
            <button type="button" onClick={() => { setCopyFrom(''); setPick(new Set()); }} className="h-9 px-3 text-sm text-sub">Bekor</button>
            <button type="button" disabled={!pick.size || copy.isPending} onClick={() => copy.mutate(undefined)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white disabled:opacity-50"><Copy size={14} /> {pick.size ? `${pick.size} ta guruhni nusxalash` : 'Guruhni tanlang'}</button>
          </div>
        </div>
      )}
      <p className="m-0 text-xs text-sub">Materiallarni belgilab guruhlarga ajrating (masalan «Anesteziya», «Izolyatsiya»). Shifokor «Material xarajat»da guruhlarni shu tartibda birin-ketin ko‘radi va keraklisini tanlaydi. Miqdor — odatiy qiymat, shifokor o‘zgartira oladi.</p>
    </div>
  );
}
