import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronLeft, ChevronRight, FolderPlus, Pencil, Plus, Search, SendHorizontal, Smile, Trash2, X } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dmyhm, fold, initials, money, qty as fq } from '@/lib/format';
import type { Patient } from '@/lib/types';
import { CatIconSvg, WorksWizard } from './WorksWizard';
import { Confirm, cx } from './ui';

interface HFile { id: string; kind: string; name: string | null }
interface HComment { id: string; author_id: string | null; text: string | null; sticker: string | null; created_at: string; edited_at: string | null; files: HFile[] }
interface HRecord {
  id: string; title: string | null; diagnosis: string | null; description: string | null; tooth: string | null; doctor_id: string | null;
  branch_id: string | null; created_at: string; act_id: string | null; act_status: 'draft' | 'closed' | 'cancelled' | null;
  mats: { name: string; unit: string; qty: number }[]; files: HFile[]; comments: HComment[];
  details: WorkDetails | null;
}
interface WorkDetails {
  kind: 'works'; category: string | null; works: { name: string; price: number }[]; total: number; tooth: string | null;
  groups: { name: string; items: { name: string; qty: number; unit: string }[] }[];
}

const STICKERS = ['🦷', '👍', '👌', '✅', '❗', '⚠️', '⭐', '❤️', '😊', '😁', '😬', '😢', '😷', '🔥', '💉', '🩺', '💊', '🩹', '📌', '📞', '🕐', '💰', '🎉', '🙏'];
const KEY = (pid: string) => ['patient-history', pid];

/** Fayllarni ketma-ket yuklaydi (yozuvga yoki izohga). */
async function uploadFiles(pid: string, recordId: string, commentId: string | null, files: File[]) {
  for (const f of files) {
    const fd = new FormData();
    fd.append('patient_id', pid); fd.append('record_id', recordId);
    if (commentId) fd.append('comment_id', commentId);
    fd.append('kind', 'image'); fd.append('file', f);
    await http.post('/api/files', fd);
  }
}

/** Bemor kartasi → Davolash tarixi: har bir bosqich — karta, ichida izohlar, rasmlar va stikerlar. */
export function HistoryTab({ p }: { p: Patient }) {
  const { can, branch, me } = useOrg();
  const h = useQuery({ queryKey: KEY(p.id), queryFn: () => http.get<HRecord[]>(`/api/patients/${p.id}/history`) });
  const [q, setQ] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const [wiz, setWiz] = useState(false);
  const qc = useQueryClient();
  const edit = can('patients.edit');

  const list = useMemo(() => {
    const words = fold(q.trim()).split(/\s+/).filter(Boolean);
    return (h.data ?? []).filter((r) => {
      if (!words.length) return true;
      const hay = fold([r.title, r.diagnosis, r.description, r.tooth, ...r.comments.map((k) => k.text), ...r.mats.map((m) => m.name)].join(' '));
      return words.every((w) => hay.includes(w));
    });
  }, [h.data, q]);

  return (
    <div className="flex max-w-[1100px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-80">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input type="search" placeholder="Qidirish" aria-label="Tarixdan qidirish" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-sm" />
        </div>
        {edit && <>
          <button type="button" onClick={() => { barRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); barRef.current?.querySelector('input')?.focus(); }} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#3d4858] hover:bg-white">
            <FolderPlus size={17} className="text-primary" /> Davolash bosqichi
          </button>
          {can('patients.edit', branch.id) && (
            <button type="button" onClick={() => setWiz(true)} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#3d4858] hover:bg-white">
              <span className="text-primary"><CatIconSvg icon="tooth" size={17} /></span> Material xarajat
            </button>
          )}
        </>}
      </div>

      {h.isLoading && <div className="p-6 text-center text-sm text-sub">Yuklanmoqda…</div>}
      {!h.isLoading && list.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-sub">
          {q ? 'Hech narsa topilmadi' : 'Davolash tarixi bo‘sh. Pastdagi «Yangi bosqich» qatoriga nom yozib ➕ bosing yoki «Material xarajat» kiriting.'}
        </div>
      )}
      {list.map((r) => <StageCard key={r.id} r={r} p={p} canEdit={edit} meId={me.user_id} isOwner={me.role === 'owner'} />)}
      {edit && <div ref={barRef}><QuickStage p={p} /></div>}
      {wiz && <WorksWizard patient={p} branchId={branch.id} onClose={() => { setWiz(false); void qc.invalidateQueries({ queryKey: KEY(p.id) }); }} />}
    </div>
  );
}

