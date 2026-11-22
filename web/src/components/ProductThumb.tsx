import { Package } from 'lucide-react';
import { cx } from '@/components/ui';

/** Tovar rasmi manzili (rasm almashsa, manzil ham o'zgaradi — kesh eskirmaydi). */
export function productImageUrl(id: string, path: string | null | undefined) {
  return path ? `/api/products/${id}/image?v=${encodeURIComponent(path.slice(-12))}` : null;
}

/** Tovar rasmi yoki rasm bo'lmasa quti belgisi. size=0 — o'lcham className bilan beriladi. */
export function ProductThumb({ id, path, size = 40, className }: { id: string; path?: string | null; size?: number; className?: string }) {
  const url = productImageUrl(id, path);
  return (
    <span className={cx('grid flex-none place-items-center overflow-hidden rounded-md bg-muted', className)} style={size ? { width: size, height: size } : undefined}>
      {url ? <img src={url} alt="" loading="lazy" className={cx('h-full w-full', size ? 'object-cover' : 'object-contain p-1')} />
        : <Package size={size ? Math.round(size * 0.55) : 56} strokeWidth={1.5} className="text-[#b6c0ca]" />}
    </span>
  );
}
