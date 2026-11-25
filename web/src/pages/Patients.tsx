import { useEffect, useState } from 'react';
import { Search, Plus, Phone } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { useList, byId } from '@/lib/hooks';
import { phoneFmt } from '@/lib/format';
import { usePatientBalances } from '@/components/VisitModal';
import { ChevronDown } from 'lucide-react';
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
  const bal = usePatientBalances(rows.map((r) => r.id));

  return (
    <div className="flex flex-col gap-2 px-3 pt-2 pb-6 md:px-6 md:pt-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-[448px]">
          <label htmlFor="q" className="sr-only">Bemorni qidirish</label>
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input id="q" type="search" placeholder="Bemorni qidirish..." value={q} onChange={(e) => setQ(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-white pr-2 pl-8 text-[15px] md:h-7 md:text-sm shadow-[0_1px_2px_rgba(7,18,30,.04)] outline-none focus:border-primary" />
        </div>
        <div className="relative w-full sm:w-[220px]">
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setLimit(PAGE); }}
            className="h-10 w-full appearance-none rounded-lg md:h-7 border border-line bg-white pr-8 pl-2.5 text-sm shadow-[0_1px_2px_rgba(7,18,30,.04)]">
            <option value="">Barcha statuslar</option>
            {(statuses.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sub" />
        </div>
        {can('patients.edit') && (
          <Link to="/patients/new" className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 md:h-7 text-sm font-medium !text-white no-underline hover:bg-primary-hover"><Plus size={16} /> Yangi bemor</Link>
        )}
      </div>

      <div className="app-card overflow-x-auto rounded-card border border-line bg-white">
        {list.isLoading ? <PageLoader /> : rows.length === 0 ? <Empty>{dq ? 'Hech narsa topilmadi' : 'Hali bemorlar yo‘q'}</Empty> : (
          <>
          {/* Telefon: kartochkalar ro'yxati */}
          <ul className="m-0 list-none p-0 md:hidden">
            {rows.map((p) => {
              const debt = (bal.data?.get(p.id)?.billed ?? 0) > (bal.data?.get(p.id)?.paid ?? 0);
              return (
                <li key={p.id} className="flex items-center gap-2 border-b border-line last:border-b-0">
                  <Link to={`/patients/${p.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 px-3.5 py-2.5 no-underline">
                    <span className="truncate text-[15px] font-medium" style={{ color: debt ? '#dc2626' : '#07121e' }}>{p.full_name || 'Ismsiz'}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sub">
                      {p.card_number && <span>№{p.card_number}</span>}
                      {p.status_ids.map((id) => smap.get(id)).filter(Boolean).map((st) => (
                        <span key={st!.id} className="inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium" style={{ background: `${st!.color}22`, color: st!.color }}>{st!.name}</span>
                      ))}
                    </span>
                  </Link>
                  {p.phone && (
                    <a href={`tel:+${p.phone.replace(/\D/g, '')}`} aria-label={`Qo‘ng‘iroq: ${phoneFmt(p.phone)}`}
                      className="mr-2 inline-flex h-11 flex-none items-center gap-1.5 rounded-lg px-2.5 text-[13px] !text-primary-hover no-underline active:bg-primary-soft">
                      <Phone size={16} /><span className="tabular-nums">{phoneFmt(p.phone)}</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <table className="hidden w-full border-collapse md:table">
            <thead className="bg-muted/50">
              <tr><th className={TH}>Karta №</th><th className={TH}>F.I.Sh.</th><th className={TH}>Asosiy telefon</th><th className={TH}>Tug‘ilgan sana</th><th className={TH}>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td className={`${TD} w-24 text-sub`}>{p.card_number}</td>
                  <td className={TD}>
                    <Link to={`/patients/${p.id}`} onClick={(e) => e.stopPropagation()} className="block font-medium no-underline hover:underline"
                      style={{ color: (bal.data?.get(p.id)?.billed ?? 0) > (bal.data?.get(p.id)?.paid ?? 0) ? '#dc2626' : '#07121e' }}>
                      {p.full_name || 'Ismsiz'}
                    </Link>
                  </td>
                  <td className={TD}>{p.phone && <a href={`tel:+${p.phone.replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 !text-sub no-underline"><Phone size={14} />{phoneFmt(p.phone)}</a>}</td>
                  <td className={`${TD} text-sub`}>{p.birth_date ?? ''}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1">
                      {p.status_ids.length === 0 && <span className="text-sub">—</span>}
                      {p.status_ids.map((id) => smap.get(id)).filter(Boolean).map((s) => (
                        <span key={s!.id} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${s!.color}22`, color: s!.color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s!.color }} />{s!.name}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>
      {(list.data?.length ?? 0) > limit && (
        <div className="flex justify-center"><Button onClick={() => setLimit(limit + PAGE)}>Yana ko‘rsatish</Button></div>
      )}
    </div>
  );
}