function Avatar({ uid, size = 36 }: { uid: string | null; size?: number }) {
  const { members, memberName } = useOrg();
  const c = members.find((m) => m.user_id === uid)?.color ?? '#94a3b8';
  return (
    <span className="grid flex-none place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: c, fontSize: size * 0.33 }}>
      {initials(memberName(uid)) || '?'}
    </span>
  );
}

/** Ro'yxat oxiridagi "Yangi bosqich" qatori: nom (ixtiyoriy) va tishlar, ➕ yoki Enter — karta darhol yaratiladi. */
function QuickStage({ p }: { p: Patient }) {
  const { me, branch } = useOrg();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [teeth, setTeeth] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const add = useAction(() => db.insert('treatment_records', { patient_id: p.id, doctor_id: me.user_id, branch_id: branch.id, title: title.trim() || 'Yangi bosqich', tooth: teeth.length ? teeth.join(', ') : null }),
    { onDone: () => { setTitle(''); setTeeth([]); setPick(false); void qc.invalidateQueries({ queryKey: KEY(p.id) }); } });
  const RB = 'grid h-9 w-9 flex-none place-items-center rounded-full text-white';
  return (
    <div className="relative rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(7,18,30,.04)]">
      <div className="flex items-center gap-2 py-2 pr-3 pl-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yangi bosqich" aria-label="Yangi bosqich nomi"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add.mutate(undefined); } }}
          className="h-10 min-w-0 flex-1 bg-transparent pl-8 text-[15px] outline-none placeholder:text-sub" />
        {teeth.length > 0 && <span className="rounded-full bg-[#e6f6fc] px-2.5 py-1 text-xs font-semibold text-[#075985]">🦷 {teeth.join(', ')}</span>}
        <button type="button" onClick={() => setPick(!pick)} aria-expanded={pick} aria-label="Tishlarni tanlash" title="Tishlar" className={cx(RB, 'bg-primary')}><CatIconSvg icon="tooth" size={17} /></button>
        <button type="button" disabled={add.isPending} onClick={() => add.mutate(undefined)} aria-label="Bosqich qo‘shish" title="Bosqich qo‘shish (Enter)" className={cx(RB, 'bg-ok disabled:opacity-60')}><Plus size={20} /></button>
      </div>
      {pick && <TeethPicker value={teeth} onChange={setTeeth} />}
    </div>
  );
}

