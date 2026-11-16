import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MONTHS, isoDate, sameDay } from '@/lib/format';
import { cx } from './ui';

const WD = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

export function MiniCalendar({ value, onPick, onClose }: { value: Date; onPick: (d: Date) => void; onClose?: () => void }) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const lead = (view.getDay() + 6) % 7;
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const today = new Date();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  const title = MONTHS[view.getMonth()]!;

  return (
    <div role="dialog" aria-label="Sanani tanlash" className="w-[252px] rounded-xl border border-line bg-white p-3 shadow-pop">
      <div className="mb-2 flex items-center gap-1">
        <button type="button" aria-label="Oldingi oy" onClick={() => shift(-1)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted"><ChevronLeft size={15} /></button>
        <span className="text-sm font-semibold">{title[0]!.toUpperCase() + title.slice(1)} {view.getFullYear()}</span>
        <button type="button" aria-label="Keyingi oy" onClick={() => shift(1)} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted"><ChevronRight size={15} /></button>
        <button type="button" onClick={() => onPick(new Date())}
          className="mr-1 ml-auto h-[26px] rounded-lg border border-line bg-white px-2.5 text-[13px] font-medium text-primary-hover hover:bg-muted">Bugun</button>
        {onClose && <button type="button" aria-label="Yopish" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted"><X size={14} className="text-sub" /></button>}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WD.map((w) => <span key={w} className="py-1 text-xs text-sub">{w}</span>)}
        {cells.map((d, i) => d ? (
          <button key={i} type="button" onClick={() => onPick(d)}
            className={cx('h-8 rounded-lg text-[13px]',
              sameDay(d, value) ? 'bg-primary font-semibold text-white' : sameDay(d, today) ? 'bg-primary-soft font-semibold text-primary-hover' : 'hover:bg-muted')}>
            {d.getDate()}
          </button>
        ) : <span key={i} />)}
      </div>
    </div>
  );
}

export const toDate = isoDate;
