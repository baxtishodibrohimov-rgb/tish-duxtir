import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, Eye, Pencil, Plus, Trash2, Undo2, Minus, CheckCircle2, CircleDashed, Check } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { dmy, isoDate, money2 } from '@/lib/format';
import { navigate, useLocation } from '@/lib/router';
import type { Product, StockDoc, StockDocLine, StockDocType } from '@/lib/types';
import { toast } from 'sonner';
import { ProductSearch } from './ProductSearch';
import { ProductModal } from './WhSettings';
import { Badge, Button, Card, Confirm, Field, Input, PageLoader, Select, Textarea, UnderTabs, cx } from '@/components/ui';
import { DOC_TYPE, WRITEOFF_REASON, fmtQty, type WhCtx } from './common';

export function Docs({ wh }: { wh: WhCtx }) {
  const { search } = useLocation();
  const type = (search.get('type') as StockDocType) || 'receipt';
  const docId = search.get('doc');
  const go = (t: StockDocType, d?: string) => navigate(`/warehouse?tab=docs&type=${t}${d ? `&doc=${d}` : ''}`, !d);

  return (
    <div className="flex flex-col gap-3">
      <UnderTabs tabs={(Object.keys(DOC_TYPE) as StockDocType[]).map((k) => ({ key: k, label: DOC_TYPE[k].label }))} value={type} onChange={(t) => go(t)} />
      {docId ? <DocEditor key={docId} wh={wh} id={docId} onBack={() => go(type)} onOpen={(d) => go(d.type, d.id)} />
        : <DocList wh={wh} type={type} onOpen={(d) => go(d.type, d.id)} />}
    </div>
  );
}

function docSum(lines: StockDocLine[]) { return lines.reduce((a, l) => a + l.qty * l.price, 0); }

