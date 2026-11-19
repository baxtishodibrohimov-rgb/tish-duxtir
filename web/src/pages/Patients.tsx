import { useEffect, useState } from 'react';
import { Search, Plus, Phone } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { useList, byId } from '@/lib/hooks';
import { dmy, phoneFmt } from '@/lib/format';
import { Link, navigate, useTitle } from '@/lib/router';
import type { Patient, PatientStatus } from '@/lib/types';
import { Button, Empty, PageLoader, TD, TH } from '@/components/ui';

const PAGE = 50;

export function Patients() {
  useTitle('Bemorlar');
  const { can } = useOrg();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setLimit(PAGE); }, 250); return () => clearTimeout(t); }, [q]);

  const statuses = useList<PatientStatus>('patient_statuses');
  const smap = byId(statuses.data);
  const list = useList<Patient>('patients', { deleted_at: null, ...(status ? { 'status_ids.has': status } : {}) }, { q: dq || undefined, limit: limit + 1 });
  const rows = (list.data ?? []).slice(0, limit);

  return (
    <div className="flex flex-col gap-2 px-6 pt-1 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-[448px]">
          <label htmlFor="q" className="sr-only">Bemorni qidirish</label>
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input id="q" type="search" placeholder="Bemorni qidirish..." value={q} onChange={(e) => setQ(e.target.value)}
            className="h-7 w-full rounded-lg border border-line bg-white pr-2 pl-8 text-sm outline-none focus:border-primary" />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setLimit(PAGE); }}
          className="h-7 w-[220px] rounded-lg border border-line bg-white px-2 text-sm shadow-[0_1px_2px_rgba(7,18,30,.04)]">
          <option value="">Barcha statuslar</option>
          {(statuses.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {can('patients.edit') && (
          <Button variant="primary" size="sm" className="ml-auto h-7" onClick={() => navigate('/patients/new')}><Plus size={15} /> Yangi bemor</Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-white">
        {list.isLoading ? <PageLoader /> : rows.length === 0 ? <Empty>{dq ? 'Hech narsa topilmadi' : 'Hali bemorlar yo‘q'}</Empty> : (
          <table className="w-full border-collapse">
            <thead className="bg-muted">
              <tr><th className={TH}>Karta №</th><th className={TH}>F.I.Sh.</th><th className={TH}>Asosiy telefon</th><th className={TH}>Tug‘ilgan sana</th><th className={TH}>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td className={`${TD} w-24 text-sub`}>{p.card_number}</td>
                  <td className={TD}>
                    <Link to={`/patients/${p.id}`} onClick={(e) => e.stopPropagation()} className={`font-medium no-underline hover:underline ${p.important_info ? '!text-[#b91c1c]' : ''}`}>
                      {p.full_name || 'Ismsiz'}
                    </Link>
                  </td>
                  <td className={TD}>{p.phone && <a href={`tel:+${p.phone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-fg no-underline"><Phone size={13} className="text-faint" />{phoneFmt(p.phone)}</a>}</td>
                  <td className={TD}>{dmy(p.birth_date)}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1">
                      {p.status_ids.length === 0 && <span className="text-faint">—</span>}
                      {p.status_ids.map((id) => smap.get(id)).filter(Boolean).map((s) => (
                        <span key={s!.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ background: s!.color }} />{s!.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(list.data?.length ?? 0) > limit && (
        <div className="flex justify-center"><Button onClick={() => setLimit(limit + PAGE)}>Yana ko‘rsatish</Button></div>
      )}
    </div>
  );
}
