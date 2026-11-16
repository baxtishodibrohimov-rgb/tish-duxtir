// Kichik router: 7 ta sahifa uchun alohida kutubxona shart emas.
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.scrollTo(0, 0);
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useLocation() {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  const search = useSyncExternalStore(subscribe, () => location.search);
  return { path, search: new URLSearchParams(search) };
}

/** '/patients/:id' -> { id } yoki null */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.startsWith(':')) out[a[i]!.slice(1)] = decodeURIComponent(b[i]!);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}

/** URL'dagi ?tab= kabi parametrni holat sifatida ishlatish. */
export function useQueryParam<T extends string>(key: string, def: T): [T, (v: T) => void] {
  const { search } = useLocation();
  const v = (search.get(key) as T) ?? def;
  const set = (nv: T) => {
    const p = new URLSearchParams(location.search);
    if (nv === def) p.delete(key); else p.set(key, nv);
    const s = p.toString();
    navigate(location.pathname + (s ? `?${s}` : ''), true);
  };
  return [v, set];
}

export function Link({ to, onClick, ...p }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a href={to} {...p} onClick={(e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(to);
    }} />
  );
}

export function useTitle(t: string) {
  useEffect(() => { document.title = `${t} · Tish Duxtir`; }, [t]);
}
