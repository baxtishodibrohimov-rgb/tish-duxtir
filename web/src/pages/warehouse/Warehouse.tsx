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
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cx('h-8 rounded-[10px] px-3 text-sm font-medium', tab === t.key ? 'bg-nav text-nav-fg' : 'text-sub hover:bg-muted hover:text-fg')}>
            {t.label}
          </button>
        ))}
        {can('warehouse.admin') && (
          <button type="button" onClick={() => setTab('settings')} aria-label="Ombor sozlamalari" title="Ombor sozlamalari"
            className={cx('ml-auto grid h-8 w-8 place-items-center rounded-[10px]', tab === 'settings' ? 'bg-nav' : 'text-sub hover:bg-muted')}>
            <Gear size={17} />
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