const ADULT_ROWS = [[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]];
const CHILD_ROWS = [[55, 54, 53, 52, 51, 61, 62, 63, 64, 65], [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]];
function TeethPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [child, setChild] = useState(false);
  const rows = child ? CHILD_ROWS : ADULT_ROWS;
  const tog = (t: number) => { const k = String(t); onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k].sort((a, b) => Number(a) - Number(b))); };
  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
      <div className="flex gap-1.5">
        {[['Kattalar', false], ['Bolalar', true]].map(([l, v]) => (
          <button key={String(l)} type="button" onClick={() => setChild(v as boolean)} className={cx('h-8 rounded-md px-3 text-[13px]', child === v ? 'bg-primary text-white' : 'bg-muted text-[#3d4858]')}>{String(l)}</button>
        ))}
        <button type="button" onClick={() => onChange([])} className="ml-auto h-8 px-2 text-[13px] text-sub">Tozalash</button>
      </div>
      <div className="overflow-x-auto">
        <div className="flex w-max flex-col gap-1">
          {rows.map((r, ri) => (
            <div key={ri} className={cx('flex gap-1', ri === 1 && 'border-t border-dashed border-line pt-1')}>
              {r.map((t, i) => (
                <button key={t} type="button" onClick={() => tog(t)} aria-pressed={value.includes(String(t))}
                  className={cx('h-9 w-9 rounded-md border text-[13px] font-medium', i === r.length / 2 && 'ml-2', value.includes(String(t)) ? 'border-primary bg-primary text-white' : 'border-line bg-white hover:border-primary')}>{t}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StageCard({ r, p, canEdit, meId, isOwner }: { r: HRecord; p: Patient; canEdit: boolean; meId: string; isOwner: boolean }) {
  const { memberName } = useOrg();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY(p.id) });
  const [ed, setEd] = useState<{ title: string; tooth: string; description: string } | null>(null);
  const [askDel, setAskDel] = useState(false);
  const [light, setLight] = useState<{ files: HFile[]; i: number } | null>(null);
  const title = r.title || r.diagnosis || 'Yozuv';
  const saveEd = useAction(() => db.update('treatment_records', r.id, { title: ed!.title.trim() || null, tooth: ed!.tooth.trim() || null, description: ed!.description.trim() || null }),
    { onDone: () => { setEd(null); void refresh(); } });
  const del = useAction(() => db.remove('treatment_records', r.id), { success: 'Bosqich o‘chirildi', onDone: () => { setAskDel(false); void refresh(); } });

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(7,18,30,.04)]">
      <header className="flex items-start gap-3 px-4 pt-3 pb-2.5">
        <Avatar uid={r.doctor_id} size={38} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="m-0 text-[17px] leading-snug font-medium">
            {r.details?.category && <span className="font-normal text-sub">{r.details.category} › </span>}
            {canEdit && !r.act_id ? <button type="button" onClick={() => setEd({ title: r.title ?? r.diagnosis ?? '', tooth: r.tooth ?? '', description: r.description ?? '' })} className="text-left hover:text-primary-hover" title="Nomini o‘zgartirish">{title}</button> : title}{r.tooth && <span className="text-[#3d4858]"> {r.tooth}</span>}
            {r.act_status === 'cancelled' && <span className="ml-2 rounded-full bg-bad-soft px-2 py-0.5 align-middle text-xs font-medium text-bad">akt bekor qilingan</span>}
          </h3>
          <span className="text-xs"><span className="text-primary-hover">{memberName(r.doctor_id)}</span><span className="ml-3 text-sub">{dmyhm(r.created_at)}</span></span>
        </div>
        {canEdit && (
          <span className="flex flex-none items-center gap-0.5">
            <button type="button" onClick={() => setEd({ title: r.title ?? r.diagnosis ?? '', tooth: r.tooth ?? '', description: r.description ?? '' })} aria-label="Bosqichni tahrirlash" title="Tahrirlash"
              className="grid h-9 w-9 place-items-center rounded-md text-sub hover:bg-muted hover:text-fg"><Pencil size={16} /></button>
            {!r.act_id && <button type="button" onClick={() => setAskDel(true)} aria-label="Bosqichni o‘chirish" title="O‘chirish"
              className="grid h-9 w-9 place-items-center rounded-md text-sub hover:bg-bad-soft hover:text-bad"><Trash2 size={16} /></button>}
          </span>
        )}
      </header>

      {ed && (
        <div className="flex flex-col gap-2 border-t border-line bg-[#f7f9fa] px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
            <input value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} aria-label="Bosqich nomi" className="h-9 rounded-lg border border-line bg-white px-3 text-sm" />
            <input value={ed.tooth} onChange={(e) => setEd({ ...ed, tooth: e.target.value })} aria-label="Tish raqami" placeholder="Tish" className="h-9 rounded-lg border border-line bg-white px-3 text-sm" />
          </div>
          <textarea rows={3} value={ed.description} onChange={(e) => setEd({ ...ed, description: e.target.value })} aria-label="Matn" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEd(null)} className="h-9 px-3 text-sm text-sub">Bekor qilish</button>
            <button type="button" onClick={() => saveEd.mutate(undefined)} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-white">Saqlash</button>
          </div>
        </div>
      )}

      {r.details?.kind === 'works' && !ed && <WorksBlock r={r} />}
      {(r.description || r.files.length > 0 || (r.mats.length > 0 && !r.details)) && !ed && (
        <div className="border-t border-line bg-[#f7f9fa] px-4 py-3">
          <EntryHead uid={r.doctor_id} at={r.created_at} />
          <div className="flex flex-col gap-2.5 pl-11">
            {r.description && <p className="m-0 text-sm leading-relaxed whitespace-pre-wrap text-[#3d4858]">{r.description}</p>}
            {r.mats.length > 0 && !r.details && (
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <div className="bg-surface px-3 py-1.5 text-xs font-semibold text-sub">Material xarajat · ombordan chiqarildi</div>
                {r.mats.map((m, i) => (
                  <div key={i} className="flex justify-between gap-3 border-t border-muted px-3 py-1.5 text-sm"><span>{m.name}</span><b className="font-semibold tabular-nums">{fq(m.qty)} {m.unit}</b></div>
                ))}
              </div>
            )}
            {r.files.length > 0 && <Photos files={r.files} onOpen={(i) => setLight({ files: r.files, i })} />}
          </div>
        </div>
      )}

      {r.comments.map((k) => (
        <CommentRow key={k.id} k={k} mine={k.author_id === meId || isOwner} canEdit={canEdit} onPhoto={(i) => setLight({ files: k.files, i })} onChanged={refresh} />
      ))}

      {canEdit && <Composer p={p} recordId={r.id} onSent={refresh} />}
      {light && <Lightbox files={light.files} start={light.i} onClose={() => setLight(null)} />}
      <Confirm open={askDel} danger yes="O‘chirish" loading={del.isPending} onNo={() => setAskDel(false)} onYes={() => del.mutate(undefined)}
        text={`«${title}» bosqichi, undagi izohlar va rasmlar o‘chirilsinmi? Buni qaytarib bo‘lmaydi.`} />
    </section>
  );
}

