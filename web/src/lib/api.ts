// Backend bilan aloqa. Sessiya httpOnly cookie'da saqlanadi.
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'tishduxtir' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Server bilan aloqa yo‘q');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Xato (${res.status})`);
  return data as T;
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = { ok: true }>(url: string) => request<T>('DELETE', url),
};

type Filters = Record<string, string | number | boolean | null | undefined | string[]>;

/** Filtr kalitlari: { patient_id: x } -> f.patient_id=x; { 'starts_at.gte': d } -> f.starts_at.gte=d */
function qs(filters: Filters = {}, extra: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined) continue;
    p.set(`f.${k}`, v === null ? 'null' : Array.isArray(v) ? v.join(',') : String(v));
  }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Umumiy CRUD (server/src/crud.ts dagi ro'yxat). */
export const db = {
  list: <T>(res: string, filters?: Filters, opt: { q?: string; order?: string; limit?: number; offset?: number } = {}) =>
    http.get<T[]>(`/api/r/${res}${qs(filters, opt)}`),
  insert: <T>(res: string, row: Record<string, unknown>) => http.post<T>(`/api/r/${res}`, row),
  insertMany: <T>(res: string, rows: Record<string, unknown>[]) => http.post<T[]>(`/api/r/${res}`, rows),
  update: <T>(res: string, id: string, patch: Record<string, unknown>) => http.patch<T>(`/api/r/${res}/${id}`, patch),
  remove: (res: string, id: string, extra = '') => http.del(`/api/r/${res}/${id}${extra}`),
};
