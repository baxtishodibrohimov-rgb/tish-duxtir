import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Users, Wallet, Package, ChartColumn, Settings, Building2, Check, User, LogOut, UserPlus, Clock3, Bell, X, ChevronDown, Plus, Pencil } from 'lucide-react';
import { Link, navigate, useLocation } from '@/lib/router';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { db } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import { addDays, hm, initials, isoDate, dmy } from '@/lib/format';
import { cx } from './ui';
import type { Perm, Reminder, WaitItem } from '@/lib/types';

const NAV: { label: string; to: string; icon: typeof Users; perm: Perm | null }[] = [
  { label: 'Jadval', to: '/', icon: CalendarDays, perm: 'schedule.view' },
  { label: 'Bemorlar', to: '/patients', icon: Users, perm: 'patients.view' },
  { label: 'Kassa', to: '/cashbox', icon: Wallet, perm: 'cashbox.view' },
  { label: 'Ombor', to: '/warehouse', icon: Package, perm: 'warehouse.view' },
  { label: 'Hisobotlar', to: '/reports', icon: ChartColumn, perm: 'reports.view' },
  { label: 'Sozlamalar', to: '/settings', icon: Settings, perm: null },
];

const BR_DOTS = ['#00a1db', '#15803d', '#d97706', '#7c3aed', '#db2777', '#0f766e'];
export const AUDIENCE: Record<Reminder['audience'], string> = { me: 'Men', admins: 'Administratorlar', owners: 'Rahbarlar' };

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open, close]);
  return ref;
}

const POP = 'absolute top-9 right-0 z-[60] flex w-[380px] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-xl border border-line bg-white p-3 shadow-pop';
const MINI = 'h-8 min-w-0 rounded-lg border border-line bg-white px-2 text-[13px]';
const Count = ({ n, tone }: { n: number; tone: string }) => n > 0
  ? <span className={cx('absolute top-px right-0 h-3.5 min-w-3.5 rounded-full px-[3px] text-center text-[9px] leading-[14px] font-bold text-white', tone)}>{n}</span> : null;

