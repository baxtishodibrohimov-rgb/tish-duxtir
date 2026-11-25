import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Menu, Palette, Pencil, Plus, Trash2, User, Users, Tag, ListOrdered, Building2, CalendarDays, Banknote, BookOpen } from 'lucide-react';
import { CAT_ICONS, CatIconSvg } from '@/components/WorksWizard';
import { WorkMaterials } from '@/components/WorkMaterials';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg, ROLE_LABEL, ALL_PERMS, roleDefault } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useAction, useList, byId } from '@/lib/hooks';
import { dmy, hm, initials, isoDate, phoneFmt } from '@/lib/format';
import { useQueryParam, useTitle } from '@/lib/router';
import type { Brand, Branch, CalcCard, CatIcon, WorkMatGroup, Member, PatientStatus, Perm, PriceCategory, PriceItem, Product, Role, Room } from '@/lib/types';
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, Select, Switch, Toggle, cx } from '@/components/ui';

type Tab = 'profile' | 'clinic' | 'staff' | 'schedule' | 'price' | 'works' | 'salary' | 'statuses' | 'dicts';

export function Settings() {
  useTitle('Sozlamalar');
  const { can } = useOrg();
  const tabs: { key: Tab; label: string; icon: (p: { size?: number }) => React.ReactNode; show: boolean }[] = [
    { key: 'profile', label: 'Mening profilim', icon: User, show: true },
    { key: 'clinic', label: 'Klinika', icon: Building2, show: can('settings.edit') },
    { key: 'staff', label: 'Xodimlar va ruxsatlar', icon: Users, show: can('staff.manage') },
    { key: 'schedule', label: 'Jadval', icon: CalendarDays, show: can('settings.edit') || can('schedule.edit') },
    { key: 'price', label: 'Prays', icon: ListOrdered, show: can('settings.edit') },
    { key: 'works', label: 'Bajarilgan ish', icon: ToothIcon, show: can('settings.edit') || can('warehouse.admin') },
    { key: 'salary', label: 'Maosh', icon: Banknote, show: can('staff.manage') },
    { key: 'statuses', label: 'Bemor statuslari', icon: Tag, show: can('settings.edit') },
    { key: 'dicts', label: 'Ma’lumotnomalar', icon: BookOpen, show: can('settings.edit') || can('cashbox.edit') },
  ];
  const [tab0, setTab] = useQueryParam<Tab>('tab', 'profile');
  const tab: Tab = (tab0 as string) === 'branches' ? 'clinic' : tab0;
  const cur = tabs.find((t) => t.key === tab && t.show) ? tab : 'profile';

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="m-0 text-3xl font-semibold tracking-[-0.02em]">Sozlamalar</h1>
      <div role="tablist" className="flex flex-wrap items-center gap-1 self-start rounded-[10px] bg-muted p-1">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.key} role="tab" aria-selected={cur === t.key} type="button" onClick={() => setTab(t.key)}
            className={cx('inline-flex h-[30px] items-center gap-2 rounded-lg px-3 text-[15px] whitespace-nowrap', cur === t.key ? 'bg-white font-medium text-fg shadow-[0_1px_3px_rgba(7,18,30,.12)]' : 'text-sub hover:text-fg')}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {cur === 'profile' && <Profile />}
      {cur === 'clinic' && <Clinic />}
      {cur === 'staff' && <Staff />}
      {cur === 'schedule' && <ScheduleTab />}
      {cur === 'price' && <Price />}
      {cur === 'works' && <Works />}
      {cur === 'salary' && <Salary />}
      {cur === 'statuses' && <Statuses />}
      {cur === 'dicts' && <Dicts />}
    </div>
  );
}

/** Maketdagi sozlamalar kartasi: sarlavha va qatorlar (chapda nom va izoh, o'ngda boshqaruv). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="max-w-[980px] rounded-card border border-line bg-white px-5 pt-3 pb-2">
      <h2 className="m-0 border-b border-line pb-2 text-base font-semibold">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
function Item({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="flex min-w-[200px] flex-col"><span className="text-[15px]">{label}</span>{hint && <span className="text-xs text-sub">{hint}</span>}</div>
      <div className="flex w-full max-w-[220px] justify-end sm:w-auto">{children}</div>
    </div>
  );
}
const SIN = 'h-8 w-[220px] max-w-full rounded-lg border border-line bg-white px-2.5 text-[15px]';

/** Sozlamalar menyusi uchun tish belgisi (lucide'da yo'q). */
function ToothIcon({ size = 16 }: { size?: number }) { return <CatIconSvg icon="tooth" size={size} />; }

// ---------------- Profil ----------------
function Profile() {
  const { user, me, refresh } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.full_name ?? '');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const save = useAction(() => http.patch('/api/me', { full_name: name }), { success: 'Saqlandi', onDone: () => { void refresh(); } });
  const savePw = useAction(() => {
    if (pw.next !== pw.again) throw new Error('Yangi parollar mos emas');
    return http.post('/api/auth/password', { current: pw.current, next: pw.next });
  }, { success: 'Parol o‘zgartirildi', onDone: () => setPw({ current: '', next: '', again: '' }) });
  const logoutAll = useAction(() => http.post('/api/auth/logout-all'), { onDone: () => { qc.clear(); void refresh(); } });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5"><h2 className="m-0 text-lg font-semibold">Mening profilim</h2><span className="text-[13px] text-sub">Faqat sizga tegishli sozlamalar. Har bir xodim o‘zinikini o‘zgartiradi.</span></div>
      <Group title="Shaxsiy ma’lumotlar">
        <Item label="Familiya va ism"><input aria-label="Familiya va ism" className={SIN} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== user?.full_name && save.mutate(undefined)} /></Item>
        <Item label="Login" hint="Tizimga kirish uchun. O‘zgartirish uchun klinika rahbariga murojaat qiling"><input aria-label="Login" className={SIN} value={user?.email ?? phoneFmt(user?.phone)} disabled /></Item>
        <Item label="Lavozim"><span className="text-[15px]">{ROLE_LABEL[me.role]}</span></Item>
      </Group>
      <Group title="Xavfsizlik">
        <Item label="Joriy parol"><input type="password" aria-label="Joriy parol" autoComplete="current-password" className={SIN} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Item>
        <Item label="Yangi parol" hint="Kamida 8 belgi"><input type="password" aria-label="Yangi parol" autoComplete="new-password" className={SIN} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Item>
        <Item label="Yangi parolni takrorlang"><input type="password" aria-label="Yangi parolni takrorlang" autoComplete="new-password" className={SIN} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Item>
        <div className="flex flex-wrap justify-end gap-2 py-2.5">
          <Button size="sm" variant="ghost" onClick={() => logoutAll.mutate(undefined)}>Barcha qurilmalardan chiqish</Button>
          <Button size="sm" variant="primary" loading={savePw.isPending} disabled={!pw.current || !pw.next} onClick={() => savePw.mutate(undefined)}>Parolni yangilash</Button>
        </div>
      </Group>
    </div>
  );
}