/** Material xarajat kartasi: ish(lar) va narxi, tishlar, materiallar guruhlar bo'yicha. */
function WorksBlock({ r }: { r: HRecord }) {
  const d = r.details!;
  return (
    <div className="border-t border-line bg-[#f7f9fa] px-4 py-3">
      <EntryHead uid={r.doctor_id} at={r.created_at} />
      <div className="flex flex-col gap-2.5 pl-11">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#3d4858]">
          {d.works.map((w, i) => <span key={i}><b className="font-medium text-fg">{w.name}</b> — {money(w.price)} so‘m</span>)}
          {d.tooth && <span className="rounded-full bg-[#e6f6fc] px-2 py-0.5 text-xs font-semibold text-[#075985]">🦷 {d.tooth}</span>}
          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-[#166534]">Material xarajat</span>
        </div>
        {d.groups.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            {d.groups.map((g) => (
              <div key={g.name} className="border-t border-muted first:border-t-0">
                <div className="bg-surface px-3 py-1.5 text-xs font-semibold text-sub">{g.name}</div>
                {g.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3 border-t border-muted px-3 py-1.5 text-sm"><span>{it.name}</span><b className="font-semibold tabular-nums">{fq(it.qty)} {it.unit}</b></div>
                ))}
              </div>
            ))}
          </div>
        )}
        {d.groups.length === 0 && <span className="text-xs text-sub">Material ishlatilmagan</span>}
      </div>
    </div>
  );
}

function EntryHead({ uid, at, edited }: { uid: string | null; at: string; edited?: boolean }) {
  const { memberName } = useOrg();
  return (
    <div className="mb-1 flex items-center gap-2.5">
      <Avatar uid={uid} size={30} />
      <span className="text-xs"><span className="text-primary-hover">{memberName(uid)}</span><span className="ml-2.5 text-sub">{dmyhm(at)}{edited && ' *'}</span></span>
    </div>
  );
}

