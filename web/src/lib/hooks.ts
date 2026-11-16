import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from './api';

type Filters = Parameters<typeof db.list>[1];
type Opts = Parameters<typeof db.list>[2];

/** Jadval ro'yxati. Kalit: [resurs, filtrlar, opsiyalar] — resurs nomi bo'yicha invalidatsiya qilinadi. */
export function useList<T>(res: string, filters?: Filters, opt?: Opts & { enabled?: boolean }) {
  const { enabled = true, ...o } = opt ?? {};
  return useQuery({
    queryKey: [res, filters ?? {}, o],
    queryFn: () => db.list<T>(res, filters, o),
    enabled,
  });
}

/** Amal + xabar + kerakli ro'yxatlarni yangilash. */
export function useAction<A, R = unknown>(fn: (a: A) => Promise<R>, opt: { invalidate?: (string | QueryKey)[]; success?: string; onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const k of opt.invalidate ?? []) void qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
      if (opt.success) toast.success(opt.success);
      opt.onDone?.(r);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function byId<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  return new Map((rows ?? []).map((r) => [r.id, r]));
}
