import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardList, Columns3, FlaskConical, Hourglass, List, Search, Send, X } from 'lucide-react';
import { useOrg } from '@/lib/auth';
import { http } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { dmy, dmyhm, money } from '@/lib/format';
import { downloadXlsx } from '@/lib/xlsx';
import { Link, useQueryParam, useTitle } from '@/lib/router';
import { IMPRESSION, LAB_ACTIVE, LAB_FLOW, LAB_STATUS, SHADES, daysLeftText, type LabEvent, type LabOrder, type LabStatus } from '@/lib/lab';
import { Button, Card, Drawer, PageLoader, cx } from '@/components/ui';
import { LabPrices } from './LabPrices';

type Tab = 'orders' | 'prices';
type View = 'kanban' | 'table';
type Card4 = 'all' | 'active' | 'done' | 'problem';

const isProblem = (o: LabOrder) => o.status === 'remake' || o.overdue;

export function Lab() {
  useTitle('Laboratoriya');
  const [tab, setTab] = useQueryParam<Tab>('tab', 'orders');
  return (
    <div className="flex flex-col gap-3 px-3 pt-2 pb-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        <h1 className="m-0 mr-3 flex items-center gap-2 text-lg font-semibold"><FlaskConical size={20} className="text-[#7c3aed]" /><span className="hidden sm:inline">Laboratoriya</span></h1>
        {([['orders', 'Buyurtmalar', ClipboardList], ['prices', 'Narxlar', List]] as const).map(([k, l, Ic]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[15px]', tab === k ? 'bg-primary font-medium text-white' : 'text-[#3d4858] hover:bg-muted')}>
            <Ic size={15} />{l}
          </button>
        ))}
      </div>
      {tab === 'orders' ? <Orders /> : <LabPrices />}
    </div>
  );
}

function Orders() {
  const { branch, me } = useOrg();
  const [view, setView] = useQueryParam<View>('view', 'kanban');
  const [openId, setOpenId] = useQueryParam<string>('order', '');
  const [card, setCard] = useState<Card4>('active');
  const [q, setQ] = useState('');
  const [tech, setTech] = useState('');
  const [resp, setResp] = useState('');
  const [mine, setMine] = useState(false);
  const list = useQuery({ queryKey: ['lab', 'orders', branch.id], queryFn: () => http.get<LabOrder[]>(`/api/lab/orders?branch_id=${branch.id}`) });
  const all = list.data ?? [];

  const counts = useMemo(() => ({
    all: all.filter((o) => o.status !== 'cancelled').length,
    active: all.filter((o) => LAB_ACTIVE.includes(o.status)).length,
    done: all.filter((o) => o.status === 'delivered').length,
    problem: all.filter(isProblem).length,
  }), [all]);
  const techs = useMemo(() => [...new Map(all.map((o) => [o.technician_id, o.technician_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const resps = useMemo(() => [...new Map(all.map((o) => [o.responsible_id, o.responsible_name ?? '—'])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);

  const needle = q.trim().toLowerCase();
  const rows = all.filter((o) => {
    if (card === 'active' && !LAB_ACTIVE.includes(o.status)) return false;
    if (card === 'done' && o.status !== 'delivered') return false;
    if (card === 'problem' && !isProblem(o)) return false;
    if (card === 'all' && view === 'kanban' && o.status === 'cancelled') return false;
    if (tech && o.technician_id !== tech) return false;
    if (resp && o.responsible_id !== resp) return false;
    if (mine && o.responsible_id !== me.user_id) return false;
    if (needle && !`${o.number} ${o.patient_name} ${o.card_number} ${o.work_name} ${o.tooth ?? ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const move = useAction(({ id, status }: { id: string; status: LabStatus }) => http.patch(`/api/lab/orders/${id}`, { status }), { invalidate: ['lab'], success: 'Holat o‘zgartirildi' });
  const canDrive = (o: LabOrder) => o.responsible_id === me.user_id || me.role === 'owner';

  const CARDS: { k: Card4; label: string; n: number; icon: typeof Send; tone: string }[] = [
    { k: 'all', label: 'Jami', n: counts.all, icon: ClipboardList, tone: 'bg-[#e6f6fc] text-primary-hover' },
    { k: 'active', label: 'Faol', n: counts.active, icon: Hourglass, tone: 'bg-[#fef3c7] text-[#b45309]' },
    { k: 'done', label: 'Tugagan', n: counts.done, icon: CheckCircle2, tone: 'bg-ok-soft text-ok' },
    { k: 'problem', label: 'Muammoli', n: counts.problem, icon: AlertTriangle, tone: 'bg-bad-soft text-bad' },
  ];
  const SEL = 'h-9 min-w-0 rounded-lg border border-line bg-white px-2 text-sm';

  if (list.isLoading) return <PageLoader />;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {CARDS.map((c) => (
          <button key={c.k} type="button" aria-pressed={card === c.k} onClick={() => setCard(c.k)}
            className={cx('flex items-center gap-3 rounded-xl border bg-white p-3 text-left md:p-4', card === c.k ? 'border-2 border-primary' : 'border-line hover:border-primary')}>
            <span className={cx('grid h-10 w-10 flex-none place-items-center rounded-xl', c.tone)}><c.icon size={20} /></span>
            <span className="flex flex-col"><span className="text-2xl leading-none font-bold tabular-nums">{c.n}</span><span className="text-sm text-sub">{c.label}</span></span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Ko‘rinish" className="flex rounded-lg bg-muted p-[3px]">
          {([['kanban', 'Kanban', Columns3], ['table', 'Jadval', List]] as const).map(([k, l, Ic]) => (
            <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}
              className={cx('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm', view === k ? 'bg-white font-semibold shadow-sm' : 'text-sub')}><Ic size={15} />{l}</button>
          ))}
        </div>
        <label className="relative flex min-w-[180px] flex-1 md:max-w-[280px]">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <input aria-label="Qidirish" placeholder="Bemor, №, ish…" value={q} onChange={(e) => setQ(e.target.value)} className={cx(SEL, 'w-full pl-8')} />
        </label>
        <select aria-label="Texnik" value={tech} onChange={(e) => setTech(e.target.value)} className={SEL}>
          <option value="">Barcha texniklar</option>{techs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select aria-label="Ma’sul shaxs" value={resp} onChange={(e) => setResp(e.target.value)} className={SEL}>
          <option value="">Barcha ma’sullar</option>{resps.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-sub"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Faqat meniki</label>
        <span className="flex-1" />
        <Button size="sm" onClick={() => downloadXlsx('Laboratoriya.xlsx', [{
          name: 'Buyurtmalar', bold: [0],
          rows: [['№', 'Sana', 'Bemor', 'Karta', 'Ish', 'Tish', 'Rang', 'Qolip', 'Texnik', 'Ma’sul', 'Muddat', 'Holat', 'Texnik narxi', 'Texnikka yozilgan'],
            ...rows.map((o) => [o.number, dmy(o.created_at), o.patient_name, o.card_number, o.work_name, o.tooth ?? '', o.shade ?? '', IMPRESSION[o.impression], o.technician_name, o.responsible_name ?? '', dmy(o.due_date), LAB_STATUS[o.status].label, o.tech_amount, o.earned])],
        }])}>Excel</Button>
      </div>

      {all.length === 0 && (
        <Card className="p-8 text-center text-sm text-sub">
          Hali buyurtma yo‘q. Buyurtma «Material xarajat» oynasida laboratoriya ishi (masalan, metallokeramika) tanlanganda yaratiladi.
          <br />Qaysi ish laboratoriyaga borishini «Narxlar» varag‘ida belgilang.
        </Card>
      )}

      {all.length > 0 && view === 'kanban' && (
        <Kanban rows={rows} canDrive={canDrive} onOpen={setOpenId} onMove={(id, status) => move.mutate({ id, status })} showDone={card !== 'active' && card !== 'problem'} />
      )}
      {all.length > 0 && view === 'table' && <OrdersTable rows={rows} onOpen={setOpenId} />}

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId('')} />}
    </>
  );
}

function Due({ o }: { o: LabOrder }) {
  const live = LAB_ACTIVE.includes(o.status);
  return (
    <span className={cx('whitespace-nowrap', o.overdue ? 'font-semibold text-bad' : 'text-sub')}>
      {dmy(o.due_date)}{live && <> · {daysLeftText(o.due_date)}</>}
    </span>
  );
}

function StatusPill({ s }: { s: LabStatus }) {
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', LAB_STATUS[s].tone)}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: LAB_STATUS[s].dot }} />{LAB_STATUS[s].label}</span>;
}

function ShadeChip({ s }: { s: string | null }) {
  if (!s) return null;
  return <span className="rounded-md border border-[#e2d8c4] px-1.5 text-xs font-bold text-[#3f3424]" style={{ background: SHADES.find((x) => x.key === s)?.bg ?? '#f6efdf' }}>{s}</span>;
}

function Kanban({ rows, canDrive, onOpen, onMove, showDone }: {
  rows: LabOrder[]; canDrive: (o: LabOrder) => boolean; onOpen: (id: string) => void; onMove: (id: string, s: LabStatus) => void; showDone: boolean;
}) {
  const [over, setOver] = useState<LabStatus | null>(null);
  const cols = showDone ? LAB_FLOW : LAB_FLOW.filter((s) => s !== 'delivered');
  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2 md:mx-0 md:px-0">
      <div className="grid min-w-max auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 md:min-w-0">
        {cols.map((s) => {
          const list = rows.filter((o) => o.status === s);
          return (
            <section key={s} aria-label={LAB_STATUS[s].label}
              onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); const o = rows.find((x) => x.id === id); if (o && o.status !== s) onMove(id, s); }}
              className={cx('flex min-h-[300px] flex-col gap-2 rounded-xl bg-muted/60 p-2', over === s && 'ring-2 ring-primary')}>
              <h3 className="m-0 flex items-center gap-2 px-1 py-1 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAB_STATUS[s].dot }} />{LAB_STATUS[s].label}
                <span className="ml-auto rounded-full bg-white px-2 text-xs text-sub">{list.length}</span>
              </h3>
              {list.map((o) => {
                const drag = canDrive(o);
                return (
                  <button key={o.id} type="button" draggable={drag} onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)} onClick={() => onOpen(o.id)}
                    title={drag ? 'Sudrab holatni o‘zgartiring yoki oching' : 'Ochish (holatni faqat ma’sul shaxs o‘zgartiradi)'}
                    className={cx('flex flex-col gap-1.5 rounded-lg border bg-white p-2.5 text-left text-sm shadow-[0_1px_2px_rgba(7,18,30,.05)] hover:border-primary', o.overdue ? 'border-[#fca5a5]' : 'border-line', drag && 'cursor-grab')}>
                    <span className="flex items-center gap-2"><b className="text-xs text-sub">№{o.number}</b><span className="truncate font-semibold">{o.patient_name}</span></span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px]">{o.work_name}{o.tooth && <span className="text-sub">· {o.tooth}</span>}<ShadeChip s={o.shade} /></span>
                    <span className="flex flex-wrap items-center justify-between gap-x-2 text-xs"><span className="text-sub">🧑‍🔧 {o.technician_name}</span><Due o={o} /></span>
                    <span className="text-xs text-faint">Ma’sul: {o.responsible_name}</span>
                  </button>
                );
              })}
              {list.length === 0 && <span className="px-1 py-4 text-center text-xs text-faint">Bo‘sh</span>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrdersTable({ rows, onOpen }: { rows: LabOrder[]; onOpen: (id: string) => void }) {
  const H = 'h-10 border-b border-line px-2.5 text-left text-xs font-semibold whitespace-nowrap text-sub';
  const C = 'border-t border-line px-2.5 py-2';
  return (
    <Card className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr>{['№', 'Sana', 'Bemor', 'Ish', 'Rang', 'Qolip', 'Texnik', 'Ma’sul', 'Muddat', 'Holat', 'Texnikka'].map((h) => <th key={h} className={H}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o.id)} className="cursor-pointer hover:bg-surface">
              <td className={cx(C, 'font-semibold')}>{o.number}</td>
              <td className={cx(C, 'whitespace-nowrap text-sub')}>{dmy(o.created_at)}</td>
              <td className={C}><span className="font-medium text-primary-hover">{o.patient_name}</span></td>
              <td className={C}>{o.work_name}{o.tooth && <span className="text-sub"> · {o.tooth}</span>}</td>
              <td className={C}><ShadeChip s={o.shade} /></td>
              <td className={cx(C, 'whitespace-nowrap')}>{IMPRESSION[o.impression]}</td>
              <td className={C}>{o.technician_name}</td>
              <td className={C}>{o.responsible_name}</td>
              <td className={C}><Due o={o} /></td>
              <td className={C}><StatusPill s={o.status} /></td>
              <td className={cx(C, 'text-right whitespace-nowrap tabular-nums')}>{money(o.earned)} <span className="text-faint">/ {money(o.tech_amount)}</span></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-sub">Filtr bo‘yicha buyurtma yo‘q.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

/** Buyurtma kartasi: ma'lumotlar, holatni o'zgartirish (ma'sul uchun), tarix. */
export function OrderDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { members } = useOrg();
  const q = useQuery({ queryKey: ['lab', 'order', id], queryFn: () => http.get<LabOrder & { events: LabEvent[]; can_drive: boolean }>(`/api/lab/orders/${id}`) });
  const techs = useQuery({ queryKey: ['lab', 'technicians'], queryFn: () => http.get<{ id: string; name: string; archived: boolean }[]>('/api/lab/technicians') });
  const [comment, setComment] = useState('');
  const save = useAction((patch: Record<string, unknown>) => http.patch(`/api/lab/orders/${id}`, { ...patch, comment: comment.trim() || undefined }),
    { invalidate: ['lab'], success: 'Saqlandi', onDone: () => setComment('') });
  const checked = useAction(() => http.post(`/api/lab/orders/${id}/checked`, { comment: comment.trim() || undefined }), { invalidate: ['lab'], success: 'Belgilandi', onDone: () => setComment('') });
  const o = q.data;
  const R = 'grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2 text-sm';
  const inp = 'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm disabled:bg-surface disabled:text-fg';
  return (
    <Drawer open onClose={onClose} title={o ? `Buyurtma №${o.number}` : 'Buyurtma'} width={520}>
      {!o ? <PageLoader /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill s={o.status} />
            {o.overdue && <span className="rounded-full bg-bad-soft px-2 py-0.5 text-xs font-semibold text-bad">Muddat o‘tgan</span>}
            {!o.can_drive && <span className="text-xs text-sub">Holatni faqat ma’sul shaxs ({o.responsible_name}) o‘zgartiradi</span>}
          </div>
          <div className={R}>
            <span className="text-sub">Bemor</span><Link to={`/patients/${o.patient_id}`} className="font-medium">{o.patient_name} <span className="font-normal text-sub">№{o.card_number}</span></Link>
            <span className="text-sub">Ish</span><b className="font-medium">{o.work_name}{o.tooth && <span className="font-normal text-sub"> · tish {o.tooth}</span>}</b>
            <span className="text-sub">Shifokor</span><span>{o.doctor_name ?? '—'}</span>
            <span className="text-sub">Texnik</span>
            <select aria-label="Texnik" disabled={!o.can_drive || save.isPending} value={o.technician_id} onChange={(e) => save.mutate({ technician_id: e.target.value })} className={inp}>
              {(techs.data ?? [{ id: o.technician_id, name: o.technician_name, archived: false }]).filter((t) => !t.archived || t.id === o.technician_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="text-sub">Ma’sul</span>
            <select aria-label="Ma’sul shaxs" disabled={!o.can_drive || save.isPending} value={o.responsible_id} onChange={(e) => save.mutate({ responsible_id: e.target.value })} className={inp}>
              {members.filter((x) => (x.is_active && ['doctor', 'owner'].includes(x.role)) || x.user_id === o.responsible_id).map((x) => <option key={x.user_id} value={x.user_id}>{x.full_name}</option>)}
            </select>
            <span className="text-sub">Rang</span>
            <select aria-label="Tish rangi" disabled={!o.can_drive || save.isPending} value={o.shade ?? ''} onChange={(e) => save.mutate({ shade: e.target.value })} className={inp}>
              {SHADES.map((x) => <option key={x.key} value={x.key}>{x.key}</option>)}
            </select>
            <span className="text-sub">Qolip</span>
            <select aria-label="Qolip turi" disabled={!o.can_drive || save.isPending} value={o.impression} onChange={(e) => save.mutate({ impression: e.target.value })} className={inp}>
              {Object.entries(IMPRESSION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="text-sub">Muddat</span>
            <span className="flex items-center gap-2">
              <input type="date" aria-label="Muddat" disabled={!o.can_drive || save.isPending} value={o.due_date} onChange={(e) => e.target.value && save.mutate({ due_date: e.target.value })} className={inp} />
              <span className={cx('text-xs whitespace-nowrap', o.overdue ? 'font-semibold text-bad' : 'text-sub')}>{LAB_ACTIVE.includes(o.status) && daysLeftText(o.due_date)}</span>
            </span>
            <span className="text-sub">Texnikka</span>
            <span><b>{money(o.earned)}</b> / {money(o.tech_amount)} so‘m <span className="text-xs text-sub">({o.act_total ? Math.round(((o.act_paid ?? 0) * 100) / o.act_total) : 0}% to‘langan)</span></span>
          </div>
          {o.note && <div className="rounded-lg bg-surface px-3 py-2 text-sm"><span className="text-sub">Izoh: </span>{o.note}</div>}

          {o.can_drive && o.status !== 'cancelled' && (
            <section className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <b className="text-sm">Holatni o‘zgartirish</b>
              <input aria-label="Izoh (ixtiyoriy)" placeholder="Izoh (ixtiyoriy)" value={comment} onChange={(e) => setComment(e.target.value)} className={inp} />
              <div className="flex flex-wrap gap-1.5">
                {LAB_FLOW.filter((s) => s !== o.status).map((s) => (
                  <button key={s} type="button" disabled={save.isPending} onClick={() => save.mutate({ status: s })}
                    className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm hover:border-primary')}>
                    <span className="h-2 w-2 rounded-full" style={{ background: LAB_STATUS[s].dot }} />{s === 'at_lab' && o.status === 'to_send' ? 'Jo‘natdim' : LAB_STATUS[s].label}
                  </button>
                ))}
                {(o.status === 'at_lab' || o.status === 'remake') && (
                  <button type="button" disabled={checked.isPending} onClick={() => checked.mutate(undefined)} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm text-white">Texnikdan xabar oldim</button>
                )}
              </div>
              <button type="button" onClick={() => { if (confirm('Buyurtma bekor qilinsinmi? Texnikka pul yozilmaydi.')) save.mutate({ status: 'cancelled' }); }} className="self-start text-xs text-bad hover:underline">Buyurtmani bekor qilish</button>
            </section>
          )}

          <section className="flex flex-col gap-0">
            <b className="mb-1 text-sm">Tarix</b>
            {o.events.map((e) => (
              <div key={e.id} className="flex gap-3 border-l-2 border-line py-1.5 pl-3 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{e.action === 'created' ? 'Buyurtma yaratildi' : e.action === 'checked' ? 'Texnikdan xabar olindi' : e.action === 'edit' ? e.note : <>Holat: <StatusPill s={e.status!} /></>}</span>
                  {e.note && e.action !== 'edit' && e.action !== 'checked' && <span className="text-xs text-sub">{e.note}</span>}
                  {e.action === 'checked' && e.note && e.note !== 'Texnikdan xabar olindi' && <span className="text-xs text-sub">{e.note}</span>}
                </span>
                <span className="flex-none text-right text-xs text-sub">{e.by_name ?? ''}<br />{dmyhm(e.at)}</span>
              </div>
            ))}
          </section>
          <Button onClick={onClose} className="self-start"><X size={15} /> Yopish</Button>
        </div>
      )}
    </Drawer>
  );
}