function CommentRow({ k, mine, canEdit, onPhoto, onChanged }: { k: HComment; mine: boolean; canEdit: boolean; onPhoto: (i: number) => void; onChanged: () => void }) {
  const [ed, setEd] = useState<string | null>(null);
  const [askDel, setAskDel] = useState(false);
  const save = useAction(() => http.patch(`/api/comments/${k.id}`, { text: ed }), { onDone: () => { setEd(null); onChanged(); } });
  const del = useAction(() => http.del(`/api/comments/${k.id}`), { onDone: () => { setAskDel(false); onChanged(); } });
  return (
    <div className="group relative border-t border-line bg-[#f7f9fa] px-4 py-3">
      <EntryHead uid={k.author_id} at={k.created_at} edited={!!k.edited_at} />
      {canEdit && mine && ed === null && (
        <span className="absolute top-2.5 right-3 flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {k.text !== null && <button type="button" onClick={() => setEd(k.text ?? '')} aria-label="Izohni tahrirlash" title="Tahrirlash" className="grid h-8 w-8 place-items-center rounded-md text-sub hover:bg-white"><Pencil size={14} /></button>}
          <button type="button" onClick={() => setAskDel(true)} aria-label="Izohni o‘chirish" title="O‘chirish" className="grid h-8 w-8 place-items-center rounded-md text-sub hover:bg-white hover:text-bad"><Trash2 size={14} /></button>
        </span>
      )}
      <div className="flex flex-col gap-2 pl-11">
        {ed !== null ? (
          <div className="flex flex-col gap-2">
            <textarea autoFocus rows={2} value={ed} onChange={(e) => setEd(e.target.value)} aria-label="Izoh matni" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEd(null)} className="h-8 px-3 text-sm text-sub">Bekor</button>
              <button type="button" onClick={() => save.mutate(undefined)} className="h-8 rounded-lg bg-primary px-3 text-sm text-white">Saqlash</button>
            </div>
          </div>
        ) : k.text && <p className="m-0 text-sm leading-relaxed whitespace-pre-wrap text-[#3d4858]">{k.text}</p>}
        {k.sticker && <span className="text-[44px] leading-none" role="img" aria-label="Stiker">{k.sticker}</span>}
        {k.files.length > 0 && <Photos files={k.files} onOpen={onPhoto} />}
      </div>
      <Confirm open={askDel} danger yes="O‘chirish" loading={del.isPending} onNo={() => setAskDel(false)} onYes={() => del.mutate(undefined)} text="Izoh va undagi rasmlar o‘chirilsinmi?" />
    </div>
  );
}

