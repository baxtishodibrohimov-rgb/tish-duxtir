import { Settings as Gear } from 'lucide-react';
import { useQueryParam, useTitle } from '@/lib/router';
import { useOrg } from '@/lib/auth';
import { PageLoader, cx } from '@/components/ui';
import { useWh } from './common';
import { Stock } from './Stock';
import { Docs } from './Docs';
import { Order } from './Order';
import { WhReports } from './WhReports';
import { WhSettings } from './WhSettings';

type Tab = 'stock' | 'docs' | 'order' | 'reports' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'stock', label: 'Mening omborlarim' }, { key: 'docs', label: 'Nakladnoylar' },
  { key: 'order', label: 'Buyurtma' }, { key: 'reports', label: 'Hisobotlar' },
];

export function Warehouse() {
  useTitle('Ombor');
  const [tab, setTab] = useQueryParam<Tab>('tab', 'stock');
  const { can } = useOrg();
  const wh = useWh();
  if (wh.loading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-3 px-3 pt-2 pb-6 md:px-6 md:pt-1">
      <div className="-mx-3 flex items-center gap-1 overflow-x-auto border-b border-line px-3 pb-1.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:gap-0.5 md:overflow-visible md:px-0 md:pb-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cx('h-9 flex-none rounded-lg px-3 text-[15px] whitespace-nowrap md:h-5 md:rounded md:px-2 md:text-sm', tab === t.key ? 'bg-primary font-medium text-white' : 'text-[#3d4858] hover:text-fg')}>
            {t.label}
          </button>
        ))}
        {can('warehouse.admin') && (
          <button type="button" onClick={() => setTab('settings')} aria-label="Ombor sozlamalari" title="Ombor sozlamalari"
            className={cx('grid h-9 w-9 flex-none place-items-center rounded-lg md:h-6 md:w-6 md:rounded', tab === 'settings' ? 'bg-primary text-white' : 'text-sub hover:bg-muted')}>
            <Gear size={16} />
          </button>
        )}
      </div>
      {tab === 'stock' && <Stock wh={wh} />}
      {tab === 'docs' && <Docs wh={wh} />}
      {tab === 'order' && <Order wh={wh} />}
      {tab === 'reports' && <WhReports wh={wh} />}
      {tab === 'settings' && <WhSettings wh={wh} />}
    </div>
  );
}