function DocList({ wh, type, onOpen }: { wh: WhCtx; type: StockDocType; onOpen: (d: StockDoc) => void }) {
  const { memberName, can } = useOrg();
  const docs = useList<StockDoc>('stock_docs', { type }, { limit: 2000 });
  const ids = (docs.data ?? []).map((d) => d.id);
  const lines = useList<StockDocLine>('stock_doc_lines', { 'doc_id.in': ids }, { enabled: ids.length > 0 && ids.length < 400 });
  const [f, setF] = useState({ no: '', st: '', party: '', wh: '', resp: '', min: '', max: '', note: '', date: '' });
  const [ask, setAsk] = useState(false);
  const [del, setDel] = useState<StockDoc | null>(null);
  const [page, setPage] = useState(0);
  const meta = DOC_TYPE[type];
  const myWhs = wh.warehouses.filter((w) => wh.canEdit(w));

  const create = useAction(() => {
    const w = myWhs.find((x) => x.is_main) ?? myWhs[0];
    if (!w) throw new Error('Nakladnoy yaratish uchun ruxsat yo‘q');
    const to = type === 'transfer' ? wh.warehouses.find((x) => x.id !== w.id) : undefined;
    return db.insert<StockDoc>('stock_docs', { type, warehouse_id: w.id, to_warehouse_id: to?.id ?? null, reason: type === 'writeoff' ? 'usage' : null });
  }, { invalidate: ['stock_docs'], onDone: (d) => { setAsk(false); onOpen(d); } });
  const copy = useAction((d: StockDoc) => http.post<StockDoc>(`/api/stock-docs/${d.id}/copy`), { invalidate: ['stock_docs'], success: 'Nusxa yaratildi', onDone: onOpen });
  const remove = useAction((d: StockDoc) => db.remove('stock_docs', d.id), { invalidate: ['stock_docs'], success: 'O‘chirildi', onDone: () => setDel(null) });

  const byDoc = useMemo(() => {
    const m = new Map<string, StockDocLine[]>();
    for (const l of lines.data ?? []) m.set(l.doc_id, [...(m.get(l.doc_id) ?? []), l]);
    return m;
  }, [lines.data]);
  const party = (d: StockDoc) => type === 'transfer' ? wh.whLabel(wh.whMap.get(d.to_warehouse_id ?? ''))
    : type === 'writeoff' ? WRITEOFF_REASON[d.reason ?? 'other'] ?? d.reason ?? '' : wh.supMap.get(d.counterparty_id ?? '')?.name ?? '';
  const has = (v: string, n: string) => !n || v.toLowerCase().includes(n.toLowerCase());
  // Faqat shu filial omborlariga tegishli nakladnoylar.
  const [mq, setMq] = useState(''); // telefondagi umumiy qidiruv
  const rows = (docs.data ?? []).filter((d) => wh.whMap.has(d.warehouse_id) || wh.whMap.has(d.to_warehouse_id ?? ''))
    .filter((d) => !mq || has(`${d.number} ${party(d)} ${d.note ?? ''}`, mq)).filter((d) => {
    const s = docSum(byDoc.get(d.id) ?? []);
    return has(d.number, f.no) && (!f.st || (f.st === 'draft' ? d.status === 'draft' : d.status !== 'draft'))
      && has(party(d), f.party) && has(wh.whLabel(wh.whMap.get(d.warehouse_id)), f.wh) && has(memberName(d.responsible_id), f.resp)
      && (!f.min || s >= Number(f.min)) && (!f.max || s <= Number(f.max)) && has(d.note ?? '', f.note) && has(dmy(d.doc_date), f.date);
  });
  const PER = 50;
  const shown = rows.slice(page * PER, page * PER + PER);
  const total = rows.reduce((a, d) => a + docSum(byDoc.get(d.id) ?? []), 0);
  const fi = 'h-7 w-full min-w-[70px] rounded-md border border-line bg-white px-1.5 text-xs font-normal normal-case';
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(0); };

  function exportCsv() {
    const head = ['Raqam', 'Holati', meta.party, 'Ombor', 'Javobgar', 'Summa', 'Izoh', 'Sana'];
    const body = rows.map((d) => [d.number, d.status === 'draft' ? 'O‘tkazilmagan' : d.status === 'reversed' ? 'Bekor qilingan' : 'O‘tkazilgan', party(d),
      wh.whLabel(wh.whMap.get(d.warehouse_id)), memberName(d.responsible_id), docSum(byDoc.get(d.id) ?? []), d.note ?? '', dmy(d.doc_date)]);
    downloadCsv(`${meta.list}.csv`, [head, ...body]);
  }

  if (docs.isLoading) return <PageLoader />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-lg font-semibold">{meta.list}</h2>
        {myWhs.length > 0 && <Button variant="primary" size="sm" onClick={() => setAsk(true)}><Plus size={15} /> {meta.create}</Button>}
        <button type="button" onClick={exportCsv} aria-label="Excel’ga yuklab olish" title="Excel’ga yuklab olish" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Download size={16} /></button>
      </div>
      {/* Telefon: kartochkalar; ustunlar bo'yicha filtr faqat kompyuterda */}
      <div className="flex flex-col gap-2 md:hidden">
        <input type="search" placeholder="Raqam, kontragent yoki izoh bo‘yicha qidirish" aria-label="Nakladnoy qidirish" value={mq}
          onChange={(e) => { setMq(e.target.value); setPage(0); }}
          className="h-10 rounded-lg border border-line bg-white px-3 text-[15px]" />
        {shown.length === 0 && <Card className="p-6 text-center text-sm text-sub">Nakladnoy topilmadi.</Card>}
        {shown.map((d) => {
          const draft = d.status === 'draft';
          return (
            <button key={d.id} type="button" onClick={() => onOpen(d)} className="flex flex-col gap-1 rounded-xl border border-line bg-white p-3 text-left active:bg-surface">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-primary-hover">{d.number}</span>
                {d.reversal_of && <span className="text-xs text-sub">(storno)</span>}
                <span className="ml-auto text-xs">
                  {draft ? <span className="inline-flex items-center gap-1 text-warn"><CircleDashed size={13} /> O‘tkazilmagan</span>
                    : d.status === 'reversed' ? <span className="text-sub line-through">Bekor qilingan</span>
                    : <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={13} /> O‘tkazilgan</span>}
                </span>
              </span>
              <span className="truncate text-sm">{party(d) || '—'}</span>
              <span className="flex items-center gap-2 text-xs text-sub">
                <span>{dmy(d.doc_date)}</span><span>·</span><span className="truncate">{wh.whLabel(wh.whMap.get(d.warehouse_id))}</span>
                <b className="ml-auto text-sm font-semibold text-fg tabular-nums">{money2(docSum(byDoc.get(d.id) ?? []))}</b>
              </span>
            </button>
          );
        })}
      </div>
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-xs font-semibold text-sub">
            <tr>{['Nakladnoy raqami', 'Holati', meta.party, 'Ombor', 'Javobgar', 'Summa', 'Izoh', 'Sana', ''].map((h, i) => <th key={i} className="px-2 pt-2 pb-1 whitespace-nowrap">{h}</th>)}</tr>
            <tr>
              <th className="px-2 pb-2"><input type="search" aria-label="Raqam bo‘yicha filtr" className={fi} value={f.no} onChange={set('no')} /></th>
              <th className="px-2 pb-2"><select aria-label="Holat bo‘yicha filtr" className={fi} value={f.st} onChange={set('st')}><option value="">Hammasi</option><option value="posted">O‘tkazilgan</option><option value="draft">O‘tkazilmagan</option></select></th>
              <th className="px-2 pb-2"><input type="search" aria-label={`${meta.party} bo‘yicha filtr`} className={fi} value={f.party} onChange={set('party')} /></th>
              <th className="px-2 pb-2"><input type="search" aria-label="Ombor bo‘yicha filtr" className={fi} value={f.wh} onChange={set('wh')} /></th>
              <th className="px-2 pb-2"><input type="search" aria-label="Javobgar bo‘yicha filtr" className={fi} value={f.resp} onChange={set('resp')} /></th>
              <th className="px-2 pb-2"><span className="flex gap-1"><input type="number" placeholder="dan" aria-label="Summa dan" className={fi} value={f.min} onChange={set('min')} /><input type="number" placeholder="gacha" aria-label="Summa gacha" className={fi} value={f.max} onChange={set('max')} /></span></th>
              <th className="px-2 pb-2"><input type="search" aria-label="Izoh bo‘yicha filtr" className={fi} value={f.note} onChange={set('note')} /></th>
              <th className="px-2 pb-2"><input type="search" placeholder="kk.oo.yyyy" aria-label="Sana bo‘yicha filtr" className={fi} value={f.date} onChange={set('date')} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-sub">Nakladnoy topilmadi.</td></tr>}
            {shown.map((d) => {
              const draft = d.status === 'draft';
              const editable = draft && wh.canEdit(wh.whMap.get(d.warehouse_id));
              return (
                <tr key={d.id} className="border-t border-line hover:bg-surface">
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => onOpen(d)} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline" aria-label={editable ? 'Tahrirlash' : 'Ko‘rish'}>
                      {editable ? <Pencil size={13} /> : <Eye size={13} />}{d.number}
                    </button>
                    {d.reversal_of && <span className="ml-1 text-xs text-sub">(storno)</span>}
                  </td>
                  <td className="px-2 py-2">
                    {draft ? <span className="inline-flex items-center gap-1 text-warn"><CircleDashed size={14} /> O‘tkazilmagan</span>
                      : d.status === 'reversed' ? <span className="text-sub line-through">Bekor qilingan</span>
                      : <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={14} /> O‘tkazilgan</span>}
                  </td>
                  <td className="px-2 py-2">{party(d)}</td>
                  <td className="px-2 py-2">{wh.whLabel(wh.whMap.get(d.warehouse_id))}</td>
                  <td className="px-2 py-2">{memberName(d.responsible_id)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{byDoc.has(d.id) || !ids.length ? money2(docSum(byDoc.get(d.id) ?? [])) : '…'}</td>
                  <td className="max-w-[200px] truncate px-2 py-2 text-sub">{d.note}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{dmy(d.doc_date)}</td>
                  <td className="px-2 py-2">
                    <span className="flex justify-end gap-0.5">
                      {can('warehouse.edit') && <button type="button" onClick={() => copy.mutate(d)} aria-label="Nusxa olish" title="Nusxa olib yangi qoralama yaratish" className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-muted"><Copy size={14} /></button>}
                      {editable && <button type="button" onClick={() => setDel(d)} aria-label="O‘chirish" title="O‘chirish" className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:bg-muted hover:text-bad"><Trash2 size={14} /></button>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-sub">
        <span>{rows.length} ta nakladnoy · jami <b className="text-fg">{money2(total)}</b> so‘m</span>
        {rows.length > PER && (
          <span className="flex items-center gap-1">
            <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Oldingi sahifa">‹</Button>
            {page + 1} / {Math.ceil(rows.length / PER)}
            <Button size="sm" disabled={(page + 1) * PER >= rows.length} onClick={() => setPage(page + 1)} aria-label="Keyingi sahifa">›</Button>
          </span>
        )}
      </div>
      <Confirm open={ask} text={`Haqiqatan ham yangi ${meta.label.toLowerCase()} nakladnoyi yaratmoqchimisiz?`} yes="OK"
        onNo={() => setAsk(false)} onYes={() => create.mutate(undefined)} loading={create.isPending} />
      <Confirm open={!!del} danger yes="O‘chirish" text={`${del?.number} qoralamasi o‘chirilsinmi?`}
        onNo={() => setDel(null)} onYes={() => del && remove.mutate(del)} loading={remove.isPending} />
    </div>
  );
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

interface Line { key: string; product_id: string; name?: string; qty: number; price: number; inPacks: boolean }

function DocEditor({ wh, id, onBack, onOpen }: { wh: WhCtx; id: string; onBack: () => void; onOpen: (d: StockDoc) => void }) {
  const { members, memberName } = useOrg();
  const qc = useQueryClient();
  const doc = useQuery({ queryKey: ['stock_docs', 'one', id], queryFn: async () => (await db.list<StockDoc>('stock_docs', { id }))[0] ?? null });
  const lines = useQuery({ queryKey: ['stock_doc_lines', 'doc', id], queryFn: () => db.list<StockDocLine>('stock_doc_lines', { doc_id: id }) });
  const [d, setD] = useState<StockDoc | null>(null);
  const [ls, setLs] = useState<Line[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveSt, setSaveSt] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [askRev, setAskRev] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());
  const loaded = useRef(false);
  // Avtomatik saqlash uchun eng so'nggi holat (taymer va sahifadan chiqishda ishlatiladi)
  const live = useRef({ d, ls, dirty, ver: 0 });
  live.current.d = d; live.current.ls = ls; live.current.dirty = dirty;
  const saving = useRef<Promise<void> | null>(null);

  useEffect(() => { if (doc.data && !live.current.dirty) setD(doc.data); }, [doc.data]);
  useEffect(() => {
    if (loaded.current || !lines.data) return;
    loaded.current = true;
    setLs(lines.data.map((l) => ({ key: l.id, product_id: l.product_id, qty: l.qty, price: l.price, inPacks: false })));
  }, [lines.data]);

  const ro = !d || d.status !== 'draft' || !wh.canEdit(wh.whMap.get(d.warehouse_id));
  const touch = () => { live.current.ver++; setDirty(true); };
  const upd = (patch: Partial<StockDoc>) => { setD({ ...d!, ...patch }); touch(); };
  const updLine = (i: number, patch: Partial<Line>) => { setLs(ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); touch(); };

  /** Qoralamani serverga yozadi; parallel chaqiruvlar navbat bilan bajariladi. */
  function flush(): Promise<void> {
    const run = async () => {
      const { d: cd, ls: cls, ver } = live.current;
      if (!cd || cd.status !== 'draft' || !live.current.dirty) return;
      setSaveSt('saving');
      try {
        await http.put(`/api/stock-docs/${cd.id}/draft`, {
          doc_date: cd.doc_date, warehouse_id: cd.warehouse_id, to_warehouse_id: cd.to_warehouse_id, counterparty_id: cd.counterparty_id,
          responsible_id: cd.responsible_id, reason: cd.reason, note: cd.note,
          lines: cls.filter((l) => l.product_id && l.qty > 0).map((l) => ({ product_id: l.product_id, qty: l.qty, price: l.price })),
        });
        if (live.current.ver === ver) { live.current.dirty = false; setDirty(false); }
        setSaveSt('saved');
        void qc.invalidateQueries({ queryKey: ['stock_docs'], refetchType: 'none' });
        void qc.invalidateQueries({ queryKey: ['stock_doc_lines'], refetchType: 'none' });
      } catch (e) { setSaveSt('error'); throw e; }
    };
    const p = (saving.current ?? Promise.resolve()).catch(() => undefined).then(run);
    saving.current = p.finally(() => { if (saving.current === p) saving.current = null; });
    return p;
  }
  // O'zgarishdan 0,8 soniya o'tib avtomatik saqlash
  useEffect(() => {
    if (!dirty || ro) return;
    const t = setTimeout(() => { flush().catch(() => undefined); }, 800);
    return () => clearTimeout(t);
  }, [d, ls, dirty, ro]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sahifadan chiqib ketilsa ham oxirgi o'zgarishlar saqlanadi
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (live.current.dirty) { e.preventDefault(); flush().catch(() => undefined); } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); if (live.current.dirty) flush().catch(() => undefined); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focusKey) return;
    const el = qtyRefs.current.get(focusKey);
    if (el) { el.focus(); el.select(); setFocusKey(null); }
  }, [focusKey, ls]);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1200); return () => clearTimeout(t); }, [flash]);

  /** Qidiruvdan tanlangan tovar: bor bo'lsa miqdori oshiriladi, yo'q bo'lsa yangi qator. */
  function pick(p: Product) {
    const i = ls.findIndex((l) => l.product_id === p.id);
    if (i >= 0) {
      const l = ls[i]!;
      updLine(i, { qty: +(l.qty + (l.inPacks ? p.pack_qty : 1)).toFixed(3) });
      setFlash(l.key); setFocusKey(l.key);
      toast.info(`«${p.name}» nakladnoyda bor edi — miqdori oshirildi`);
      return;
    }
    const key = crypto.randomUUID();
    setLs([...ls, { key, product_id: p.id, name: p.name, qty: 1, price: d!.type === 'receipt' ? p.last_cost ?? 0 : 0, inPacks: false }]);
    touch(); setFlash(key); setFocusKey(key);
  }

  const post = useAction(async () => {
    if (d!.type === 'receipt' || d!.type === 'return') { if (!d!.counterparty_id) throw new Error('Kontragentni tanlang'); }
    if (!ls.some((l) => l.product_id && l.qty > 0)) throw new Error('Kamida bitta tovar qo‘shing');
    live.current.dirty = true;
    await flush();
    return http.post(`/api/stock-docs/${d!.id}/post`);
  }, { invalidate: ['stock_docs', 'stock_doc_lines', 'stock_balances', 'stock'], success: 'Nakladnoy o‘tkazildi' });
  const reverse = useAction(() => http.post<StockDoc>(`/api/stock-docs/${d!.id}/reverse`), { invalidate: ['stock_docs', 'stock_balances', 'stock'], success: 'Storno hujjati yaratildi', onDone: (r) => { setAskRev(false); onOpen(r); } });
  const copy = useAction(async () => { await flush(); return http.post<StockDoc>(`/api/stock-docs/${d!.id}/copy`); }, { invalidate: ['stock_docs'], success: 'Nusxa yaratildi', onDone: onOpen });

  if (doc.isLoading || !d) return doc.data === null ? <Card className="p-6 text-sm text-sub">Hujjat topilmadi. <button type="button" className="text-primary" onClick={onBack}>Ro‘yxatga qaytish</button></Card> : <PageLoader />;
  const meta = DOC_TYPE[d.type];
  const editWhs = wh.warehouses.filter((w) => wh.canEdit(w) || w.id === d.warehouse_id);
  const sum = ls.reduce((a, l) => a + l.qty * l.price, 0);
  const prodOf = (pid: string) => wh.prodMap.get(pid);

  function exportCsv() {
    downloadCsv(`${meta.label} ${d!.number}.csv`, [['#', 'Tovar', 'Miqdor', 'Birlik', 'Narx', 'Summa'],
      ...ls.map((l, i) => [i + 1, prodOf(l.product_id)?.name ?? '', l.qty, prodOf(l.product_id)?.unit ?? '', l.price, l.qty * l.price])]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => { flush().then(onBack, () => { if (confirm('Saqlab bo‘lmadi. Baribir chiqasizmi?')) onBack(); }); }}><ArrowLeft size={15} /> Ro‘yxatga qaytish</Button>
        <h2 className="m-0 text-lg font-semibold">{meta.label} · {d.number}</h2>
        {d.status === 'draft' ? <Badge tone="amber">O‘tkazilmagan</Badge> : d.status === 'reversed' ? <Badge tone="gray">Bekor qilingan</Badge> : <Badge tone="green">O‘tkazilgan</Badge>}
        {d.reversal_of && <Badge tone="blue">Storno</Badge>}
        {d.act_id && <Badge tone="blue">Akt bo‘yicha</Badge>}
        {!ro && (
          <span aria-live="polite" className={cx('inline-flex items-center gap-1 text-xs', saveSt === 'error' ? 'text-bad' : 'text-sub')}>
            {saveSt === 'error' ? <>Saqlanmadi · <button type="button" className="text-primary underline" onClick={() => flush().catch(() => undefined)}>qayta urinish</button></>
              : saveSt === 'saving' || dirty ? 'Saqlanmoqda…' : saveSt === 'saved' ? <><Check size={13} className="text-ok" /> Saqlandi</> : 'Qoralama avtomatik saqlanadi'}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={() => copy.mutate(undefined)} aria-label="Nusxa olish" title="Nusxa olib yangi qoralama yaratish" className="grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Copy size={16} /></button>
          <button type="button" onClick={exportCsv} aria-label="Excel’ga yuklab olish" title="Excel’ga yuklab olish" className="grid h-8 w-8 place-items-center rounded-lg text-sub hover:bg-muted"><Download size={16} /></button>
        </span>
      </div>

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={d.type === 'transfer' ? 'Qaysi ombordan *' : 'Ombor *'}>{(fid) => (
          <Select id={fid} value={d.warehouse_id} disabled={ro} onChange={(e) => upd({ warehouse_id: e.target.value })}>
            {editWhs.map((w) => <option key={w.id} value={w.id}>{wh.whLabel(w)}</option>)}
          </Select>)}
        </Field>
        {d.type === 'transfer' && <Field label="Qabul ombori *">{(fid) => (
          <Select id={fid} value={d.to_warehouse_id ?? ''} disabled={ro} onChange={(e) => upd({ to_warehouse_id: e.target.value })}>
            <option value="">Tanlang</option>
            {wh.warehouses.filter((w) => w.id !== d.warehouse_id).map((w) => <option key={w.id} value={w.id}>{wh.whLabel(w)}</option>)}
          </Select>)}
        </Field>}
        {(d.type === 'receipt' || d.type === 'return') && <Field label="Kontragent *">{(fid) => (
          <Select id={fid} value={d.counterparty_id ?? ''} disabled={ro} onChange={(e) => upd({ counterparty_id: e.target.value || null })}>
            <option value="">Tanlang</option>
            {wh.suppliers.filter((s) => !s.archived || s.id === d.counterparty_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>)}
        </Field>}
        {d.type === 'writeoff' && <Field label="Sabab *">{(fid) => (
          <Select id={fid} value={d.reason ?? 'usage'} disabled={ro} onChange={(e) => upd({ reason: e.target.value })}>
            {Object.entries(WRITEOFF_REASON).filter(([k]) => k !== 'act' || d.reason === 'act').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>)}
        </Field>}
        <Field label="Javobgar *">{(fid) => (
          <Select id={fid} value={d.responsible_id ?? ''} disabled={ro} onChange={(e) => upd({ responsible_id: e.target.value })}>
            {members.filter((m) => m.is_active || m.user_id === d.responsible_id).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </Select>)}
        </Field>
        <Field label="Nakladnoy raqami">{(fid) => <Input id={fid} value={d.number} disabled />}</Field>
        <Field label="Sana *">{(fid) => <Input id={fid} type="date" value={d.doc_date} max={isoDate(new Date())} disabled={ro} onChange={(e) => upd({ doc_date: e.target.value })} />}</Field>
        <Field label="Izoh" className="sm:col-span-2">{(fid) => <Textarea id={fid} rows={1} value={d.note ?? ''} disabled={ro} onChange={(e) => upd({ note: e.target.value })} />}</Field>
      </Card>

      <Card className="overflow-x-auto">
        {!ro && (
          <div className="border-b border-line p-3">
            <ProductSearch ref={searchRef} wh={wh} whId={d.warehouse_id} showStock={d.type !== 'receipt'}
              inDoc={new Map(ls.map((l) => [l.product_id, l.qty]))} onPick={pick} onCreate={setCreating} />
          </div>
        )}
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-xs font-semibold text-sub">
            <tr><th className="w-10 px-3 py-2">#</th><th className="px-3 py-2">Tovar</th><th className="px-3 py-2">Miqdori</th>
              {d.type === 'receipt' && <th className="px-3 py-2">Narx</th>}{d.type === 'receipt' && <th className="px-3 py-2 text-right">Summa</th>}
              {d.type !== 'receipt' && <th className="px-3 py-2">Ombordagi qoldiq</th>}<th className="w-10" /></tr>
          </thead>
          <tbody>
            {ls.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sub">{ro ? 'Tovar yo‘q' : 'Tovar qo‘shilmagan — yuqoridagi qidiruvga tovar nomini yozing'}</td></tr>}
            {ls.map((l, i) => {
              const p = prodOf(l.product_id);
              const k = l.inPacks && p ? p.pack_qty : 1;
              const have = p ? wh.qtyOf(p.id, d.warehouse_id) : 0;
              return (
                <tr key={l.key} className={cx('border-t border-line transition-colors', flash === l.key && 'bg-primary-soft')}>
                  <td className="px-3 py-2 text-sub">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p?.name ?? l.name ?? '…'}</div>
                    {p && (p.sku || p.brand_id) && <div className="text-xs text-sub">{[wh.brandMap.get(p.brand_id ?? '')?.name, p.sku].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => updLine(i, { qty: Math.max(0, +(l.qty - k).toFixed(3)) })} disabled={ro} aria-label="Kamaytirish" className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:bg-muted"><Minus size={14} /></button>
                      <input type="number" min={0} step="any" aria-label="Miqdori" value={+(l.qty / k).toFixed(3)} disabled={ro}
                        ref={(el) => { if (el) qtyRefs.current.set(l.key, el); else qtyRefs.current.delete(l.key); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchRef.current?.focus(); } }}
                        onChange={(e) => updLine(i, { qty: Math.max(0, Number(e.target.value) * k) })} className="h-8 w-20 rounded-lg border border-line px-2 text-right" />
                      <button type="button" onClick={() => updLine(i, { qty: +(l.qty + k).toFixed(3) })} disabled={ro} aria-label="Ko‘paytirish" className="grid h-8 w-8 place-items-center rounded-lg border border-line hover:bg-muted"><Plus size={14} /></button>
                      {p?.pack_unit && p.pack_qty > 1 && !ro ? (
                        <select aria-label="Birlik" value={l.inPacks ? 'pack' : 'unit'} onChange={(e) => updLine(i, { inPacks: e.target.value === 'pack' })} className="h-8 rounded-lg border border-line bg-white px-1 text-xs">
                          <option value="unit">{p.unit}</option><option value="pack">{p.pack_unit} ({p.pack_qty} {p.unit})</option>
                        </select>
                      ) : <span className="text-xs text-sub">{p?.unit}</span>}
                    </span>
                  </td>
                  {d.type === 'receipt' && (
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <input type="number" min={0} step="any" aria-label="Narx" value={+(l.price * k).toFixed(2)} disabled={ro}
                          onChange={(e) => updLine(i, { price: Math.max(0, Number(e.target.value) / k) })} className="h-8 w-28 rounded-lg border border-line px-2 text-right" />
                        <span className="text-xs text-sub">/ {l.inPacks ? p?.pack_unit : p?.unit}</span>
                      </span>
                    </td>
                  )}
                  {d.type === 'receipt' && <td className="px-3 py-2 text-right whitespace-nowrap">{money2(l.qty * l.price)}</td>}
                  {d.type !== 'receipt' && <td className={cx('px-3 py-2 whitespace-nowrap', d.status === 'draft' && have < l.qty ? 'text-bad' : 'text-sub')}>{p ? fmtQty(p, have) : ''}</td>}
                  <td className="px-2 py-2">{!ro && <button type="button" onClick={() => { setLs(ls.filter((_, j) => j !== i)); touch(); }} aria-label="Qatorni o‘chirish" className="grid h-7 w-7 place-items-center rounded-lg text-sub hover:text-bad"><Trash2 size={14} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-3">
          <span className="text-sm text-sub">{ls.length} xil tovar</span>
          {d.type === 'receipt' && <span className="text-sm">Jami: <b>{money2(sum)}</b> so‘m</span>}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {!ro && <>
          <Button variant="primary" loading={post.isPending} onClick={() => post.mutate(undefined)}>O‘tkazish</Button>
          <span className="text-xs text-sub">O‘tkazilgandan keyin hujjatni o‘zgartirib bo‘lmaydi — xato bo‘lsa storno qilinadi.</span>
        </>}
        {d.status === 'posted' && !d.reversal_of && wh.canEdit(wh.whMap.get(d.warehouse_id)) && (
          <Button variant="danger" onClick={() => setAskRev(true)}><Undo2 size={15} /> Bekor qilish (storno)</Button>
        )}
        {d.posted_at && <span className="text-xs text-sub">O‘tkazdi: {memberName(d.responsible_id)}, {dmy(d.posted_at)}</span>}
      </div>
      {creating !== null && <ProductModal wh={wh} defCat={null} initialName={creating} onClose={() => setCreating(null)} onSaved={pick} />}
      <Confirm open={askRev} danger yes="Storno qilish" loading={reverse.isPending} onNo={() => setAskRev(false)} onYes={() => reverse.mutate(undefined)}
        text="Bu hujjatning ombordagi ta’siri to‘liq bekor qilinadi va teskari (storno) hujjat yaratiladi. Kirim tovarlari allaqachon ishlatilgan bo‘lsa, bekor qilib bo‘lmaydi." />
    </div>
  );
}

