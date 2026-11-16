import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderPlus, Pencil, Plus, Trash2, Archive, Download } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { initials, qty as fq } from '@/lib/format';
import type { Brand, CalcCard, Counterparty, PriceItem, Product, ProductCategory, ProductWhSetting, Warehouse } from '@/lib/types';
import { CounterpartyForm } from '@/components/CounterpartyForm';
import { Button, Card, Confirm, Empty, Field, Input, Modal, Select, Switch, Textarea, UnderTabs, cx } from '@/components/ui';
import type { WhCtx } from './common';
import { downloadCsv } from './Docs';

type S = 'wh' | 'brands' | 'products' | 'suppliers' | 'writeoff';
const TABS: { key: S; label: string }[] = [
  { key: 'wh', label: 'Omborlar' }, { key: 'brands', label: 'Brendlar' }, { key: 'products', label: 'Tovarlar' },
  { key: 'suppliers', label: 'Kontragentlar' }, { key: 'writeoff', label: 'Material chiqarish' },
];

export function WhSettings({ wh }: { wh: WhCtx }) {
  const [s, setS] = useState<S>('wh');
  return (
    <div className="flex flex-col gap-4">
      <UnderTabs tabs={TABS} value={s} onChange={setS} />
      {s === 'wh' && <Warehouses wh={wh} />}
      {s === 'brands' && <Brands />}
      {s === 'products' && <Products wh={wh} />}
      {s === 'suppliers' && <Suppliers />}
      {s === 'writeoff' && <WriteoffSettings wh={wh} />}
    </div>
  );
}

