import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, must } from './supabase';
import type { Clinic, Member, Perm, Role } from './types';

// Bazadagi role_default_perm() bilan bir xil bo'lishi shart.
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
  { key: 'schedule.view', label: 'Jadvalni ko‘rish' },
  { key: 'schedule.edit', label: 'Jadvalga yozish' },
  { key: 'patients.view', label: 'Bemorlarni ko‘rish' },
  { key: 'patients.edit', label: 'Bemorlarni tahrirlash' },
  { key: 'cashbox.view', label: 'Kassani ko‘rish' },
  { key: 'cashbox.edit', label: 'Kassa amallari' },
  { key: 'warehouse.view', label: 'Omborni ko‘rish' },
  { key: 'warehouse.edit', label: 'Nakladnoylar' },
  { key: 'warehouse.admin', label: 'Ombor sozlamalari' },
  { key: 'reports.view', label: 'Hisobotlar' },
  { key: 'settings.edit', label: 'Klinika sozlamalari' },
  { key: 'staff.manage', label: 'Xodimlarni boshqarish' },
];

export function memberCan(m: Member | null | undefined, p: Perm): boolean {
  if (!m) return false;
  if (m.role === 'owner') return true;
  if (p in m.permissions) return Boolean(m.permissions[p]);
  const d = ROLE_PERMS[m.role];
  return d === 'all' || d.includes(p);
}

interface AuthValue {
  session: Session | null;
  loading: boolean;
  clinic: Clinic | null;
  member: Member | null;
  members: Member[];
  can: (p: Perm) => boolean;
  refresh: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); qc.clear(); });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id;
  const ctx = useQuery({
    queryKey: ['auth-ctx', uid],
    enabled: !!uid,
    queryFn: async () => {
      const mine = must(await supabase.from('clinic_members').select('*').eq('user_id', uid!).eq('is_active', true)) as Member[];
      // Bir nechta klinika bo'lsa — oxirgi tanlangani (localStorage).
      let pick = mine[0];
      try {
        const saved = localStorage.getItem('td-clinic');
        pick = mine.find((m) => m.clinic_id === saved) ?? pick;
      } catch { /* localStorage yo'q bo'lishi mumkin */ }
      if (!pick) return { clinic: null, member: null, members: [] as Member[] };
      const clinic = must(await supabase.from('clinics').select('*').eq('id', pick.clinic_id).single()) as Clinic;
      const members = must(await supabase.from('clinic_members').select('*').eq('clinic_id', clinic.id).order('created_at')) as Member[];
      return { clinic, member: pick, members };
    },
  });

  const value = useMemo<AuthValue>(() => ({
    session,
    loading: !ready || (!!uid && ctx.isLoading),
    clinic: ctx.data?.clinic ?? null,
    member: ctx.data?.member ?? null,
    members: ctx.data?.members ?? [],
    can: (p) => memberCan(ctx.data?.member, p),
    refresh: () => { void ctx.refetch(); },
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, ready, uid, ctx]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth faqat AuthProvider ichida');
  return v;
}

/** Klinika ichidagi sahifalar uchun: klinika aniq mavjud. */
export function useClinic() {
  const a = useAuth();
  if (!a.clinic || !a.member) throw new Error('Klinika tanlanmagan');
  return { ...a, clinic: a.clinic, member: a.member };
}
