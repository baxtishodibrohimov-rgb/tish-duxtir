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
    <div className="flex flex-col gap-3 px-6 pt-1 pb-6">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line pb-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cx('h-5 rounded px-2 text-sm whitespace-nowrap', tab === t.key ? 'bg-primary font-medium text-white' : 'text-[#3d4858] hover:text-fg')}>
            {t.label}
          </button>
        ))}
        {can('warehouse.admin') && (
          <button type="button" onClick={() => setTab('settings')} aria-label="Ombor sozlamalari" title="Ombor sozlamalari"
            className={cx('grid h-6 w-6 place-items-center rounded', tab === 'settings' ? 'bg-primary text-white' : 'text-sub hover:bg-muted')}>
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