// ---------------- Omborlar ----------------
function Warehouses({ wh }: { wh: WhCtx }) {
  const { branches, members, memberName, branch } = useOrg();
  const [arch, setArch] = useState(false);
  const all = useList<Warehouse>('warehouses', arch ? {} : { archived: false });
  const [open, setOpen] = useState<Warehouse | 'new' | null>(null);
  const bmap = byId(branches);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-lg font-semibold">Omborlar</h2>
        <Button variant="primary" size="sm" onClick={() => setOpen('new')}><Plus size={15} /> Ombor qo‘shish</Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxivdagilarni ko‘rsatish</label>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-xs font-semibold text-sub"><tr><th className="px-3 py-2">Nomi</th><th className="px-3 py-2">Filial</th><th className="px-3 py-2">Javobgar</th><th className="px-3 py-2">Izoh</th><th /></tr></thead>
          <tbody>
            {(all.data ?? []).map((w) => (
              <tr key={w.id} className={cx('border-t border-line', w.archived && 'opacity-50')}>
                <td className="px-3 py-2 font-medium">{w.name} {w.is_main && <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-normal text-[#006b93]">asosiy</span>}</td>
                <td className="px-3 py-2">{bmap.get(w.branch_id)?.name}</td>
                <td className="px-3 py-2">{memberName(w.responsible_id)}</td>
                <td className="px-3 py-2 text-sub">{w.note}</td>
                <td className="w-10 px-2"><button type="button" aria-label="Tahrirlash" onClick={() => setOpen(w)} className="text-sub hover:text-fg"><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="m-0 text-xs text-sub">Harakati bor ombor o‘chirilmaydi — arxivga o‘tkaziladi. Har bir filialda bitta asosiy ombor bo‘ladi: akt yopilganda materiallar shu ombordan chiqadi.</p>
      {open && <WarehouseModal w={open === 'new' ? undefined : open} defBranch={branch.id} branches={branches} members={members} onClose={() => setOpen(null)} wh={wh} />}
    </div>
  );
}

function WarehouseModal({ w, defBranch, branches, members, onClose }: { w?: Warehouse; defBranch: string; branches: { id: string; name: string }[]; members: { user_id: string; full_name: string; is_active: boolean }[]; onClose: () => void; wh: WhCtx }) {
  const [f, setF] = useState({ name: w?.name ?? '', branch_id: w?.branch_id ?? defBranch, responsible_id: w?.responsible_id ?? '', is_main: w?.is_main ?? false, note: w?.note ?? '', archived: w?.archived ?? false });
  const save = useAction(async () => {
    if (!f.name.trim()) throw new Error('Nomini kiriting');
    if (f.is_main && !w?.is_main) {
      // Shu filialdagi oldingi asosiy omborni oddiyga aylantiramiz (bittadan ortiq bo'lishi mumkin emas)
      const cur = await db.list<Warehouse>('warehouses', { branch_id: f.branch_id, is_main: true });
      for (const c of cur) if (c.id !== w?.id) await db.update('warehouses', c.id, { is_main: false });
    }
    const row = { ...f, responsible_id: f.responsible_id || null };
    return w ? db.update('warehouses', w.id, row) : db.insert('warehouses', row);
  }, { invalidate: ['warehouses'], success: 'Saqlandi', onDone: onClose });
  return (
    <Modal open onClose={onClose} title={w ? 'Omborni tahrirlash' : 'Ombor qo‘shish'} width={520}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Nomi *">{(id) => <Input id={id} value={f.name} placeholder="Masalan: 1-kabinet" onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Filial">{(id) => <Select id={id} value={f.branch_id} disabled={!!w} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>
          <Field label="Javobgar">{(id) => <Select id={id} value={f.responsible_id} onChange={(e) => setF({ ...f, responsible_id: e.target.value })}><option value="">—</option>{members.filter((m) => m.is_active).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</Select>}</Field>
        </div>
        <Switch checked={f.is_main} onChange={(v) => setF({ ...f, is_main: v })} label="Asosiy ombor" />
        <Field label="Izoh">{(id) => <Textarea id={id} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
        {w && <Switch checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="Arxiv" />}
      </div>
    </Modal>
  );
}

// ---------------- Brendlar ----------------
function Brands() {
  const [arch, setArch] = useState(false);
  const brands = useList<Brand>('brands', arch ? {} : { archived: false });
  const [open, setOpen] = useState<Brand | 'new' | null>(null);
  const [f, setF] = useState({ name: '', logo_url: '', archived: false });
  const save = useAction(() => {
    if (!f.name.trim()) throw new Error('Nomini kiriting');
    const row = { ...f, logo_url: f.logo_url || null };
    return open === 'new' ? db.insert('brands', row) : db.update('brands', (open as Brand).id, row);
  }, { invalidate: ['brands'], success: 'Saqlandi', onDone: () => setOpen(null) });
  const edit = (b: Brand | 'new') => { setF(b === 'new' ? { name: '', logo_url: '', archived: false } : { name: b.name, logo_url: b.logo_url ?? '', archived: b.archived }); setOpen(b); };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-lg font-semibold">Brendlar</h2>
        <Button variant="primary" size="sm" onClick={() => edit('new')}><Plus size={15} /> Brend qo‘shish</Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxivdagilarni ko‘rsatish</label>
      </div>
      <Card>
        {brands.data?.length === 0 && <Empty>Brendlar yo‘q</Empty>}
        {(brands.data ?? []).map((b) => (
          <div key={b.id} className={cx('flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0', b.archived && 'opacity-50')}>
            {b.logo_url ? <img src={b.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain" /> : <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-xs font-semibold text-sub">{initials(b.name)}</span>}
            <span className="flex-1 font-medium">{b.name}</span>
            <button type="button" aria-label="Tahrirlash" onClick={() => edit(b)} className="text-sub hover:text-fg"><Pencil size={15} /></button>
          </div>
        ))}
      </Card>
      {open && (
        <Modal open onClose={() => setOpen(null)} title={open === 'new' ? 'Brend qo‘shish' : 'Brend'} width={440}
          footer={<><Button onClick={() => setOpen(null)}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
          <div className="flex flex-col gap-3">
            <Field label="Nomi *">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
            <Field label="Logo havolasi (ixtiyoriy)">{(id) => <Input id={id} value={f.logo_url} placeholder="https://…" onChange={(e) => setF({ ...f, logo_url: e.target.value })} />}</Field>
            {open !== 'new' && <Switch checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="Arxiv" />}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Tovarlar ----------------
function Products({ wh }: { wh: WhCtx }) {
  const cats = wh.cats;
  const [sel, setSel] = useState<string | null>(null);
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const [tq, setTq] = useState('');
  const [folder, setFolder] = useState<{ parent: string | null; edit?: ProductCategory } | null>(null);
  const [delCat, setDelCat] = useState<ProductCategory | null>(null);
  const [prod, setProd] = useState<Product | 'new' | null>(null);
  const [arch, setArch] = useState(false);
  const [f, setF] = useState({ name: '', brand: '', sku: '', barcode: '', unit: '' });
  const removeCat = useAction((c: ProductCategory) => db.remove('product_categories', c.id), { invalidate: ['product_categories', 'products'], success: 'Toifa o‘chirildi', onDone: () => { setDelCat(null); setSel(null); } });

  const children = (pid: string | null) => cats.filter((c) => c.parent_id === pid).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const descendants = (id: string): string[] => [id, ...children(id).flatMap((c) => descendants(c.id))];
  const inSel = useMemo(() => (sel ? new Set(descendants(sel)) : null), [sel, cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const matchTree = (c: ProductCategory): boolean => !tq || c.name.toLowerCase().includes(tq.toLowerCase()) || children(c.id).some(matchTree);
  const has = (v: string | null | undefined, n: string) => !n || (v ?? '').toLowerCase().includes(n.toLowerCase());
  const rows = wh.products.filter((p) => (arch || !p.archived) && (!inSel || (p.category_id && inSel.has(p.category_id)))
    && has(p.name, f.name) && has(wh.brandMap.get(p.brand_id ?? '')?.name, f.brand) && has(p.sku, f.sku) && has(p.barcode, f.barcode) && has(p.unit, f.unit));

  const path = (id: string | null): string => { if (!id) return ''; const c = wh.catMap.get(id); return c ? (c.parent_id ? `${path(c.parent_id)} / ` : '') + c.name : ''; };

  const Node = ({ c }: { c: ProductCategory }) => {
    const kids = children(c.id).filter(matchTree);
    const isOpen = openSet.has(c.id) || !!tq;
    return (
      <div className="tree-node">
        <div className={cx('group flex items-center gap-1 rounded-md pr-1', sel === c.id && 'bg-primary-soft')}>
          <button type="button" aria-label="Ochish yoki yopish" onClick={() => { const n = new Set(openSet); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setOpenSet(n); }}
            className={cx('grid h-6 w-5 place-items-center text-sub', !kids.length && 'invisible')}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          <button type="button" onClick={() => setSel(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm"><Folder size={14} className="flex-none text-primary" /><span className="truncate">{c.name}</span></button>
          <span className="hidden gap-0.5 group-hover:flex">
            <button type="button" aria-label="Papka nomini tahrirlash" title="Nomini tahrirlash" onClick={() => setFolder({ parent: c.parent_id, edit: c })} className="text-sub hover:text-fg"><Pencil size={13} /></button>
            <button type="button" aria-label="Ichki papka qo‘shish" title="Ichki papka qo‘shish" onClick={() => setFolder({ parent: c.id })} className="text-sub hover:text-fg"><FolderPlus size={13} /></button>
            <button type="button" aria-label="Toifani o‘chirish" title="O‘chirish" onClick={() => setDelCat(c)} className="text-sub hover:text-bad"><Trash2 size={13} /></button>
          </span>
        </div>
        {isOpen && kids.length > 0 && <div className="tree-children">{kids.map((k) => <Node key={k.id} c={k} />)}</div>}
      </div>
    );
  };

  const fi = 'h-7 w-full min-w-[70px] rounded-md border border-line bg-white px-1.5 text-xs font-normal';
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="flex flex-col gap-2 self-start p-3">
        <div className="flex items-center justify-between"><h2 className="m-0 text-base font-semibold">Tovarlar</h2>
          <button type="button" aria-label="Papka qo‘shish" title="Papka qo‘shish" onClick={() => setFolder({ parent: null })} className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-muted"><FolderPlus size={16} /></button></div>
        <Input type="search" aria-label="Toifani qidirish" placeholder="Toifani qidirish" value={tq} onChange={(e) => setTq(e.target.value)} className="h-8" />
        <button type="button" onClick={() => setSel(null)} className={cx('rounded-md px-2 py-1 text-left text-sm font-medium', !sel && 'bg-primary-soft')}>Barcha tovarlar</button>
        <div>{children(null).filter(matchTree).map((c) => <Node key={c.id} c={c} />)}</div>
        {cats.length === 0 && <p className="m-0 text-xs text-sub">Toifalar yo‘q. Masalan: «Plomba materiallari», «Endodontiya», «Bir martalik».</p>}
      </Card>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm text-sub"><button type="button" className="text-primary" onClick={() => setSel(null)}>Toifalar</button>{sel && ` / ${path(sel)}`}</div>
          <label className="ml-auto flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxiv</label>
          <button type="button" aria-label="Excel’ga yuklab olish" title="Excel’ga yuklab olish" onClick={() => downloadCsv('Tovarlar.csv', [['Nomi', 'Brend', 'Artikul', 'Shtrix-kod', 'Birlik', 'Qadoq', 'Toifa'], ...rows.map((p) => [p.name, wh.brandMap.get(p.brand_id ?? '')?.name ?? '', p.sku ?? '', p.barcode ?? '', p.unit, p.pack_unit ? `${p.pack_qty} ${p.unit} / ${p.pack_unit}` : '', path(p.category_id)])])}
            className="grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Download size={16} /></button>
          <Button variant="primary" size="sm" onClick={() => setProd('new')}><Plus size={15} /> Tovar qo‘shish</Button>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-left text-xs font-semibold text-sub">
              <tr>{['Nomi', 'Brend', 'Artikul', 'Shtrix-kod', 'Birlik', 'Qadoq', 'Toifa', ''].map((h, i) => <th key={i} className="px-2 pt-2 pb-1 whitespace-nowrap">{h}</th>)}</tr>
              <tr>
                {(['name', 'brand', 'sku', 'barcode', 'unit'] as const).map((k) => <th key={k} className="px-2 pb-2"><input type="search" aria-label="Filtr" className={fi} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></th>)}
                <th /><th /><th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sub">Bu toifada tovar yo‘q.</td></tr>}
              {rows.map((p) => (
                <tr key={p.id} className={cx('border-t border-line hover:bg-surface', p.archived && 'opacity-50')}>
                  <td className="px-2 py-2 font-medium">{p.name}</td>
                  <td className="px-2 py-2">{wh.brandMap.get(p.brand_id ?? '')?.name}</td>
                  <td className="px-2 py-2 text-sub">{p.sku}</td>
                  <td className="px-2 py-2 text-sub">{p.barcode}</td>
                  <td className="px-2 py-2">{p.unit}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{p.pack_unit ? `${fq(p.pack_qty)} ${p.unit} / ${p.pack_unit}` : '—'}</td>
                  <td className="px-2 py-2 text-sub">{wh.catMap.get(p.category_id ?? '')?.name}</td>
                  <td className="px-2 py-2"><span className="flex gap-1">
                    <button type="button" aria-label="Tahrirlash" onClick={() => setProd(p)} className="text-sub hover:text-fg"><Pencil size={14} /></button>
                    {!p.archived && <ArchiveBtn id={p.id} />}
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {folder && <FolderModal parent={folder.parent} edit={folder.edit} onClose={() => setFolder(null)} onSaved={(id) => { if (folder.parent) setOpenSet(new Set([...openSet, folder.parent])); setSel(id); }} />}
      {prod && <ProductModal wh={wh} p={prod === 'new' ? undefined : prod} defCat={sel} onClose={() => setProd(null)} />}
      <Confirm open={!!delCat} danger yes="O‘chirish" onNo={() => setDelCat(null)} onYes={() => delCat && removeCat.mutate(delCat)} loading={removeCat.isPending}
        text={`«${delCat?.name}» toifasi va uning ichki papkalari o‘chiriladi. Tovarlar o‘chmaydi — toifasiz qoladi.`} />
    </div>
  );
}

function ArchiveBtn({ id }: { id: string }) {
  const a = useAction(() => db.update('products', id, { archived: true }), { invalidate: ['products'], success: 'Arxivga o‘tkazildi' });
  return <button type="button" aria-label="Arxivga o‘tkazish" title="Harakati bor tovar o‘chirilmaydi, arxivga o‘tadi" onClick={() => a.mutate(undefined)} className="text-sub hover:text-fg"><Archive size={14} /></button>;
}

function FolderModal({ parent, edit, onClose, onSaved }: { parent: string | null; edit?: ProductCategory; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const save = useAction(() => {
    if (!name.trim()) throw new Error('Papka nomini yozing');
    return edit ? db.update<ProductCategory>('product_categories', edit.id, { name: name.trim() }) : db.insert<ProductCategory>('product_categories', { name: name.trim(), parent_id: parent });
  }, { invalidate: ['product_categories'], onDone: (c) => { onSaved(c.id); onClose(); } });
  return (
    <Modal open onClose={onClose} title={edit ? 'Papka nomini o‘zgartirish' : 'Yangi papka'} width={400}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <Field label="Papka nomi *">{(id) => <Input id={id} value={name} placeholder="Masalan: 5-tortma" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save.mutate(undefined)} />}</Field>
    </Modal>
  );
}

const UNITS = ['dona', 'gr', 'ml', 'sm', 'm', 'juft', 'to‘plam'];
const PACKS = ['', 'quti', 'shprits', 'tyubik', 'flakon', 'paket', 'kapsula', 'rulon'];

function ProductModal({ wh, p, defCat, onClose }: { wh: WhCtx; p?: Product; defCat: string | null; onClose: () => void }) {
  const [f, setF] = useState({
    category_id: p?.category_id ?? defCat ?? '', name: p?.name ?? '', brand_id: p?.brand_id ?? '', sku: p?.sku ?? '', barcode: p?.barcode ?? '',
    unit: p?.unit ?? 'dona', pack_unit: p?.pack_unit ?? '', pack_qty: p?.pack_qty ?? 1, note: p?.note ?? '', archived: p?.archived ?? false,
  });
  const [lim, setLim] = useState<Record<string, ProductWhSetting>>(() => {
    const o: Record<string, ProductWhSetting> = {};
    for (const w of wh.warehouses) {
      const s = p ? wh.settingOf(p.id, w.id) : undefined;
      o[w.id] = s ?? { product_id: p?.id ?? '', warehouse_id: w.id, org_id: '', visible: true, min_qty: 0, order_qty: 0, location: '' };
    }
    return o;
  });
  const save = useAction(async () => {
    if (!f.name.trim()) throw new Error('Tovar nomini kiriting');
    const row = { ...f, category_id: f.category_id || null, brand_id: f.brand_id || null, pack_unit: f.pack_unit || null, pack_qty: f.pack_unit ? Number(f.pack_qty) || 1 : 1 };
    const saved = p ? await db.update<Product>('products', p.id, row) : await db.insert<Product>('products', row);
    await db.insertMany('product_wh_settings', Object.values(lim).map((s) => ({ product_id: saved.id, warehouse_id: s.warehouse_id, visible: s.visible, min_qty: Number(s.min_qty) || 0, order_qty: Number(s.order_qty) || 0, location: s.location || null })));
    return saved;
  }, { invalidate: ['products', 'product_wh_settings', 'stock'], success: 'Saqlandi', onDone: onClose });
  const setL = (w: string, patch: Partial<ProductWhSetting>) => setLim({ ...lim, [w]: { ...lim[w]!, ...patch } });
  const catOpts = (pid: string | null, depth = 0): { id: string; label: string }[] =>
    wh.cats.filter((c) => c.parent_id === pid).flatMap((c) => [{ id: c.id, label: `${'— '.repeat(depth)}${c.name}` }, ...catOpts(c.id, depth + 1)]);

  return (
    <Modal open onClose={onClose} title={p ? 'Tovarni tahrirlash' : 'Tovar qo‘shish'} width={820}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Toifa">{(id) => <Select id={id} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{catOpts(null).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>}</Field>
          <Field label="Tovar nomi *">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Brend">{(id) => <Select id={id} value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })}><option value="">—</option>{wh.brands.filter((b) => !b.archived || b.id === f.brand_id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Artikul">{(id) => <Input id={id} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />}</Field>
            <Field label="Shtrix-kod">{(id) => <Input id={id} value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} />}</Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Birlik *" hint="Qoldiq shu birlikda">{(id) => <Select id={id} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{[...new Set([...UNITS, f.unit])].map((u) => <option key={u}>{u}</option>)}</Select>}</Field>
            <Field label="Qadoq">{(id) => <Select id={id} value={f.pack_unit} onChange={(e) => setF({ ...f, pack_unit: e.target.value })}>{[...new Set([...PACKS, f.pack_unit])].map((u) => <option key={u} value={u}>{u || 'Qadoqsiz'}</option>)}</Select>}</Field>
            <Field label={`Qadoqda (${f.unit})`}>{(id) => <Input id={id} type="number" min={0} step="any" value={f.pack_qty} disabled={!f.pack_unit} onChange={(e) => setF({ ...f, pack_qty: Number(e.target.value) })} />}</Field>
          </div>
          <Field label="Izoh">{(id) => <Textarea id={id} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
          {p && <Switch checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="Arxiv" />}
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Omborlar bo‘yicha</div>
          <p className="m-0 text-xs text-sub">Kritik qoldiqqa tushganda tovar «Buyurtma» ro‘yxatiga chiqadi. Ko‘rinishni o‘chirsangiz, tovar o‘sha omborda ko‘rsatilmaydi.</p>
          {wh.warehouses.map((w) => (
            <div key={w.id} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{wh.whLabel(w)}</span>
                <Switch checked={lim[w.id]!.visible} onChange={(v) => setL(w.id, { visible: v })} label="Ko‘rsatish" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-0.5 text-xs text-sub">Kritik qoldiq<input type="number" min={0} value={lim[w.id]!.min_qty} onChange={(e) => setL(w.id, { min_qty: Number(e.target.value) })} className="h-8 rounded-lg border border-line px-2 text-sm text-fg" /></label>
                <label className="flex flex-col gap-0.5 text-xs text-sub">Buyurtma miqdori<input type="number" min={0} value={lim[w.id]!.order_qty} onChange={(e) => setL(w.id, { order_qty: Number(e.target.value) })} className="h-8 rounded-lg border border-line px-2 text-sm text-fg" /></label>
                <label className="flex flex-col gap-0.5 text-xs text-sub">Joyi<input value={lim[w.id]!.location ?? ''} placeholder="1-tortma" onChange={(e) => setL(w.id, { location: e.target.value })} className="h-8 rounded-lg border border-line px-2 text-sm text-fg" /></label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Kontragentlar (faqat yetkazib beruvchilar) ----------------
function Suppliers() {
  const [arch, setArch] = useState(false);
  const cps = useList<Counterparty>('counterparties', { type: 'supplier', archived: arch });
  const [open, setOpen] = useState<Counterparty | 'new' | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-lg font-semibold">Kontragentlar</h2>
        <Button variant="primary" size="sm" onClick={() => setOpen('new')}><Plus size={15} /> Kontragent qo‘shish</Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Arxivdagilarni ko‘rsatish</label>
      </div>
      <div className="rounded-xl bg-primary-soft/50 px-3 py-2 text-[13px] text-[#00506e]">Bu yerda faqat material sotuvchilar (yetkazib beruvchilar). Shifokor, assistent, laboratoriya kabi boshqa kontragentlar Kassa → Kontragentlar bo‘limida.</div>
      <Card className="overflow-x-auto">
        {cps.data?.length === 0 ? <Empty>Yetkazib beruvchilar yo‘q</Empty> : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted text-left text-xs font-semibold text-sub"><tr><th className="px-3 py-2">Nomi</th><th className="px-3 py-2">Mas’ul shaxs</th><th className="px-3 py-2">Telefon</th><th className="px-3 py-2">STIR</th><th /></tr></thead>
            <tbody>{(cps.data ?? []).map((c) => (
              <tr key={c.id} className="border-t border-line"><td className="px-3 py-2 font-medium">{c.name}</td><td className="px-3 py-2">{c.contact_person}</td><td className="px-3 py-2">{c.phone}</td><td className="px-3 py-2">{c.inn}</td>
                <td className="w-10 px-2"><button type="button" aria-label="Tahrirlash" onClick={() => setOpen(c)} className="text-sub hover:text-fg"><Pencil size={15} /></button></td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {open && <CounterpartyForm cp={open === 'new' ? undefined : open} fixedType="supplier" onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------------- Material chiqarish ----------------
function WriteoffSettings({ wh }: { wh: WhCtx }) {
  const { org, refresh, can } = useOrg();
  const cards = useList<CalcCard>('calc_cards');
  const items = useList<PriceItem>('price_items', { archived: false });
  const im = byId(items.data);
  const [f, setF] = useState({ price_item_id: '', product_id: '', qty: '' });
  const toggleNeg = useAction((v: boolean) => http.patch('/api/org', { allow_negative_stock: v }), { success: 'Saqlandi', onDone: () => { void refresh(); } });
  const add = useAction(() => {
    if (!f.price_item_id || !f.product_id || !(Number(f.qty) > 0)) throw new Error('Xizmat, material va miqdorni kiriting');
    return db.insert('calc_cards', { ...f, qty: Number(f.qty) });
  }, { invalidate: ['calc_cards'], success: 'Qo‘shildi', onDone: () => setF({ ...f, product_id: '', qty: '' }) });
  const del = useAction((id: string) => db.remove('calc_cards', id), { invalidate: ['calc_cards'] });
  const grouped = useMemo(() => {
    const m = new Map<string, CalcCard[]>();
    for (const c of cards.data ?? []) m.set(c.price_item_id, [...(m.get(c.price_item_id) ?? []), c]);
    return [...m.entries()];
  }, [cards.data]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="m-0 text-base font-semibold">Material chiqarish usuli</h2>
        <div className="text-sm text-sub">Materiallar ikki yo‘l bilan chiqariladi: <b className="text-fg">qo‘lda</b> (hisobdan chiqarish nakladnoyi) va <b className="text-fg">avtomatik</b> — shifokor aktni yopganda, quyidagi kalkulyatsiya kartalari bo‘yicha.</div>
        <Switch checked={org.allow_negative_stock} onChange={(v) => can('settings.edit') && toggleNeg.mutate(v)}
          label="Qoldiq yetmasa ham chiqarishga ruxsat (manfiy qoldiq, ogohlantirish bilan)" />
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3 font-semibold">Kalkulyatsiya kartalari</div>
        <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface px-4 py-3">
          <Field label="Xizmat" className="min-w-[220px] flex-1">{(id) => <Select id={id} value={f.price_item_id} onChange={(e) => setF({ ...f, price_item_id: e.target.value })}><option value="">Tanlang</option>{(items.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>}</Field>
          <Field label="Material" className="min-w-[220px] flex-1">{(id) => <Select id={id} value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Tanlang</option>{wh.products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</Select>}</Field>
          <Field label="1 xizmatga" className="w-28">{(id) => <Input id={id} type="number" min={0} step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />}</Field>
          <Button variant="primary" onClick={() => add.mutate(undefined)}><Plus size={15} /> Karta qo‘shish</Button>
        </div>
        {grouped.length === 0 && <Empty>Kartalar yo‘q. Masalan: «Kompozit plomba» → Filtek Z250, 0,3 gr.</Empty>}
        {grouped.map(([pid, list]) => (
          <div key={pid} className="border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="text-sm font-medium">{im.get(pid)?.name ?? 'Xizmat o‘chirilgan'}</div>
            {list.map((c) => {
              const p = wh.prodMap.get(c.product_id);
              return (
                <div key={c.id} className="flex items-center gap-2 py-1 pl-4 text-sm text-sub">
                  <span className="flex-1">{p?.name}</span><span>{fq(c.qty)} {p?.unit}</span>
                  <button type="button" aria-label="O‘chirish" onClick={() => del.mutate(c.id)} className="text-faint hover:text-bad"><Trash2 size={14} /></button>
                </div>
              );
            })}
          </div>
        ))}
      </Card>
    </div>
  );
}
