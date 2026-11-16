import { useOrg } from '@/lib/auth';
import { useList, byId } from '@/lib/hooks';
import { qty as fq } from '@/lib/format';
import type { Brand, Counterparty, Product, ProductCategory, ProductWhSetting, StockBalance, StockDocType, Warehouse } from '@/lib/types';

export const DOC_TYPE: Record<StockDocType, { label: string; list: string; create: string; party: string }> = {
  receipt: { label: 'Kirim', list: 'Kirim nakladnoylari', create: 'Kirim qo‘shish', party: 'Kontragent' },
  writeoff: { label: 'Hisobdan chiqarish', list: 'Hisobdan chiqarish nakladnoylari', create: 'Hisobdan chiqarish', party: 'Sabab' },
  transfer: { label: 'Ko‘chirish', list: 'Ko‘chirish nakladnoylari', create: 'Ko‘chirish qo‘shish', party: 'Qabul ombori' },
  return: { label: 'Qaytarish', list: 'Yetkazib beruvchiga qaytarish', create: 'Qaytarish qo‘shish', party: 'Kontragent' },
};

export const WRITEOFF_REASON: Record<string, string> = {
  usage: 'Ishlatildi', act: 'Akt bo‘yicha (avtomatik)', broken: 'Buzildi / yaroqsiz', expired: 'Muddati o‘tdi', lost: 'Yo‘qoldi', other: 'Boshqa',
};

/** 15 gr  ·  (3,75 shprits) */
export function fmtQty(p: Pick<Product, 'unit' | 'pack_unit' | 'pack_qty'> | undefined, q: number) {
  if (!p) return fq(q);
  const base = `${fq(q)} ${p.unit}`;
  if (p.pack_unit && p.pack_qty > 1) return `${base} (${fq(q / p.pack_qty)} ${p.pack_unit})`;
  return base;
}

/** Ombor sahifalari uchun umumiy ma'lumotlar. */
export function useWh() {
  const { branches, can } = useOrg();
  const warehouses = useList<Warehouse>('warehouses', { archived: false });
  const products = useList<Product>('products');
  const cats = useList<ProductCategory>('product_categories');
  const brands = useList<Brand>('brands');
  const balances = useList<StockBalance>('stock_balances');
  const settings = useList<ProductWhSetting>('product_wh_settings');
  const suppliers = useList<Counterparty>('counterparties', { type: 'supplier' });
  const bmap = byId(branches);
  const whLabel = (w: Warehouse | undefined) => (w ? (branches.length > 1 ? `${w.name} · ${bmap.get(w.branch_id)?.name ?? ''}` : w.name) : '—');
  const bal = new Map<string, number>();
  for (const b of balances.data ?? []) bal.set(`${b.product_id}|${b.warehouse_id}`, b.qty);
  const set = new Map<string, ProductWhSetting>();
  for (const s of settings.data ?? []) set.set(`${s.product_id}|${s.warehouse_id}`, s);
  return {
    loading: warehouses.isLoading || products.isLoading,
    warehouses: warehouses.data ?? [], products: products.data ?? [], cats: cats.data ?? [], brands: brands.data ?? [],
    suppliers: suppliers.data ?? [], balances: balances.data ?? [],
    whMap: byId(warehouses.data), prodMap: byId(products.data), brandMap: byId(brands.data), catMap: byId(cats.data), supMap: byId(suppliers.data),
    qtyOf: (p: string, w: string) => bal.get(`${p}|${w}`) ?? 0,
    settingOf: (p: string, w: string) => set.get(`${p}|${w}`),
    whLabel,
    canEdit: (w: Warehouse | undefined) => !!w && can('warehouse.edit', w.branch_id),
  };
}
export type WhCtx = ReturnType<typeof useWh>;