// ---------------- Klinika ----------------
function Clinic() {
  const { org, refresh } = useOrg();
  const [orgName, setOrgName] = useState(org.name);
  const upd = useAction((patch: Record<string, unknown>) => http.patch('/api/org', patch), { success: 'Saqlandi', onDone: () => { void refresh(); } });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5"><h2 className="m-0 text-lg font-semibold">Klinika sozlamalari</h2><span className="text-[13px] text-sub">Butun klinika uchun. Faqat egasi va administratorlar o‘zgartiradi.</span></div>
      <Group title="Klinika">
        <Item label="Klinika nomi"><input aria-label="Klinika nomi" className={SIN} value={orgName} onChange={(e) => setOrgName(e.target.value)} onBlur={() => orgName.trim() && orgName !== org.name && upd.mutate({ name: orgName.trim() })} /></Item>
        <Item label="Qoldiq yetmasa ham material chiqarish" hint="Akt yopilganda omborda yetarli material bo‘lmasa, qoldiq manfiy bo‘ladi">
          <Toggle on={org.allow_negative_stock} label="Qoldiq yetmasa ham material chiqarish" onChange={(v) => upd.mutate({ allow_negative_stock: v })} />
        </Item>
      </Group>
      <Branches />
    </div>
  );
}

// ---------------- Jadval ----------------
interface Res { id: string; branch_id: string; room_id: string | null; starts_at: string; ends_at: string; reason: string }
interface Shift { id: string; member_id: string; room_id: string | null; shift_date: string; starts_at: string; ends_at: string }
function ScheduleTab() {
  const { branch, can, refresh, members } = useOrg();
  const rooms = useList<Room>('rooms', { branch_id: branch.id, is_active: true });
  const t0 = isoDate(new Date());
  const res = useList<Res>('time_reservations', { branch_id: branch.id, 'starts_at.gte': new Date(t0 + 'T00:00:00').toISOString() }, { limit: 50 });
  const shifts = useList<Shift>('staff_shifts', { branch_id: branch.id, 'shift_date.gte': t0 }, { limit: 100 });
  const [b, setB] = useState({ slot_minutes: branch.slot_minutes, days_visible: branch.days_visible, work_start: branch.work_start.slice(0, 5), work_end: branch.work_end.slice(0, 5) });
  const [r, setR] = useState({ date: t0, from: '13:00', to: '14:00', reason: 'Tushlik', room_id: '' });
  const [sh, setSh] = useState({ member_id: '', date: t0, from: branch.work_start.slice(0, 5), to: branch.work_end.slice(0, 5), room_id: '' });
  const staff = members.filter((m) => m.is_active && m.role !== 'doctor');
  const mm = byId(members), rm = byId(rooms.data);
  const saveBranch = useAction(() => db.update('branches', branch.id, b), { success: 'Saqlandi', onDone: () => { void refresh(); } });
  const at = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();
  const addRes = useAction(() => db.insert('time_reservations', { branch_id: branch.id, room_id: r.room_id || null, starts_at: at(r.date, r.from), ends_at: at(r.date, r.to), reason: r.reason }), { invalidate: ['time_reservations'], success: 'Vaqt band qilindi' });
  const delRes = useAction((id: string) => db.remove('time_reservations', id), { invalidate: ['time_reservations'] });
  const addShift = useAction(() => db.insert('staff_shifts', { branch_id: branch.id, member_id: sh.member_id, room_id: sh.room_id || null, shift_date: sh.date, starts_at: sh.from, ends_at: sh.to }), { invalidate: ['staff_shifts'], success: 'Smena qo‘shildi' });
  const delShift = useAction((id: string) => db.remove('staff_shifts', id), { invalidate: ['staff_shifts'] });
  const IN = 'h-8 rounded-lg border border-line bg-white px-2 text-sm';
  return (
    <div className="flex flex-col gap-4">
      {can('settings.edit') && (
        <Group title={`Jadval ko‘rinishi · ${branch.name}`}>
          <Item label="Ish kuni boshlanishi"><input type="time" aria-label="Ish kuni boshlanishi" className={SIN} value={b.work_start} onChange={(e) => setB({ ...b, work_start: e.target.value })} /></Item>
          <Item label="Ish kuni tugashi"><input type="time" aria-label="Ish kuni tugashi" className={SIN} value={b.work_end} onChange={(e) => setB({ ...b, work_end: e.target.value })} /></Item>
          <Item label="Qabul qadami" hint="Jadvalni bosganda yangi qabul shu qadamga yaxlitlanadi">
            <select aria-label="Qabul qadami" className={SIN} value={b.slot_minutes} onChange={(e) => setB({ ...b, slot_minutes: Number(e.target.value) })}>{[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} daqiqa</option>)}</select>
          </Item>
          <Item label="Ko‘rsatiladigan kunlar soni" hint="Har bir xodim jadval sozlamalarida o‘zi uchun o‘zgartira oladi">
            <select aria-label="Kunlar soni" className={SIN} value={b.days_visible} onChange={(e) => setB({ ...b, days_visible: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </Item>
          <div className="flex justify-end py-2.5"><Button size="sm" variant="primary" loading={saveBranch.isPending} onClick={() => saveBranch.mutate(undefined)}>Saqlash</Button></div>
        </Group>
      )}
      {can('schedule.edit', branch.id) && <>
        <Group title="Vaqtni band qilish (tushlik, yig‘ilish, ta’mir)">
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            <input type="date" aria-label="Sana" className={IN} value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} />
            <input type="time" aria-label="Dan" className={IN} value={r.from} onChange={(e) => setR({ ...r, from: e.target.value })} />
            <input type="time" aria-label="Gacha" className={IN} value={r.to} onChange={(e) => setR({ ...r, to: e.target.value })} />
            <input aria-label="Sabab" className={cx(IN, 'w-40')} value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} />
            <select aria-label="Kabinet" className={IN} value={r.room_id} onChange={(e) => setR({ ...r, room_id: e.target.value })}><option value="">Barcha kabinetlar</option>{(rooms.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <Button size="sm" disabled={!r.reason.trim()} loading={addRes.isPending} onClick={() => addRes.mutate(undefined)}>Band qilish</Button>
          </div>
          {(res.data ?? []).map((x) => (
            <div key={x.id} className="flex items-center gap-3 border-t border-line py-2 text-sm">
              <span className="w-28 text-sub">{dmy(x.starts_at)}</span><span className="w-28">{hm(x.starts_at)} – {hm(x.ends_at)}</span>
              <span className="flex-1">{x.reason}{x.room_id && <span className="text-sub"> · {rm.get(x.room_id)?.name}</span>}</span>
              <button type="button" aria-label="O‘chirish" onClick={() => delRes.mutate(x.id)} className="text-faint hover:text-bad"><Trash2 size={14} /></button>
            </div>
          ))}
        </Group>
        <Group title="Ish va dam olish kunlari (xodimlar smenasi)">
          <div className="flex flex-wrap items-center gap-2 py-2.5">
            <select aria-label="Xodim" className={IN} value={sh.member_id} onChange={(e) => setSh({ ...sh, member_id: e.target.value })}><option value="">Xodimni tanlang</option>{staff.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
            <input type="date" aria-label="Sana" className={IN} value={sh.date} onChange={(e) => setSh({ ...sh, date: e.target.value })} />
            <input type="time" aria-label="Dan" className={IN} value={sh.from} onChange={(e) => setSh({ ...sh, from: e.target.value })} />
            <input type="time" aria-label="Gacha" className={IN} value={sh.to} onChange={(e) => setSh({ ...sh, to: e.target.value })} />
            <select aria-label="Kabinet" className={IN} value={sh.room_id} onChange={(e) => setSh({ ...sh, room_id: e.target.value })}><option value="">—</option>{(rooms.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <Button size="sm" disabled={!sh.member_id} loading={addShift.isPending} onClick={() => addShift.mutate(undefined)}>Smena qo‘shish</Button>
          </div>
          {(shifts.data ?? []).map((x) => (
            <div key={x.id} className="flex items-center gap-3 border-t border-line py-2 text-sm">
              <span className="w-28 text-sub">{dmy(x.shift_date)}</span><span className="w-28">{x.starts_at.slice(0, 5)} – {x.ends_at.slice(0, 5)}</span>
              <span className="flex-1">{mm.get(x.member_id)?.full_name}{x.room_id && <span className="text-sub"> · {rm.get(x.room_id)?.name}</span>}</span>
              <button type="button" aria-label="O‘chirish" onClick={() => delShift.mutate(x.id)} className="text-faint hover:text-bad"><Trash2 size={14} /></button>
            </div>
          ))}
          <p className="m-0 py-2 text-xs text-sub">Smenalar jadvalning «Assistentlar» va «Administratorlar» ko‘rinishida chiqadi (jadval sozlamalari → Jadval turi).</p>
        </Group>
      </>}
    </div>
  );
}

// ---------------- Maosh ----------------
function Salary() {
  const { org, refresh } = useOrg();
  const [pct, setPct] = useState(String(org.doctor_share_percent ?? 30));
  const save = useAction(() => http.patch('/api/org', { doctor_share_percent: Math.min(100, Math.max(0, Number(pct) || 0)) }), { success: 'Saqlandi', onDone: () => { void refresh(); } });
  return (
    <div className="flex flex-col gap-4">
      <Group title="Xodimlar maoshi">
        <Item label="Shifokor ulushi, %" hint="Kassa → «Bugun — shifokorlar qancha topdi» shu foiz bilan hisoblanadi">
          <span className="flex items-center gap-2">
            <input type="number" min={0} max={100} aria-label="Shifokor ulushi" className={cx(SIN, '!w-24 text-right')} value={pct} onChange={(e) => setPct(e.target.value)} />
            <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button>
          </span>
        </Item>
        <div className="py-3 text-sm text-sub">
          To‘liq ish haqi hisoblash (stavkalar, ishlar bo‘yicha alohida foiz, berish jurnali) hali qo‘shilmagan. Xodimga berilgan pulni
          Kassa → «Xarajat» orqali kiritish mumkin.
        </div>
      </Group>
    </div>
  );
}

// ---------------- Bajarilgan ish: kategoriya → ish → kerakli materiallar ----------------
function Works() {
  const cats = useList<PriceCategory>('price_categories');
  const items = useList<PriceItem>('price_items', { archived: false });
  const cards = useList<CalcCard>('calc_cards');
  const products = useList<Product>('products', { archived: false });
  const brands = useList<Brand>('brands');
  const groups = useList<WorkMatGroup>('work_mat_groups');
  const [renCat, setRenCat] = useState<{ id: string; name: string } | null>(null);
  const renameCat = useAction(({ id, name }: { id: string; name: string }) => db.update('price_categories', id, { name }), { invalidate: ['price_categories'], onDone: () => setRenCat(null) });
  const setTeeth = useAction(({ id, on }: { id: string; on: boolean }) => db.update('price_categories', id, { ask_teeth: on }), { invalidate: ['price_categories'] });
  const [catId, setCatId] = useState<string | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [nc, setNc] = useState('');
  const [nw, setNw] = useState('');
  const cat = cats.data?.find((c) => c.id === catId) ?? cats.data?.[0];
  const works = (items.data ?? []).filter((i) => i.category_id === cat?.id);
  const work = works.find((w) => w.id === workId) ?? works[0];
  const addCat = useAction(() => db.insert<PriceCategory>('price_categories', { name: nc.trim(), position: cats.data?.length ?? 0, color_idx: (cats.data?.length ?? 0) % 6 }),
    { invalidate: ['price_categories'], onDone: (c) => { setNc(''); setCatId(c.id); setWorkId(null); } });
  const setIcon = useAction(({ id, icon }: { id: string; icon: CatIcon }) => db.update('price_categories', id, { icon }), { invalidate: ['price_categories'] });
  const delCat = useAction((id: string) => db.remove('price_categories', id), { invalidate: ['price_categories', 'price_items'], onDone: () => setCatId(null) });
  const addWork = useAction(() => db.insert<PriceItem>('price_items', { category_id: cat!.id, name: nw.trim(), price: 0, position: works.length }),
    { invalidate: ['price_items'], onDone: (w) => { setNw(''); setWorkId(w.id); } });
  const delWork = useAction((id: string) => db.update('price_items', id, { archived: true }), { invalidate: ['price_items'] });
  const [askDel, setAskDel] = useState<{ kind: 'cat' | 'work'; id: string; name: string } | null>(null);
  const row = (on: boolean) => cx('flex items-center gap-3 rounded-lg md:gap-1', on ? 'bg-[#e6f6fc] font-semibold text-primary-hover' : 'text-fg');
  const H = 'px-1.5 pb-1.5 text-xs font-semibold tracking-[.04em] text-sub uppercase';
  const IN = 'h-9 min-w-0 flex-1 rounded-md border border-line px-2.5 text-sm';
  const PLUS = 'h-9 w-9 flex-none rounded-md bg-primary text-xl text-white disabled:opacity-50';
  return (
    <div className="flex max-w-[1380px] flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold">Bajarilgan ish</h2>
        <span className="text-sm text-sub">Kategoriya va ishlarni kiriting, har bir ishga ombordagi kerakli materiallar va odatdagi miqdorini biriktiring. Shifokor «Material xarajat»ni ochganda shu ro‘yxat chiqadi. Ishlar Praysdagi xizmatlar bilan bir xil — narxi Prays bo‘limida.</span>
      </div>
      <div className="flex flex-wrap overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(7,18,30,.04)]">
        <section aria-label="Kategoriyalar" className="flex flex-[1_1_220px] flex-col gap-1 border-r border-line p-3.5">
          <span className={H}>Kategoriyalar</span>
          {(cats.data ?? []).map((c) => (
            <div key={c.id} className={row(c.id === cat?.id)}>
              {renCat?.id === c.id ? (
                <form className="flex flex-1 gap-1 p-1" onSubmit={(e) => { e.preventDefault(); if (renCat.name.trim()) renameCat.mutate({ id: c.id, name: renCat.name.trim() }); }}>
                  <input autoFocus aria-label="Kategoriya nomi" value={renCat.name} onChange={(e) => setRenCat({ id: c.id, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Escape') setRenCat(null); }} className="h-8 min-w-0 flex-1 rounded-md border border-primary px-2 text-sm font-normal text-fg" />
                  <button type="submit" className="h-8 rounded-md bg-primary px-2 text-xs text-white">OK</button>
                </form>
              ) : (
                <button type="button" onClick={() => { setCatId(c.id); setWorkId(null); }} className="flex min-h-10 flex-1 items-center gap-2 px-2.5 text-left text-sm">
                  <CatIconSvg icon={c.icon} size={16} />{c.name} <span className="text-xs font-normal text-sub">· {(items.data ?? []).filter((i) => i.category_id === c.id).length}</span>
                </button>
              )}
              {renCat?.id !== c.id && <button type="button" onClick={() => setRenCat({ id: c.id, name: c.name })} aria-label={`${c.name}: nomini tahrirlash`} title="Nomini tahrirlash" className="grid h-10 w-10 flex-none place-items-center rounded-md text-faint hover:text-primary md:h-8 md:w-8"><Pencil size={14} /></button>}
              <button type="button" onClick={() => setAskDel({ kind: 'cat', id: c.id, name: c.name })} aria-label="Kategoriyani o‘chirish" title="O‘chirish" className="grid h-10 w-10 flex-none place-items-center rounded-md text-faint hover:text-bad md:h-8 md:w-8"><Trash2 size={15} /></button>
            </div>
          ))}
          <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (nc.trim()) addCat.mutate(undefined); }}>
            <label htmlFor="wsNc" className="sr-only">Yangi kategoriya</label>
            <input id="wsNc" placeholder="Yangi kategoriya" value={nc} onChange={(e) => setNc(e.target.value)} className={IN} />
            <button type="submit" aria-label="Kategoriya qo‘shish" disabled={!nc.trim()} className={PLUS}>+</button>
          </form>
          {cat && (
            <label className="mt-3 flex items-start gap-2.5 rounded-lg bg-surface p-2.5 text-sm">
              <Toggle on={cat.ask_teeth} label="Tish formulasi so‘ralsin" onChange={(v) => setTeeth.mutate({ id: cat.id, on: v })} />
              <span><b className="font-medium">Tish formulasi</b><br /><span className="text-xs text-sub">«{cat.name}» tanlanganda shifokordan tishlar so‘ralsin</span></span>
            </label>
          )}
          {cat && (
            <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Kategoriya belgisi">
              {CAT_ICONS.map((i) => (
                <button key={i.key} type="button" role="radio" aria-checked={cat.icon === i.key} title={i.label} onClick={() => setIcon.mutate({ id: cat.id, icon: i.key })}
                  className={cx('grid h-8 w-8 place-items-center rounded-md', cat.icon === i.key ? 'bg-primary text-white' : 'bg-muted text-sub')}><CatIconSvg icon={i.key} size={16} /></button>
              ))}
            </div>
          )}
        </section>
        <section aria-label="Ishlar" className="flex flex-[1_1_280px] flex-col gap-1 border-r border-line p-3.5">
          <span className={H}>{cat?.name ?? ''} — ishlar</span>
          {works.map((w) => (
            <div key={w.id} className={row(w.id === work?.id)}>
              <button type="button" onClick={() => setWorkId(w.id)} className="flex min-h-11 flex-1 flex-col justify-center px-2.5 py-1 text-left">
                <span className="text-sm">{w.name || 'Nomsiz'}</span>
                <span className="text-xs font-normal text-sub">{(cards.data ?? []).filter((c) => c.price_item_id === w.id).length} ta material</span>
              </button>
              <button type="button" onClick={() => setAskDel({ kind: 'work', id: w.id, name: w.name })} aria-label="Ishni o‘chirish" title="O‘chirish" className="grid h-10 w-10 flex-none place-items-center rounded-md text-faint hover:text-bad md:h-8 md:w-8"><Trash2 size={15} /></button>
            </div>
          ))}
          {cat && (
            <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (nw.trim()) addWork.mutate(undefined); }}>
              <label htmlFor="wsNw" className="sr-only">Yangi ish</label>
              <input id="wsNw" placeholder="Yangi ish nomi" value={nw} onChange={(e) => setNw(e.target.value)} className={IN} />
              <button type="submit" aria-label="Ish qo‘shish" disabled={!nw.trim()} className={PLUS}>+</button>
            </form>
          )}
        </section>
        <section aria-label="Materiallar" className="flex flex-[2_1_420px] flex-col gap-2 px-[18px] py-3.5">
          <span className="text-xs font-semibold tracking-[.04em] text-sub uppercase">{work?.name ?? 'Ish'} — materiallar</span>
          {!work ? <span className="py-6 text-sm text-sub">Avval ish qo‘shing yoki tanlang.</span>
            : <WorkMaterials work={work} allWorks={items.data ?? []} products={products.data ?? []} brands={brands.data ?? []} cards={cards.data ?? []} groups={groups.data ?? []} />}
        </section>
        <Confirm open={!!askDel} danger yes="O‘chirish" loading={delCat.isPending || delWork.isPending} onNo={() => setAskDel(null)}
          onYes={() => { if (!askDel) return; if (askDel.kind === 'cat') delCat.mutate(askDel.id); else delWork.mutate(askDel.id); setAskDel(null); }}
          text={askDel?.kind === 'cat' ? `«${askDel.name}» kategoriyasi o‘chirilsinmi? Undagi barcha ishlar va ularning materiallari ham butunlay o‘chadi — buni qaytarib bo‘lmaydi.` : `«${askDel?.name ?? ''}» ishi o‘chirilsinmi? U praysdan ham arxivga o‘tadi.`} />
      </div>
    </div>
  );
}

// ---------------- Ma'lumotnomalar ----------------
interface Tpl { id: string; name: string; stages: unknown[] }
function Dicts() {
  const tpls = useList<Tpl>('plan_templates');
  const del = useAction((id: string) => db.remove('plan_templates', id), { invalidate: ['plan_templates'], success: 'Shablon o‘chirildi' });
  const cats = useList<{ id: string; name: string; archived: boolean }>('expense_categories');
  return (
    <div className="grid max-w-[980px] gap-4 md:grid-cols-2">
      <Group title="Davolash rejasi shablonlari">
        {(tpls.data ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-line py-2 text-sm last:border-b-0">
            <span className="flex-1">{t.name}</span><span className="text-sub">{t.stages.length} bosqich</span>
            <button type="button" aria-label="O‘chirish" onClick={() => del.mutate(t.id)} className="text-faint hover:text-bad"><Trash2 size={14} /></button>
          </div>
        ))}
        {tpls.data?.length === 0 && <div className="py-4 text-sm text-sub">Shablon yo‘q. Bemor kartasida reja sozlamalari → «Shablon sifatida saqlash».</div>}
      </Group>
      <Group title="Xarajat kategoriyalari">
        {(cats.data ?? []).filter((c) => !c.archived).map((c) => <div key={c.id} className="border-b border-line py-2 text-sm last:border-b-0">{c.name}</div>)}
        <div className="py-2 text-xs text-sub">Tahrirlash: Kassa → sozlamalar (⚙).</div>
      </Group>
    </div>
  );
}

// ---------------- Xodimlar ----------------
const ROLE_TABS: { key: Role | ''; label: string }[] = [
  { key: '', label: 'Hammasi' }, { key: 'doctor', label: 'Shifokorlar' }, { key: 'assistant', label: 'Assistentlar' },
  { key: 'admin', label: 'Administratorlar' }, { key: 'curator', label: 'Kuratorlar' }, { key: 'storekeeper', label: 'Omborchilar' },
];
const COLORS = ['#0ea5e9', '#8b5cf6', '#f97316', '#10b981', '#ef4444', '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#64748b'];

function Staff() {
  const { members, branches } = useOrg();
  const [role, setRole] = useState<Role | ''>('');
  const [open, setOpen] = useState<Member | 'new' | null>(null);
  const bmap = byId(branches);
  const list = members.filter((m) => !role || m.role === role);
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-lg font-semibold">Xodimlar</h2>
        <Button variant="primary" size="sm" onClick={() => setOpen('new')}><Plus size={15} /> Xodim qo‘shish</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {ROLE_TABS.map((r) => (
          <button key={r.key} type="button" onClick={() => setRole(r.key)}
            className={cx('h-7 rounded-lg px-2.5 text-[13px] font-medium', role === r.key ? 'bg-nav' : 'text-sub hover:bg-muted')}>{r.label}</button>
        ))}
      </div>
      <Card>
        {list.length === 0 && <Empty>Xodimlar yo‘q</Empty>}
        {list.map((m) => (
          <div key={m.id} className={cx('flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0', !m.is_active && 'opacity-50')}>
            <span className="grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: m.color }}>{initials(m.full_name)}</span>
            <div className="min-w-[180px] flex-1">
              <div className="font-medium">{m.full_name}</div>
              <div className="text-xs text-sub">{ROLE_LABEL[m.role]}{!m.is_active && ' · faol emas'}</div>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.role === 'owner' || m.all_branches ? <Badge tone="blue">Barcha filiallar</Badge>
                : m.branch_ids.map((b) => <Badge key={b}>{bmap.get(b)?.name ?? '—'}</Badge>)}
            </div>
            {m.role !== 'owner' && <button type="button" aria-label="Tahrirlash" onClick={() => setOpen(m)} className="text-sub hover:text-fg"><Pencil size={15} /></button>}
          </div>
        ))}
      </Card>
      {open && <StaffModal m={open === 'new' ? undefined : open} branches={branches} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StaffModal({ m, branches, onClose }: { m?: Member; branches: Branch[]; onClose: () => void }) {
  const { refresh, branch } = useOrg();
  const [f, setF] = useState({
    full_name: m?.full_name ?? '', login: '', password: '', role: (m?.role ?? 'doctor') as Role, color: m?.color ?? COLORS[0]!,
    all_branches: m?.all_branches ?? false, branch_ids: m?.branch_ids ?? [branch.id], is_active: m?.is_active ?? true,
    permissions: (m?.permissions ?? {}) as Partial<Record<Perm, boolean>>,
  });
  const [newPw, setNewPw] = useState('');
  const save = useAction(async () => {
    if (m) {
      return http.patch(`/api/staff/${m.id}`, { full_name: f.full_name, role: f.role, color: f.color, is_active: f.is_active, all_branches: f.all_branches, branch_ids: f.branch_ids, permissions: f.permissions });
    }
    const isEmail = f.login.includes('@');
    return http.post('/api/staff', { full_name: f.full_name, email: isEmail ? f.login : '', phone: isEmail ? '' : f.login, password: f.password, role: f.role, color: f.color, all_branches: f.all_branches, branch_ids: f.branch_ids, permissions: f.permissions });
  }, { success: 'Saqlandi', onDone: () => { void refresh(); onClose(); } });
  const resetPw = useAction(() => http.post(`/api/staff/${m!.id}/password`, { password: newPw }), { success: 'Parol yangilandi', onDone: () => setNewPw('') });
  const permOn = (p: Perm) => (p in f.permissions ? Boolean(f.permissions[p]) : roleDefault(f.role, p));
  const togglePerm = (p: Perm) => {
    const v = !permOn(p);
    const next = { ...f.permissions };
    if (v === roleDefault(f.role, p)) delete next[p]; else next[p] = v;
    setF({ ...f, permissions: next });
  };

  return (
    <Modal open onClose={onClose} title={m ? 'Xodim' : 'Xodim qo‘shish'} width={720}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Familiya va ism *">{(id) => <Input id={id} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
          {!m && <>
            <Field label="Login: telefon yoki email *">{(id) => <Input id={id} value={f.login} placeholder="+998 90 123 45 67" autoComplete="off" onChange={(e) => setF({ ...f, login: e.target.value })} />}</Field>
            <Field label="Parol *" hint="Kamida 8 belgi. Xodim keyin o‘zi o‘zgartiradi.">{(id) => <Input id={id} type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
          </>}
          <Field label="Lavozimi">{(id) => (
            <Select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role, permissions: {} })}>
              {(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>)}
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-sub">Jadvaldagi rangi</span>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => <button key={c} type="button" aria-label={`Rang ${c}`} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })}
                className={cx('h-7 w-7 rounded-full', f.color === c && 'ring-2 ring-fg ring-offset-2')} style={{ background: c }} />)}
            </div>
          </div>
          {m && <Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Faol (tizimga kira oladi)" />}
          {m && (
            <div className="flex items-end gap-2 border-t border-line pt-3">
              <Field label="Yangi parol berish" className="flex-1">{(id) => <Input id={id} type="text" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />}</Field>
              <Button disabled={newPw.length < 8} loading={resetPw.isPending} onClick={() => resetPw.mutate(undefined)}>Yangilash</Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">Filiallar</span>
            <Switch checked={f.all_branches} onChange={(v) => setF({ ...f, all_branches: v })} label="Barcha filiallar" />
            {!f.all_branches && branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.branch_ids.includes(b.id)} onChange={(e) => setF({ ...f, branch_ids: e.target.checked ? [...f.branch_ids, b.id] : f.branch_ids.filter((x) => x !== b.id) })} />{b.name}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-sub">Ruxsatlar</span>
            <span className="text-xs text-faint">Lavozim bo‘yicha belgilanadi; kerak bo‘lsa alohida o‘zgartiring.</span>
            {ALL_PERMS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={permOn(p.key)} onChange={() => togglePerm(p.key)} />
                <span className={cx(p.key in f.permissions && 'font-medium')}>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Filiallar va kabinetlar ----------------
function Branches() {
  const { branches, refresh } = useOrg();
  const rooms = useList<Room>('rooms');
  const [newBranch, setNewBranch] = useState('');
  const [roomName, setRoomName] = useState<Record<string, string>>({});
  const addBranch = useAction(() => db.insert('branches', { name: newBranch.trim(), position: branches.length }), { success: 'Filial qo‘shildi', onDone: () => { setNewBranch(''); void refresh(); } });
  const renBranch = useAction(({ id, name }: { id: string; name: string }) => db.update('branches', id, { name }), { onDone: () => { void refresh(); } });
  const addRoom = useAction((b: string) => db.insert('rooms', { branch_id: b, name: roomName[b]?.trim(), position: (rooms.data ?? []).filter((r) => r.branch_id === b).length }),
    { invalidate: ['rooms'], onDone: (_r) => setRoomName({}) });
  const updRoom = useAction(({ id, patch }: { id: string; patch: Partial<Room> }) => db.update('rooms', id, patch), { invalidate: ['rooms'] });
  return (
    <div className="flex max-w-4xl flex-col gap-3">
      {branches.map((b) => (
        <Card key={b.id} className="flex flex-col gap-3 p-4">
          <input defaultValue={b.name} aria-label="Filial nomi" onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && renBranch.mutate({ id: b.id, name: e.target.value.trim() })}
            className="rounded-md border border-transparent px-1 text-base font-semibold hover:border-line focus:border-primary focus:outline-none" />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-sub">Kabinetlar (jadval ustunlari)</span>
            {(rooms.data ?? []).filter((r) => r.branch_id === b.id).map((r) => (
              <div key={r.id} className={cx('flex items-center gap-2', !r.is_active && 'opacity-50')}>
                <input type="color" aria-label="Rang" value={r.color} onChange={(e) => updRoom.mutate({ id: r.id, patch: { color: e.target.value } })} className="h-7 w-7 rounded border-0 bg-transparent" />
                <input defaultValue={r.name} aria-label="Kabinet nomi" onBlur={(e) => e.target.value !== r.name && updRoom.mutate({ id: r.id, patch: { name: e.target.value } })}
                  className="h-8 flex-1 rounded-lg border border-line px-2 text-sm" />
                <button type="button" onClick={() => updRoom.mutate({ id: r.id, patch: { is_active: !r.is_active } })} className="text-xs text-sub hover:text-fg">{r.is_active ? 'Yashirish' : 'Ko‘rsatish'}</button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={roomName[b.id] ?? ''} placeholder="Masalan: Kabinet 1" onChange={(e) => setRoomName({ ...roomName, [b.id]: e.target.value })} className="h-8" />
              <Button size="sm" className="h-8" disabled={!roomName[b.id]?.trim()} onClick={() => addRoom.mutate(b.id)}><Plus size={14} /> Kabinet</Button>
            </div>
          </div>
        </Card>
      ))}
      <Card className="flex flex-wrap items-end gap-2 p-4">
        <Field label="Yangi filial" className="min-w-[240px] flex-1">{(id) => <Input id={id} value={newBranch} placeholder="Masalan: Sergeli" onChange={(e) => setNewBranch(e.target.value)} />}</Field>
        <Button variant="primary" disabled={!newBranch.trim()} loading={addBranch.isPending} onClick={() => addBranch.mutate(undefined)}><Plus size={15} /> Filial qo‘shish</Button>
      </Card>
      <p className="m-0 text-xs text-sub">Yangi filial uchun 3 ta kassa (Naqd, Terminal, Click) va asosiy ombor avtomatik yaratiladi.</p>
    </div>
  );
}

// ---------------- Statuslar ----------------
const ST_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b', '#14b8a6'];
function Statuses() {
  const st = useList<PatientStatus>('patient_statuses');
  const [name, setName] = useState('');
  const [color, setColor] = useState(ST_COLORS[0]!);
  const [del, setDel] = useState<PatientStatus | null>(null);
  const add = useAction(() => db.insert('patient_statuses', { name: name.trim(), color, kind: 'manual', position: st.data?.length ?? 0 }), { invalidate: ['patient_statuses'], success: 'Status qo‘shildi', onDone: () => setName('') });
  const upd = useAction(({ id, patch }: { id: string; patch: Partial<PatientStatus> }) => db.update('patient_statuses', id, patch), { invalidate: ['patient_statuses'] });
  const remove = useAction((s: PatientStatus) => db.remove('patient_statuses', s.id), { invalidate: ['patient_statuses'], onDone: () => setDel(null) });
  const manual = (st.data ?? []).filter((s) => s.kind === 'manual');
  const rem = (st.data ?? []).filter((s) => s.kind === 'reminder');
  return (
    <div className="grid max-w-5xl gap-4 md:grid-cols-2">
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="m-0 text-base font-semibold">Yangi status qo‘shish</h2>
        <Field label="Status nomi">{(id) => <Input id={id} value={name} placeholder="Masalan: VIP" onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-1.5">{ST_COLORS.map((c) => <button key={c} type="button" aria-label={`Rang ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cx('h-7 w-7 rounded-full', color === c && 'ring-2 ring-fg ring-offset-2')} style={{ background: c }} />)}</div>
        <div><Button variant="primary" disabled={!name.trim()} onClick={() => add.mutate(undefined)}><Plus size={15} /> Qo‘shish</Button></div>
      </Card>
      <Card className="flex flex-col gap-1 p-5">
        <h2 className="m-0 mb-2 text-base font-semibold">Statuslar</h2>
        {manual.length === 0 && <span className="text-sm text-sub">Hali status yo‘q</span>}
        {manual.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-1">
            <input type="color" aria-label="Rang" value={s.color} onChange={(e) => upd.mutate({ id: s.id, patch: { color: e.target.value } })} className="h-6 w-6 rounded border-0 bg-transparent" />
            <input defaultValue={s.name} aria-label="Nomi" onBlur={(e) => e.target.value !== s.name && upd.mutate({ id: s.id, patch: { name: e.target.value } })} className="h-8 flex-1 rounded-lg border border-transparent px-2 text-sm hover:border-line focus:border-primary focus:outline-none" />
            <button type="button" aria-label="O‘chirish" onClick={() => setDel(s)} className="text-faint hover:text-bad"><Trash2 size={15} /></button>
          </div>
        ))}
        <h2 className="m-0 mt-4 mb-2 text-base font-semibold">Eslatish statuslari</h2>
        {rem.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-1 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.name}</span>
            <input type="number" min={1} aria-label="Oy" defaultValue={s.reminder_months ?? 1} onBlur={(e) => upd.mutate({ id: s.id, patch: { reminder_months: Math.max(1, Number(e.target.value) || 1) } })} className="h-8 w-16 rounded-lg border border-line px-2 text-right" /> oy
          </div>
        ))}
      </Card>
      <Confirm open={!!del} danger yes="O‘chirish" text={`«${del?.name}» statusi o‘chirilsinmi?`} onNo={() => setDel(null)} onYes={() => del && remove.mutate(del)} />
    </div>
  );
}

// ---------------- Prays ----------------
const PCOL: [string, string][] = [['#ece3fb', '#cdbdf0'], ['#e4e6f8', '#c5c9ef'], ['#d9eefb', '#aed6f1'], ['#dff4e6', '#b6e2c4'], ['#fdece2', '#f4c9ad'], ['#fdf4da', '#f0dc9c']];
const nfp = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kiritilgan qiymatni yozishni to'xtatgandan keyin saqlaydi. */
function useSaver(save: (v: string) => void, delay = 600) {
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  return (v: string) => { clearTimeout(t.current); t.current = setTimeout(() => save(v), delay); };
}

function Price() {
  const cats = useList<PriceCategory>('price_categories');
  const items = useList<PriceItem>('price_items', { archived: false });
  const [del, setDel] = useState<PriceCategory | null>(null);
  const addCat = useAction(() => db.insert('price_categories', { name: 'Yangi kategoriya', color_idx: (cats.data?.length ?? 0) % PCOL.length, position: cats.data?.length ?? 0 }), { invalidate: ['price_categories'] });
  const updCat = useAction(({ id, patch }: { id: string; patch: Partial<PriceCategory> }) => db.update('price_categories', id, patch), { invalidate: ['price_categories'] });
  const removeCat = useAction((c: PriceCategory) => db.remove('price_categories', c.id), { invalidate: ['price_categories', 'price_items'], onDone: () => setDel(null) });
  const addItem = useAction((c: string) => db.insert('price_items', { category_id: c, name: '', price: 0, position: (items.data ?? []).filter((i) => i.category_id === c).length }), { invalidate: ['price_items'] });
  const delItem = useAction((i: PriceItem) => db.update('price_items', i.id, { archived: true }), { invalidate: ['price_items'] });

  return (
    <div className="flex max-w-[1380px] flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="m-0 text-lg font-semibold">Prays</h2>
        <span className="text-[13px] text-sub">Nomi, kodi va narxini shu yerning o‘zida o‘zgartiring — o‘zgarishlar darhol saqlanadi.</span>
      </div>
      {cats.data?.length === 0 && <Card><Empty>Prays bo‘sh. Birinchi kategoriyani qo‘shing.</Empty></Card>}
      {(cats.data ?? []).map((c) => {
        const col = PCOL[c.color_idx % PCOL.length]!;
        const its = (items.data ?? []).filter((i) => i.category_id === c.id);
        return (
          <section key={c.id} className="rounded-md" style={{ border: `1px solid ${col[1]}`, background: col[0] }}>
            <div className="flex items-center gap-2.5 py-2 pr-2 pl-3">
              <span title="Tartib" className="grid w-6 place-items-center text-sub"><Menu size={18} /></span>
              <CatName c={c} onSave={(name) => updCat.mutate({ id: c.id, patch: { name } })} />
              <button type="button" onClick={() => updCat.mutate({ id: c.id, patch: { color_idx: (c.color_idx + 1) % PCOL.length } })} aria-label="Kategoriya rangini o‘zgartirish" title="Rangini o‘zgartirish" className="grid h-8 w-8 place-items-center text-sub"><Palette size={20} /></button>
              <button type="button" onClick={() => setDel(c)} aria-label="Kategoriyani o‘chirish" title="Kategoriyani o‘chirish" className="grid h-8 w-8 place-items-center text-sub"><Trash2 size={18} /></button>
            </div>
            <div className="flex flex-col pr-2 pb-2.5 pl-3">
              {its.map((i) => <PriceRow key={i.id} i={i} col={col[1]} onDelete={() => delItem.mutate(i)} />)}
              <button type="button" onClick={() => addItem.mutate(c.id)}
                className="mt-2 ml-[34px] inline-flex h-8 items-center gap-2 self-start rounded bg-white px-3 text-sm shadow-[0_1px_2px_rgba(7,18,30,.08)]">
                <Plus size={16} className="text-[#3d4858]" /> Prays pozitsiyasini qo‘shish
              </button>
            </div>
          </section>
        );
      })}
      <button type="button" onClick={() => addCat.mutate(undefined)} className="inline-flex h-[38px] items-center gap-2 self-start rounded-md border border-dashed border-faint bg-white px-4 text-sm">
        <Plus size={16} className="text-[#3d4858]" /> Kategoriya qo‘shish
      </button>
      <Confirm open={!!del} danger yes="O‘chirish" text={`«${del?.name}» kategoriyasi va undagi barcha xizmatlar o‘chiriladi. Avval yopilgan aktlarga ta’sir qilmaydi.`}
        onNo={() => setDel(null)} onYes={() => del && removeCat.mutate(del)} loading={removeCat.isPending} />
    </div>
  );
}

function CatName({ c, onSave }: { c: PriceCategory; onSave: (v: string) => void }) {
  const [v, setV] = useState(c.name);
  const save = useSaver((x) => x.trim() && onSave(x.trim()));
  return (
    <>
      <label className="sr-only" htmlFor={`pc-${c.id}`}>Kategoriya nomi</label>
      <input id={`pc-${c.id}`} value={v} onChange={(e) => { setV(e.target.value); save(e.target.value); }}
        className="h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-[17px] font-semibold focus:border-[#9aa3ad] focus:outline-none" />
    </>
  );
}

function PriceRow({ i, col, onDelete }: { i: PriceItem; col: string; onDelete: () => void }) {
  const [f, setF] = useState({ name: i.name, code: i.code ?? '', price: String(i.price) });
  const upd = useAction((patch: Partial<PriceItem>) => db.update('price_items', i.id, patch), { invalidate: ['price_items'] });
  const saveName = useSaver((v) => upd.mutate({ name: v }));
  const saveCode = useSaver((v) => upd.mutate({ code: v || null }));
  const savePrice = useSaver((v) => upd.mutate({ price: Math.max(0, Math.round(Number(v) || 0)) }));
  const cell = { borderLeft: `1px solid ${col}` };
  return (
    <div className="flex items-center gap-2.5">
      <span title="Tartib" className="grid w-6 place-items-center text-sub"><Menu size={18} /></span>
      <div className="grid min-w-0 flex-1 items-center bg-white/60" style={{ gridTemplateColumns: 'minmax(0,1fr) 80px 160px 28px 140px', border: `1px solid ${col}`, borderTop: 0 }}>
        <input aria-label="Xizmat nomi" value={f.name} placeholder="Xizmat nomi" onChange={(e) => { setF({ ...f, name: e.target.value }); saveName(e.target.value); }} className="h-[30px] min-w-0 bg-transparent px-1.5 text-sm outline-none" />
        <input aria-label="Kod" placeholder="Kod" value={f.code} onChange={(e) => { setF({ ...f, code: e.target.value }); saveCode(e.target.value); }} className="h-[30px] min-w-0 bg-transparent px-1.5 text-sm outline-none" style={cell} />
        <span className="flex items-center gap-1 pr-1.5" style={cell}>
          <input type="number" min={0} aria-label="Narx" value={f.price} onChange={(e) => { setF({ ...f, price: e.target.value }); savePrice(e.target.value); }} className="h-[30px] w-full min-w-0 bg-transparent px-1 text-right text-sm outline-none" />
          <span className="text-[13px] text-[#3d4858]">so‘m</span>
        </span>
        <span aria-hidden="true" className="grid place-items-center text-[15px] text-[#3d4858]">→</span>
        <span title="Yakuniy narx" className="flex items-center justify-end px-1.5 text-sm whitespace-nowrap text-faint">{nfp.format(Number(f.price) || 0)} so‘m</span>
      </div>
      <button type="button" onClick={onDelete} aria-label="Pozitsiyani o‘chirish" title="O‘chirish" className="grid h-[30px] w-[30px] place-items-center text-sub"><Trash2 size={17} /></button>
    </div>
  );
}
