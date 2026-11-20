import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { match, useLocation } from './lib/router';
import { Header } from './components/Header';
import { Empty, ErrorBox, PageLoader } from './components/ui';
import { Login } from './pages/Login';
import { Schedule } from './pages/Schedule';
import { Patients } from './pages/Patients';
import { PatientCard } from './pages/PatientCard';
import { NewPatient } from './pages/NewPatient';
import { Assistant } from './pages/Assistant';
import { Cashbox } from './pages/Cashbox';
import { Warehouse } from './pages/warehouse/Warehouse';
import { Reports, ReportPage } from './pages/Reports';
import { Settings } from './pages/Settings';
import type { Perm } from './lib/types';

const ROUTES: { path: string; perm: Perm | null; render: (p: Record<string, string>) => ReactNode }[] = [
  { path: '/', perm: 'schedule.view', render: () => <Schedule /> },
  { path: '/patients', perm: 'patients.view', render: () => <Patients /> },
  { path: '/patients/new', perm: 'patients.edit', render: () => <NewPatient /> },
  { path: '/patients/:id', perm: 'patients.view', render: (p) => <PatientCard id={p.id!} /> },
  { path: '/cashbox', perm: 'cashbox.view', render: () => <Cashbox /> },
  { path: '/warehouse', perm: 'warehouse.view', render: () => <Warehouse /> },
  { path: '/reports', perm: 'reports.view', render: () => <Reports /> },
  { path: '/reports/:slug', perm: 'reports.view', render: (p) => <ReportPage slug={p.slug!} /> },
  { path: '/ai', perm: null, render: () => <Assistant /> },
  { path: '/settings', perm: null, render: () => <Settings /> },
];

export function App() {
  const { user, loading, me, branch, can } = useAuth();
  const { path } = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Login />;
  if (!me || !branch) {
    return <Empty>Siz hech qaysi klinika yoki filialga biriktirilmagansiz. Klinika rahbariga murojaat qiling.</Empty>;
  }

  let page: ReactNode = <Empty>Sahifa topilmadi</Empty>;
  for (const r of ROUTES) {
    const params = match(r.path, path);
    if (!params) continue;
    // Jadvalga ruxsati bo'lmagan xodim (masalan omborchi) uchun bosh sahifa — birinchi ruxsat etilgan bo'lim.
    if (r.path === '/' && !can('schedule.view')) {
      const first = ROUTES.find((x) => x.path !== '/' && !x.path.includes(':') && (!x.perm || can(x.perm)));
      page = first ? first.render({}) : null;
    } else page = r.perm && !can(r.perm) ? <ErrorBox error="Bu bo‘limga ruxsatingiz yo‘q" /> : r.render(params);
    break;
  }

  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main key={branch.id} className="flex-1">{page}</main>
    </div>
  );
}
