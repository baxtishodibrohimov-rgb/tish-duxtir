// Bazadagi role_default_perm() bilan bir xil bo'lishi shart.
export type Role = 'owner' | 'doctor' | 'assistant' | 'admin' | 'curator' | 'storekeeper';
export type Perm =
  | 'schedule.view' | 'schedule.edit' | 'patients.view' | 'patients.edit'
  | 'cashbox.view' | 'cashbox.edit' | 'warehouse.view' | 'warehouse.edit' | 'warehouse.admin'
  | 'reports.view' | 'settings.edit' | 'staff.manage';

export const ROLES: Role[] = ['owner', 'doctor', 'assistant', 'admin', 'curator', 'storekeeper'];
export const PERMS: Perm[] = ['schedule.view', 'schedule.edit', 'patients.view', 'patients.edit', 'cashbox.view', 'cashbox.edit',
  'warehouse.view', 'warehouse.edit', 'warehouse.admin', 'reports.view', 'settings.edit', 'staff.manage'];

const DEFAULTS: Record<Role, Perm[] | 'all'> = {
  owner: 'all',
  admin: ['schedule.view', 'schedule.edit', 'patients.view', 'patients.edit', 'cashbox.view', 'cashbox.edit', 'warehouse.view', 'reports.view'],
  curator: ['schedule.view', 'patients.view', 'patients.edit', 'cashbox.view', 'cashbox.edit'],
  doctor: ['schedule.view', 'schedule.edit', 'patients.view', 'patients.edit', 'warehouse.view'],
  assistant: ['schedule.view', 'patients.view', 'warehouse.view'],
  storekeeper: ['warehouse.view', 'warehouse.edit', 'warehouse.admin'],
};

export interface MemberCtx {
  id: string; org_id: string; user_id: string; role: Role; full_name: string;
  permissions: Partial<Record<Perm, boolean>>; all_branches: boolean;
  branch_ids: string[];        // kirish mumkin bo'lgan filiallar
}

export function can(m: MemberCtx, p: Perm, branchId?: string | null): boolean {
  let ok: boolean;
  if (m.role === 'owner') ok = true;
  else if (p in m.permissions) ok = Boolean(m.permissions[p]);
  else { const d = DEFAULTS[m.role]; ok = d === 'all' || d.includes(p); }
  if (!ok) return false;
  if (branchId) return m.branch_ids.includes(branchId);
  return true;
}
