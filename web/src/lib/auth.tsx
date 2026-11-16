import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { http, ApiError } from './api';
import type { Branch, Member, Org, Perm, Role, User } from './types';

// server/src/perms.ts bilan bir xil.
const ROLE_PERMS: Record<Role, Perm[] | 'all'> = {
  owner: 'all',
  admin: ['schedule.view', 'schedule.edit', 'patients.view', 'patients.edit', 'cashbox.view', 'cashbox.edit', 'warehouse.view', 'reports.view'],
  curator: ['schedule.view', 'patients.view', 'patients.edit', 'cashbox.view', 'cashbox.edit'],
  doctor: ['schedule.view', 'schedule.edit', 'patients.view', 'patients.edit', 'warehouse.view'],
  assistant: ['schedule.view', 'patients.view', 'warehouse.view'],
  storekeeper: ['warehouse.view', 'warehouse.edit', 'warehouse.admin'],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Egasi', doctor: 'Shifokor', assistant: 'Assistent', admin: 'Administrator', curator: 'Kurator', storekeeper: 'Omborchi',
};

export const ALL_PERMS: { key: Perm; label: string }[] = [
  { key: 'schedule.view', label: 'Jadvalni ko‘rish' }, { key: 'schedule.edit', label: 'Jadvalga yozish' },
  { key: 'patients.view', label: 'Bemorlarni ko‘rish' }, { key: 'patients.edit', label: 'Bemorlarni tahrirlash' },
  { key: 'cashbox.view', label: 'Kassani ko‘rish' }, { key: 'cashbox.edit', label: 'Kassa amallari' },
  { key: 'warehouse.view', label: 'Omborni ko‘rish' }, { key: 'warehouse.edit', label: 'Nakladnoylar' },
  { key: 'warehouse.admin', label: 'Ombor sozlamalari' }, { key: 'reports.view', label: 'Hisobotlar' },
  { key: 'settings.edit', label: 'Klinika sozlamalari' }, { key: 'staff.manage', label: 'Xodimlarni boshqarish' },
];

export function roleDefault(role: Role, p: Perm) {
  const d = ROLE_PERMS[role];
  return d === 'all' || d.includes(p);
}

interface MeResponse {
  user: User;
  member: (Member & { org_id: string }) | null;
  org: Org | null;
  branches: Branch[];
  members: Member[];
}

interface AuthValue {
  user: User | null;
  loading: boolean;
  org: Org | null;
  me: Member | null;
  members: Member[];
  branches: Branch[];
  branch: Branch | null;
  setBranch: (id: string) => void;
  can: (p: Perm, branchId?: string) => boolean;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
  memberName: (userId: string | null | undefined) => string;
}

const Ctx = createContext<AuthValue | null>(null);
const BRANCH_KEY = 'td-branch';

function readBranch() { try { return localStorage.getItem(BRANCH_KEY); } catch { return null; } }

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState<string | null>(readBranch);

  const me = useQuery({
    queryKey: ['me'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try { return await http.get<MeResponse>('/api/me'); }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
  });

  const value = useMemo<AuthValue>(() => {
    const d = me.data;
    const member = d?.member ?? null;
    const branches = d?.branches ?? [];
    const branch = branches.find((b) => b.id === branchId) ?? branches[0] ?? null;
    const byUser = new Map((d?.members ?? []).map((m) => [m.user_id, m.full_name]));
    return {
      user: d?.user ?? null,
      loading: me.isLoading,
      org: d?.org ?? null,
      me: member,
      members: d?.members ?? [],
      branches,
      branch,
      setBranch: (id) => { setBranchId(id); try { localStorage.setItem(BRANCH_KEY, id); } catch { /* yo'q */ } },
      can: (p, bid) => {
        if (!member) return false;
        const ok = member.role === 'owner' ? true : p in member.permissions ? Boolean(member.permissions[p]) : roleDefault(member.role, p);
        if (!ok) return false;
        return !bid || branches.some((b) => b.id === bid);
      },
      refresh: () => me.refetch(),
      signOut: async () => { await http.post('/api/auth/logout'); qc.clear(); await me.refetch(); },
      memberName: (uid) => (uid ? byUser.get(uid) ?? '—' : '—'),
    };
  }, [me, branchId, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth faqat AuthProvider ichida');
  return v;
}

/** Klinika ichidagi sahifalar uchun: tashkilot va filial aniq mavjud. */
export function useOrg() {
  const a = useAuth();
  if (!a.org || !a.me || !a.branch) throw new Error('Filial tanlanmagan');
  return { ...a, org: a.org, me: a.me, branch: a.branch };
}