/** Raqamlangan rasmlar qatori (bosilsa katta ochiladi). */
function Photos({ files, onOpen }: { files: HFile[]; onOpen: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {files.map((f, i) => f.kind === 'image' || f.kind === 'xray' ? (
        <button key={f.id} type="button" onClick={() => onOpen(i)} aria-label={`Rasm ${i + 1}`} className="relative h-[84px] w-[118px] overflow-hidden bg-muted sm:w-[146px]">
          <img src={`/api/files/${f.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute top-0.5 right-1.5 text-[13px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">{i + 1}</span>
        </button>
      ) : (
        <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="grid h-[84px] w-[118px] place-items-center rounded bg-white p-2 text-center text-xs !text-sub no-underline ring-1 ring-line">{f.name ?? 'Fayl'}</a>
      ))}
    </div>
  );
}

function Lightbox({ files, start, onClose }: { files: HFile[]; start: number; onClose: () => void }) {
  const imgs = files.filter((f) => f.kind === 'image' || f.kind === 'xray');
  const [i, setI] = useState(Math.min(start, imgs.length - 1));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => (x + 1) % imgs.length); if (e.key === 'ArrowLeft') setI((x) => (x - 1 + imgs.length) % imgs.length); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [imgs.length, onClose]);
  if (!imgs.length) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Rasm" className="fixed inset-0 z-[3000] flex flex-col bg-[rgba(7,12,20,.92)]" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
        <span>{i + 1} / {imgs.length}</span>
        <button type="button" onClick={onClose} aria-label="Yopish" className="grid h-10 w-10 place-items-center rounded-full text-white hover:bg-white/10"><X size={22} /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6" onClick={(e) => e.stopPropagation()}>
        {imgs.length > 1 && <button type="button" onClick={() => setI((i - 1 + imgs.length) % imgs.length)} aria-label="Oldingi" className="absolute left-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft size={26} /></button>}
        <img src={`/api/files/${imgs[i]!.id}`} alt="" className="max-h-full max-w-full object-contain" />
        {imgs.length > 1 && <button type="button" onClick={() => setI((i + 1) % imgs.length)} aria-label="Keyingi" className="absolute right-2 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight size={26} /></button>}
      </div>
    </div>
  );
}

function PhotoButton({ onPick }: { onPick: (f: File[]) => void }) {
  return (
    <label className="grid h-9 w-9 cursor-pointer place-items-center rounded-md text-sub hover:bg-muted hover:text-fg" title="Rasm qo‘shish" aria-label="Rasm qo‘shish">
      <Camera size={18} />
      <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { if (e.target.files?.length) onPick(Array.from(e.target.files)); e.target.value = ''; }} />
    </label>
  );
}

function PickedPhotos({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((u, i) => (
        <span key={u} className="relative h-16 w-20 overflow-hidden rounded-md bg-muted">
          <img src={u} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label="Rasmni olib tashlash" className="absolute top-0.5 right-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"><X size={13} /></button>
        </span>
      ))}
    </div>
  );
}

/** Kartaning pastidagi "Izoh yozing…" maydoni: matn, stiker va rasmlar. */
function Composer({ p, recordId, onSent }: { p: Patient; recordId: string; onSent: () => void }) {
  const [text, setText] = useState('');
  const [pics, setPics] = useState<File[]>([]);
  const [stick, setStick] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const send = useAction(async (sticker?: string) => {
    if (!text.trim() && !pics.length && !sticker) return null;
    const k = await http.post<{ id: string }>(`/api/records/${recordId}/comments`, { text: text.trim() || null, sticker: sticker ?? null, files: pics.length > 0 });
    if (pics.length) await uploadFiles(p.id, recordId, k.id, pics);
    return k;
  }, { onDone: (k) => { if (!k) return; setText(''); setPics([]); setStick(false); onSent(); } });
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; } }, [text]);
  const has = !!text.trim() || pics.length > 0;
  return (
    <div className="relative border-t border-line bg-white px-4 py-2">
      <PickedPhotos files={pics} onChange={setPics} />
      <div className="flex items-end gap-1">
        <textarea ref={ta} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Izoh yozing…" aria-label="Izoh yozing"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send.mutate(undefined); } }}
          className="min-h-9 flex-1 resize-none border-0 bg-transparent py-2 text-sm outline-none placeholder:text-faint" />
        <button type="button" onClick={() => setStick(!stick)} aria-expanded={stick} aria-label="Stiker qo‘yish" title="Stiker"
          className={cx('grid h-9 w-9 place-items-center rounded-md hover:bg-muted', stick ? 'text-primary' : 'text-sub')}><Smile size={18} /></button>
        <PhotoButton onPick={(fs) => setPics([...pics, ...fs])} />
        {has && <button type="button" disabled={send.isPending} onClick={() => send.mutate(undefined)} aria-label="Yuborish" title="Yuborish (Enter)"
          className="grid h-9 w-9 place-items-center rounded-md bg-primary text-white disabled:opacity-60"><SendHorizontal size={17} /></button>}
      </div>
      {stick && (
        <div role="group" aria-label="Stikerlar" className="absolute right-3 bottom-12 z-20 grid w-[288px] grid-cols-6 gap-1 rounded-xl border border-line bg-white p-2 shadow-pop">
          {STICKERS.map((s) => (
            <button key={s} type="button" onClick={() => send.mutate(s)} aria-label={`Stiker ${s}`} className="h-11 rounded-lg text-2xl hover:bg-muted">{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

