import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Users, Wallet, Package, ChartColumn, Settings, Building2, Check, User, LogOut, UserPlus, Clock3, Bell } from 'lucide-react';
import { Link, navigate, useLocation } from '@/lib/router';
import { useAuth, ROLE_LABEL } from '@/lib/auth';
import { useList } from '@/lib/hooks';
import { initials } from '@/lib/format';
import { cx } from './ui';
import { PatientForm } from './PatientForm';
import type { Perm, Visit } from '@/lib/types';

interface Reminder { id: string; status: string }

const NAV: { label: string; to: string; icon: typeof Users; perm: Perm | null }[] = [
  { label: 'Jadval', to: '/', icon: CalendarDays, perm: 'schedule.view' },
  { label: 'Bemorlar', to: '/patients', icon: Users, perm: 'patients.view' },
  { label: 'Kassa', to: '/cashbox', icon: Wallet, perm: 'cashbox.view' },
  { label: 'Ombor', to: '/warehouse', icon: Package, perm: 'warehouse.view' },
  { label: 'Hisobotlar', to: '/reports', icon: ChartColumn, perm: 'reports.view' },
  { label: 'Sozlamalar', to: '/settings', icon: Settings, perm: null },
];

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

export function Header() {
  const { path } = useLocation();
  const { user, me, org, branches, branch, setBranch, can, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [brMenu, setBrMenu] = useState(false);
  const [newPatient, setNewPatient] = useState(false);
  const waiting = useList<Visit>('visits', { branch_id: branch?.id, status: 'arrived' }, { enabled: !!branch });
  const reminders = useList<Reminder>('reminders', { status: 'pending' });
  const menuRef = useOutside(menu, () => setMenu(false));
  const brRef = useOutside(brMenu, () => setBrMenu(false));
  const active = (to: string) => (to === '/' ? path === '/' : path.startsWith(to));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1 px-4">
        <div ref={brRef} className="relative">
          <button type="button" onClick={() => setBrMenu(!brMenu)} aria-haspopup="menu" aria-expanded={brMenu}
            title={`${org?.name ?? ''} · ${branch?.name ?? ''}`}
            className="flex h-[30px] items-center gap-1.5 rounded-full pr-2 hover:bg-muted">
            <span className="grid h-[30px] w-[30px] place-items-center">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft">
                <Building2 size={15} className="text-primary" />
              </span>
            </span>
            {branches.length > 1 && <span className="max-w-[140px] truncate text-[13px] font-medium text-sub">{branch?.name}</span>}
          </button>
          {brMenu && (
            <div role="menu" className="absolute top-9 left-0 z-50 w-60 rounded-xl border border-line bg-white p-1.5 shadow-pop">
              <div className="border-b border-line px-2.5 pt-1.5 pb-2 text-sm font-semibold">{org?.name}</div>
              <div className="px-2.5 pt-2 pb-1 text-xs text-sub">Filial</div>
              {branches.map((b) => (
                <button key={b.id} role="menuitemradio" aria-checked={b.id === branch?.id}
                  onClick={() => { setBranch(b.id); setBrMenu(false); }}
                  className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm hover:bg-muted">
                  {b.name}
                  {b.id === branch?.id && <Check size={16} className="text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <Link key={n.to} to={n.to}
              className={cx('inline-flex h-[30px] items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium whitespace-nowrap no-underline',
                active(n.to) ? 'bg-nav !text-nav-fg' : '!text-sub hover:bg-muted hover:!text-fg')}>
              <n.icon size={16} />
              <span>{n.label}</span>
            </Link>
          ))}
          {can('patients.edit') && (
            <button type="button" onClick={() => setNewPatient(true)} aria-label="Yangi bemor" title="Yangi bemor"
              className="inline-grid h-[30px] w-[34px] place-items-center rounded-[10px] text-primary hover:bg-primary-soft">
              <UserPlus size={18} />
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {can('schedule.view') && (
            <button type="button" onClick={() => navigate('/')} aria-label="Kutish navbati" title="Kutish navbati"
              className="relative grid h-[30px] w-[30px] place-items-center rounded-full text-sub hover:bg-muted hover:text-fg">
              <Clock3 size={18} />
              {(waiting.data?.length ?? 0) > 0 && <span className="absolute top-0 right-[-1px] grid h-[14px] min-w-[14px] place-items-center rounded-full bg-primary px-[3px] text-[9px] leading-none font-bold text-white">{waiting.data!.length}</span>}
            </button>
          )}
          {can('patients.view') && (
            <button type="button" onClick={() => navigate('/patients')} aria-label="Eslatmalar" title="Eslatmalar"
              className="relative grid h-[30px] w-[30px] place-items-center rounded-full text-sub hover:bg-muted hover:text-fg">
              <Bell size={18} />
              {(reminders.data?.length ?? 0) > 0 && <span className="absolute top-0 right-[-1px] grid h-[14px] min-w-[14px] place-items-center rounded-full bg-bad px-[3px] text-[9px] leading-none font-bold text-white">{reminders.data!.length}</span>}
            </button>
          )}
        <div ref={menuRef} className="relative">
          <button type="button" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}
            aria-label={`Mening profilim: ${user?.full_name ?? ''}`} title={user?.full_name}
            className="grid h-[30px] w-[30px] place-items-center rounded-full">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-nav text-xs font-semibold text-nav-fg">
              {initials(user?.full_name ?? '')}
            </span>
          </button>
          {menu && (
            <div role="menu" className="absolute top-9 right-0 z-50 w-[220px] rounded-xl border border-line bg-white p-1.5 shadow-pop">
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
      </div>
      {newPatient && branch && <PatientForm branchId={branch.id} onClose={() => setNewPatient(false)} />}
    </header>
  );
}