export function Header() {
  const { path } = useLocation();
  const { user, me, org, branches, branch, setBranch, can, signOut, refresh } = useAuth();
  const [adding, setAdding] = useState<string | null>(null);
  const addBranch = useAction((name: string) => db.insert<{ id: string }>('branches', { name, position: branches.length }),
    { success: 'Filial qo‘shildi', onDone: async (b) => { setAdding(null); setBrMenu(false); await refresh(); setBranch(b.id); } });
  const [ren, setRen] = useState<{ id: string; name: string } | null>(null);
  const renBranch = useAction(({ id, name }: { id: string; name: string }) => db.update('branches', id, { name }),
    { success: 'Filial nomi o‘zgartirildi', onDone: async () => { setRen(null); await refresh(); } });
  const [menu, setMenu] = useState(false);
  const [brMenu, setBrMenu] = useState(false);
  const [quick, setQuick] = useState<'queue' | 'reminders' | null>(null);
  const menuRef = useOutside(menu, () => setMenu(false));
  const brRef = useOutside(brMenu, () => setBrMenu(false));
  const quickRef = useOutside(quick !== null, () => setQuick(null));
  const active = (to: string) => (to === '/' ? path === '/' : path.startsWith(to) && !(to === '/patients' && path === '/patients/new'));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 px-4">
        <div ref={brRef} className="relative">
          <button type="button" onClick={() => { setBrMenu(!brMenu); setAdding(null); setRen(null); }} aria-haspopup="menu" aria-expanded={brMenu} aria-label="Filialni tanlash" title="Filialni tanlash"
            className={cx('flex h-8 items-center gap-1.5 rounded-full pr-2 pl-[3px]', brMenu ? 'bg-[#e6f6fc]' : 'hover:bg-muted')}>
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-primary-soft"><Building2 size={15} className="text-primary" /></span>
            <span className="max-w-[150px] truncate text-[13px] font-semibold">{branch?.name}</span>
            <ChevronDown size={14} className="text-sub" />
          </button>
          {brMenu && (
            <div role="menu" aria-label="Filiallar" className="absolute top-10 left-0 z-[300] w-[300px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-line bg-white shadow-[0_16px_40px_-12px_rgba(7,18,30,.3)]">
              <div className="flex flex-col gap-0.5 border-b border-line bg-surface px-4 pt-3.5 pb-3">
                <span className="text-xs text-sub">{org?.name} · joriy filial</span>
                <span className="text-[17px] font-bold">{branch?.name}</span>
              </div>
              <div className="flex flex-col p-1.5">
                {branches.map((b, i) => {
                  const on = b.id === branch?.id;
                  if (ren?.id === b.id) return (
                    <form key={b.id} className="flex items-center gap-1.5 px-1 py-1" onSubmit={(e) => { e.preventDefault(); const n = ren.name.trim(); if (n && n !== b.name) renBranch.mutate({ id: b.id, name: n }); else setRen(null); }}>
                      <input autoFocus aria-label="Filial nomi" value={ren.name} onChange={(e) => setRen({ id: b.id, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRen(null); } }}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-primary px-2.5 text-sm focus:outline-none" />
                      <button type="submit" aria-label="Saqlash" title="Saqlash" disabled={!ren.name.trim() || renBranch.isPending}
                        className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary text-white disabled:opacity-50"><Check size={16} /></button>
                      <button type="button" aria-label="Bekor qilish" title="Bekor qilish" onClick={() => setRen(null)}
                        className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-sub"><X size={16} /></button>
                    </form>
                  );
                  return (
                    <div key={b.id} className={cx('group flex min-h-10 items-center rounded-lg', on ? 'bg-[#e6f6fc]' : 'hover:bg-muted')}>
                      <button type="button" role="menuitemradio" aria-checked={on} onClick={() => { setBranch(b.id); setBrMenu(false); }}
                        className={cx('flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left text-sm', on && 'font-semibold')}>
                        <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: BR_DOTS[i % BR_DOTS.length] }} />
                        <span className="flex-1 truncate">{b.name}</span>
                        {on && <Check size={16} className="text-primary" />}
                      </button>
                      {can('settings.edit') && (
                        <button type="button" aria-label={`${b.name} nomini tahrirlash`} title="Nomini tahrirlash" onClick={() => { setRen({ id: b.id, name: b.name }); setAdding(null); }}
                          className="mr-1 grid h-8 w-8 flex-none place-items-center rounded-md text-sub hover:bg-white hover:text-primary"><Pencil size={14} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
              {can('settings.edit') && (
                <div className="border-t border-line px-2.5 pt-2 pb-2.5">
                  {adding !== null ? (
                    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (adding.trim()) addBranch.mutate(adding.trim()); }}>
                      <label htmlFor="brNew" className="text-xs text-sub">Yangi filial nomi</label>
                      <input id="brNew" autoFocus placeholder="Masalan: Chilonzor" value={adding} onChange={(e) => setAdding(e.target.value)} className="h-9 rounded-lg border border-line px-2.5 text-sm" />
                      <div className="flex gap-1.5">
                        <button type="submit" disabled={!adding.trim() || addBranch.isPending} className="h-9 flex-1 rounded-lg bg-primary text-sm font-medium text-white">Qo‘shish</button>
                        <button type="button" onClick={() => setAdding(null)} className="h-9 rounded-lg border border-line px-3 text-sm text-sub">Bekor</button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setAdding('')} className="flex h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary bg-[#f2fbff] text-sm font-semibold text-primary-hover">
                      <Plus size={16} /> Filial qo‘shish
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="hidden flex-wrap items-center gap-1 md:flex">
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <Link key={n.to} to={n.to}
              className={cx('inline-flex h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium whitespace-nowrap no-underline',
                active(n.to) ? 'bg-nav !text-nav-fg' : '!text-sub hover:bg-muted hover:!text-fg')}>
              <n.icon size={16} />
              <span>{n.label}</span>
            </Link>
          ))}
          {branch && can('patients.edit') && (
            <Link to="/patients/new" aria-label="Yangi bemor" title="Yangi bemor"
              className={cx('inline-grid h-[30px] w-[34px] place-items-center rounded-[10px] !text-primary no-underline', path === '/patients/new' ? 'bg-nav' : 'hover:bg-muted')}>
              <UserPlus size={18} />
            </Link>
          )}
        </nav>

        <div ref={quickRef} className="relative ml-auto flex items-center gap-1">
          {branch && can('patients.edit') && (
            <Link to="/patients/new" aria-label="Yangi bemor" title="Yangi bemor"
              className={cx('grid h-10 w-10 place-items-center rounded-full !text-primary no-underline md:hidden', path === '/patients/new' ? 'bg-nav' : 'hover:bg-muted')}>
              <UserPlus size={18} />
            </Link>
          )}
          {branch && can('schedule.view') && <Queue open={quick === 'queue'} onToggle={() => setQuick(quick === 'queue' ? null : 'queue')} onClose={() => setQuick(null)} />}
          {branch && can('patients.view') && <Reminders open={quick === 'reminders'} onToggle={() => setQuick(quick === 'reminders' ? null : 'reminders')} />}
        </div>

        <div ref={menuRef} className="relative">
          <button type="button" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}
            aria-label={`Mening profilim: ${user?.full_name ?? ''}`} title={user?.full_name}
            className="grid h-10 w-10 md:h-[30px] md:w-[30px] place-items-center rounded-full">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-nav text-xs font-semibold text-nav-fg">
              {initials(user?.full_name ?? '')}
            </span>
          </button>
          {menu && (
            <div role="menu" className="absolute top-9 right-0 z-[60] w-[220px] rounded-xl border border-line bg-white p-1.5 shadow-pop">
              <div className="mb-1 border-b border-line px-2.5 pt-2 pb-2.5">
                <div className="text-sm font-semibold">{user?.full_name}</div>
                <div className="text-xs text-sub">{me ? ROLE_LABEL[me.role] : ''}</div>
              </div>
              <button role="menuitem" onClick={() => { setMenu(false); navigate('/settings'); }}
                className="flex h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-muted">
                <User size={16} /> Mening profilim
              </button>
              <button role="menuitem" onClick={() => { setMenu(false); void signOut(); }}
                className="flex h-[34px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-[#e62b34] hover:bg-muted">
                <LogOut size={16} /> Chiqish
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Telefon va kichik planshet: asosiy bo'limlar pastdagi panelda (barmoq bilan bosish qulay). */}
      <nav aria-label="Asosiy bo‘limlar" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(7,18,30,.06)] md:hidden print:hidden">
        {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => {
          const on = active(n.to);
          return (
            <Link key={n.to} to={n.to} aria-current={on ? 'page' : undefined}
              className={cx('flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-medium no-underline', on ? '!text-primary-hover' : '!text-sub')}>
              <span className={cx('grid h-7 w-12 place-items-center rounded-full', on && 'bg-[#e6f6fc]')}><n.icon size={19} /></span>
              <span className="max-w-full truncate">{SHORT[n.label] ?? n.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
const SHORT: Record<string, string> = { Hisobotlar: 'Hisobot', Sozlamalar: 'Sozlama' };

/** Kutish navbati: bo'sh vaqt chiqsa, shu yerdan qabulga yoziladi. */
function Queue({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const { branch, members, memberName, can } = useAuth();
  const list = useList<WaitItem>('waiting_list', { branch_id: branch!.id });
  const doctors = members.filter((m) => m.is_active && ['doctor', 'owner'].includes(m.role));
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const add = useAction(() => db.insert('waiting_list', { branch_id: branch!.id, patient_name: name.trim(), doctor_id: doc || doctors[0]?.user_id || null }),
    { invalidate: ['waiting_list'], onDone: () => setName('') });
  const del = useAction((id: string) => db.remove('waiting_list', id), { invalidate: ['waiting_list'] });
  const rows = list.data ?? [];
  const short = (uid: string | null) => { const p = memberName(uid).split(' '); return p.length > 1 ? `${p[1]} ${p[0]![0]}.` : p[0]; };
  return (
    <>
      <button type="button" onClick={onToggle} aria-haspopup="dialog" aria-expanded={open} aria-label="Kutish navbati" title="Kutish navbati"
        className={cx('relative grid h-10 w-10 md:h-[30px] md:w-[30px] place-items-center rounded-full text-sub hover:bg-muted hover:text-fg', open && 'bg-muted text-fg')}>
        <Clock3 size={18} />
        <Count n={rows.length} tone="bg-primary" />
      </button>
      {open && (
        <div role="dialog" aria-label="Kutish navbati" className={POP}>
          <div className="flex items-center justify-between gap-3"><b className="text-sm font-semibold">Kutish navbati</b><span className="text-xs text-sub">Bo‘sh vaqt chiqsa, shu yerdan yoziladi</span></div>
          {rows.map((q) => (
            <div key={q.id} className="flex items-center gap-2 border-t border-muted py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{q.patient_name || '—'}</span>
                <span className="text-xs text-sub">{q.doctor_id ? short(q.doctor_id) : '—'} · {q.comment || 'Navbatda'}</span>
              </span>
              {can('schedule.edit', branch!.id) && (
                <button type="button" onClick={() => { onClose(); navigate(`/?wait=${q.id}`); }}
                  className="h-7 rounded-lg bg-primary-soft px-2.5 text-xs font-medium whitespace-nowrap text-[#006b93]">Qabulga yozish</button>
              )}
              <button type="button" onClick={() => del.mutate(q.id)} aria-label="Navbatdan olib tashlash" title="Bekor qilish"
                className="grid h-[26px] w-[26px] place-items-center rounded-md text-faint hover:bg-muted"><X size={14} /></button>
            </div>
          ))}
          {rows.length === 0 && <span className="py-2 text-[13px] text-sub">Navbat bo‘sh</span>}
          <form className="flex gap-1.5 border-t border-muted pt-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(undefined); }}>
            <input aria-label="Bemor" placeholder="Bemor ismi" value={name} onChange={(e) => setName(e.target.value)} className={cx(MINI, 'flex-1')} />
            <select aria-label="Shifokor" value={doc} onChange={(e) => setDoc(e.target.value)} className={MINI}>
              {doctors.map((d) => <option key={d.user_id} value={d.user_id}>{short(d.user_id)}</option>)}
            </select>
            <button type="submit" disabled={!name.trim() || add.isPending} className="h-8 rounded-lg bg-primary px-2.5 text-[13px] font-medium text-white">Qo‘shish</button>
          </form>
        </div>
      )}
    </>
  );
}

/** Eslatmalar: bugungi va o'tib ketganlar. */
function Reminders({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { me, can } = useAuth();
  const tomorrow = isoDate(addDays(new Date(), 1));
  const list = useList<Reminder>('reminders', { 'remind_at.lt': new Date(tomorrow + 'T00:00:00').toISOString(), 'status.in': ['planned', 'done'] }, { order: 'remind_at' });
  const [text, setText] = useState('');
  const [aud, setAud] = useState<Reminder['audience']>('me');
  const add = useAction(() => db.insert('reminders', { comment: text.trim(), audience: aud, assigned_to: aud === 'me' ? me?.user_id : null, remind_at: new Date().toISOString() }),
    { invalidate: ['reminders'], onDone: () => setText('') });
  const toggle = useAction((r: Reminder) => db.update('reminders', r.id, { status: r.status === 'done' ? 'planned' : 'done' }), { invalidate: ['reminders'] });
  const mine = (r: Reminder) => r.audience === 'me' ? (r.assigned_to ?? r.created_by) === me?.user_id
    : r.audience === 'owners' ? me?.role === 'owner' : ['owner', 'admin', 'curator'].includes(me?.role ?? '');
  const today = isoDate(new Date());
  const rows = (list.data ?? []).filter((r) => mine(r) && (r.status === 'planned' || r.remind_at.slice(0, 10) >= today));
  const when = (s: string) => { const d = isoDate(new Date(s)); return d === today ? `Bugun ${hm(s)}` : d === isoDate(addDays(new Date(), -1)) ? 'Kecha' : dmy(s); };
  const open_ = rows.filter((r) => r.status !== 'done').length;
  return (
    <>
      <button type="button" onClick={onToggle} aria-haspopup="dialog" aria-expanded={open} aria-label="Eslatmalar" title="Eslatmalar"
        className={cx('relative grid h-10 w-10 md:h-[30px] md:w-[30px] place-items-center rounded-full text-sub hover:bg-muted hover:text-fg', open && 'bg-muted text-fg')}>
        <Bell size={18} />
        <Count n={open_} tone="bg-bad" />
      </button>
      {open && (
        <div role="dialog" aria-label="Eslatmalar" className={POP}>
          <div className="flex items-center justify-between gap-3"><b className="text-sm font-semibold">Eslatmalar</b><span className="text-xs text-sub">Bugun va o‘tib ketganlar</span></div>
          {rows.map((r) => (
            <label key={r.id} className="flex items-start gap-2 border-t border-muted py-2">
              <input type="checkbox" aria-label="Bajarildi" checked={r.status === 'done'} disabled={!can('patients.edit')} onChange={() => toggle.mutate(r)} className="mt-[3px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className={cx('text-sm', r.status === 'done' ? 'text-faint line-through' : 'text-fg')}>{r.comment || '—'}</span>
                <span className="text-xs text-sub">{when(r.remind_at)} · {AUDIENCE[r.audience]}</span>
              </span>
            </label>
          ))}
          {rows.length === 0 && <span className="py-2 text-[13px] text-sub">Eslatma yo‘q</span>}
          {can('patients.edit') && (
            <form className="flex gap-1.5 border-t border-muted pt-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(undefined); }}>
              <input aria-label="Eslatma matni" placeholder="Masalan: bemorga qo‘ng‘iroq qilish" value={text} onChange={(e) => setText(e.target.value)} className={cx(MINI, 'flex-1')} />
              <select aria-label="Mas’ul" value={aud} onChange={(e) => setAud(e.target.value as Reminder['audience'])} className={MINI}>
                {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="submit" disabled={!text.trim() || add.isPending} aria-label="Qo‘shish" className="h-8 rounded-lg bg-primary px-2.5 text-[13px] font-medium text-white">+</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
