import { useRef, useState, type ReactNode } from 'react';
import { UserRoundPlus, UserRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useOrg } from '@/lib/auth';
import { db, http } from '@/lib/api';
import { useList } from '@/lib/hooks';
import { MONTHS, ageOf, isoDate, pad, phoneDigits, phoneMask } from '@/lib/format';
import { Link, useTitle } from '@/lib/router';
import type { Patient, PatientStatus, RecordFile } from '@/lib/types';
import { cx } from '@/components/ui';

const IN = 'h-[38px] w-full min-w-0 border-0 border-b border-line bg-transparent pr-1 text-[15px] text-fg outline-none focus:border-primary';
const SEL = 'h-[38px] rounded-[3px] border border-line bg-white px-2 text-[15px] text-[#3d4858]';
export const CHANNELS: Record<NonNullable<Patient['contact_channel']>, string> = { call: 'Qo‘ng‘iroq', tg: 'Telegram', sms: 'SMS', wa: 'WhatsApp' };
export const SOURCES = ['Tanish-bilish', 'Instagram', 'Telegram', 'Google', 'Ko‘cha reklamasi', 'Boshqa'];

function Row({ label, req, info, htmlFor, top, children, w = 170 }: { label: string; req?: boolean; info?: string; htmlFor?: string; top?: boolean; children: ReactNode; w?: number }) {
  return (
    <div className={cx('grid grid-cols-1 gap-1.5 sm:gap-[30px]', top ? 'items-start' : 'items-center')} style={{ gridTemplateColumns: `minmax(0,${w}px) 1fr` }}>
      <label htmlFor={htmlFor} className={cx('text-right text-[15px]', top && 'pt-2')}>
        {label}{req && <span className="text-bad"> *</span>}{info && <> <span title={info} className="cursor-help text-faint">ⓘ</span></>}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
const Icon = ({ c, children }: { c?: string; children: ReactNode }) => <span aria-hidden="true" className={cx('absolute top-2.5 left-1', c ?? 'text-faint')}>{children}</span>;

/** "Yangi bemor" sahifasi. `patient` berilsa — tahrirlash rejimi (bemor kartasidan). */
export function NewPatient({ patient, onDone }: { patient?: Patient; onDone?: () => void }) {
  useTitle(patient ? patient.full_name : 'Yangi bemor');
  const { branch, members } = useOrg();
  const qc = useQueryClient();
  const bd = patient?.birth_date?.split('-') ?? [];
  const F0 = {
    last: patient?.last_name ?? '', first: patient?.first_name ?? '', middle: patient?.middle_name ?? '', phone: phoneDigits(patient?.phone ?? ''), phone2: phoneDigits(patient?.phone2 ?? ''),
    disc: patient?.discount_percent ? String(patient.discount_percent) : '', addr: patient?.address ?? '', email: patient?.email ?? '',
    g: patient?.gender === 'female' ? 'f' : patient?.gender === 'male' ? 'm' : 'u', imp: patient?.important_info ?? '', note: patient?.notes ?? '', card: '',
    y: bd[0] ?? '', mo: bd[1] ? String(Number(bd[1])) : '', d: bd[2] ? String(Number(bd[2])) : '',
    cur: patient?.curator_id ?? '', reg: patient?.registered_on ?? isoDate(new Date()), ch: patient?.contact_channel ?? '', src: patient?.source ?? '', payer: patient?.payer ?? '',
    st: patient?.status_ids ?? [] as string[],
  };
  const [f, setF] = useState(F0);
  const [photo, setPhoto] = useState<string | null>(patient?.photo_file_id ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Patient | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof F0>(k: K, v: (typeof F0)[K]) => setF({ ...f, [k]: v });
  const statuses = useList<PatientStatus>('patient_statuses');
  const dupe = useList<Patient>('patients', { phone: '998' + f.phone, deleted_at: null }, { enabled: f.phone.length === 9 });
  const dup = (dupe.data ?? []).find((x) => x.id !== patient?.id);
  const curators = members.filter((m) => m.is_active && m.role !== 'storekeeper');
  const year = new Date().getFullYear();
  const age = f.y ? ageOf(`${f.y}-${pad(Number(f.mo || 1))}-${pad(Number(f.d || 1))}`) : null;
  const ok = !!(f.last.trim() && f.first.trim() && f.reg);

  async function save() {
    if (!ok) return;
    setBusy(true);
    try {
      const row: Record<string, unknown> = {
        last_name: f.last.trim(), first_name: f.first.trim(), middle_name: f.middle.trim(), phone: f.phone ? '998' + f.phone : null, phone2: f.phone2 ? '998' + f.phone2 : null,
        discount_percent: Math.min(100, Math.max(0, Number(f.disc) || 0)), address: f.addr, email: f.email, gender: f.g === 'f' ? 'female' : f.g === 'm' ? 'male' : null,
        important_info: f.imp, notes: f.note, birth_date: f.y && f.mo && f.d ? `${f.y}-${pad(Number(f.mo))}-${pad(Number(f.d))}` : null,
        curator_id: f.cur || null, registered_on: f.reg, contact_channel: f.ch || null, source: f.src || null, payer: f.payer, status_ids: f.st,
      };
      let p: Patient;
      if (patient) p = await db.update<Patient>('patients', patient.id, row);
      else p = await db.insert<Patient>('patients', { ...row, home_branch_id: branch.id, card_number: f.card.trim() || null });
      if (photo === 'pending' && fileRef.current?.files?.[0]) {
        const fd = new FormData();
        fd.append('patient_id', p.id); fd.append('kind', 'image'); fd.append('file', fileRef.current.files[0]);
        const file = await http.post<RecordFile>('/api/files', fd);
        p = await db.update<Patient>('patients', p.id, { photo_file_id: file.id });
      } else if (patient && !photo && patient.photo_file_id) {
        p = await db.update<Patient>('patients', p.id, { photo_file_id: null });
      }
      await qc.invalidateQueries({ queryKey: ['patients'] });
      if (patient) { toast.success('Saqlandi'); onDone?.(); return; }
      setSaved(p); setF({ ...F0, reg: f.reg }); setPhoto(null);
      window.scrollTo(0, 0);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const preview = photo === 'pending' && fileRef.current?.files?.[0] ? URL.createObjectURL(fileRef.current.files[0]) : photo ? `/api/files/${photo}` : null;

  return (
    <div className={cx('flex justify-center', !patient && 'min-h-[calc(100vh-45px)] bg-muted px-6 pt-3 pb-6')}>
      <div className="w-full max-w-[1350px] rounded-md bg-white shadow-[0_1px_2px_rgba(7,18,30,.06)]">
        {!patient && (
          <div className="mx-[22px] flex items-center gap-[18px] border-b border-line pt-[18px] pb-3.5">
            <UserRoundPlus size={58} strokeWidth={1.6} className="text-primary" />
            <h1 className="m-0 text-xl font-medium text-[#3d4858]">Yangi bemor</h1>
          </div>
        )}
        {saved && (
          <div role="status" className="mx-[22px] mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">
            ✓ <b className="font-semibold">{saved.full_name} — karta № {saved.card_number} yaratildi</b>
            <Link to={`/patients/${saved.id}`}>Bemor kartasini ochish →</Link>
            <Link to="/">Qabulga yozish →</Link>
            <button type="button" onClick={() => setSaved(null)} className="ml-auto h-[30px] rounded-md border border-[#bbf7d0] bg-white px-3 text-[13px] text-[#166534]">Yana bemor qo‘shish</button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-[60px] gap-y-4 px-6 pt-[22px] pb-[26px] lg:grid-cols-2 lg:px-[60px]">
          <div className="mb-3 grid gap-10 lg:col-span-2 lg:grid-cols-[300px_minmax(0,640px)] lg:justify-center">
            <div className="flex justify-center lg:justify-end">
              <div className="relative grid h-[168px] w-[168px] place-items-center overflow-hidden rounded border border-line bg-surface shadow-[0_1px_4px_rgba(7,18,30,.1)]">
                {preview ? <img src={preview} alt="" className="h-full w-full object-cover" />
                  : f.last || f.first ? <span className="grid h-full w-full place-items-center bg-primary-soft text-[46px] font-semibold text-[#006b93]">{(f.last[0] ?? '') + (f.first[0] ?? '')}</span>
                  : <UserRound size={120} strokeWidth={1} className="text-[#cfd8de]" />}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setPhoto('pending'); }} />
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Rasm yuklash" title="Rasm yuklash"
                  className="absolute -top-px -right-px h-7 w-7 rounded-full bg-white text-sub shadow-[0_1px_4px_rgba(7,18,30,.2)]">✎</button>
                <button type="button" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Rasmni olib tashlash" title="Rasmni olib tashlash"
                  className="absolute -right-px -bottom-px h-7 w-7 rounded-full bg-white text-sub shadow-[0_1px_4px_rgba(7,18,30,.2)]">×</button>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-3.5">
              <Row label="Familiya" req htmlFor="npL" w={110}><input id="npL" className={cx(IN, 'pl-1')} value={f.last} onChange={(e) => set('last', e.target.value)} autoFocus={!patient} /></Row>
              <Row label="Ism" req htmlFor="npF" w={110}><input id="npF" className={cx(IN, 'pl-1')} value={f.first} onChange={(e) => set('first', e.target.value)} /></Row>
              {patient && <Row label="Otasining ismi" htmlFor="npM" w={110}><input id="npM" className={cx(IN, 'pl-1')} value={f.middle} onChange={(e) => set('middle', e.target.value)} /></Row>}
              <Row label="Telefon" htmlFor="npP" w={110}>
                <span className="relative block"><Icon>✆</Icon>
                  <input id="npP" type="tel" inputMode="numeric" placeholder="+998(__)___-__-__" className={cx(IN, 'pl-7 !text-xl')} value={phoneMask(f.phone)} onChange={(e) => set('phone', phoneDigits(e.target.value))} /></span>
              </Row>
              {dup && (
                <div role="alert" className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e] sm:ml-[140px]">
                  ⚠ Bu raqam bilan bemor bor: <b>{dup.full_name}</b> (№{dup.card_number}). <Link to={`/patients/${dup.id}`}>Kartani ochish</Link>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Row label="Telefon 2" htmlFor="np2"><span className="relative block"><Icon>✆</Icon>
              <input id="np2" type="tel" inputMode="numeric" placeholder="+998(__)___-__-__" className={cx(IN, 'pl-7')} value={phoneMask(f.phone2)} onChange={(e) => set('phone2', phoneDigits(e.target.value))} /></span></Row>
            <Row label="Chegirma" info="Bemorga doimiy chegirma, %. Aktda avtomatik qo‘yiladi" htmlFor="npD"><span className="relative block"><span aria-hidden="true" className="absolute top-[9px] left-1.5 text-faint">%</span>
              <input id="npD" type="number" min={0} max={100} className={cx(IN, 'pl-7')} value={f.disc} onChange={(e) => set('disc', e.target.value)} /></span></Row>
            <Row label="Manzil" htmlFor="npA"><input id="npA" className={cx(IN, 'pl-1')} value={f.addr} onChange={(e) => set('addr', e.target.value)} /></Row>
            <Row label="Email" htmlFor="npE"><span className="relative block"><Icon>✉</Icon>
              <input id="npE" type="email" className={cx(IN, 'pl-7')} value={f.email} onChange={(e) => set('email', e.target.value)} /></span></Row>
            <Row label="Jinsi">
              <span role="radiogroup" aria-label="Jinsi" className="flex flex-wrap items-center gap-[22px] text-[15px]">
                {([['f', '🚺', 'Ayol'], ['m', '🚹', 'Erkak'], ['u', '', 'Aniqlanmagan']] as const).map(([k, ic, l]) => (
                  <label key={k} className="flex items-center gap-1.5"><input type="radio" name="npg" checked={f.g === k} onChange={() => set('g', k)} />{ic && <span aria-hidden="true">{ic}</span>}{l}</label>
                ))}
              </span>
            </Row>
            <Row label="Muhim ma’lumot" info="Allergiya, kasalliklar. To‘ldirilsa, jadvalda va kartada ogohlantirish chiqadi" htmlFor="npI"><span className="relative block"><Icon c="text-bad">⚠</Icon>
              <input id="npI" placeholder="Masalan: lidokainga allergiya" className={cx(IN, 'pl-7')} value={f.imp} onChange={(e) => set('imp', e.target.value)} /></span></Row>
            <Row label="Izoh" htmlFor="npC" top><textarea id="npC" rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} className="w-full resize-y rounded-[3px] border border-line px-2.5 py-2 text-[15px]" /></Row>
            {!patient && <Row label="Karta raqami" htmlFor="npN"><input id="npN" className={cx(IN, 'pl-1')} placeholder="Avtomatik" value={f.card} onChange={(e) => set('card', e.target.value)} /></Row>}
          </div>

          <div className="flex flex-col gap-4">
            <Row label="Tug‘ilgan sana">
              <span className="flex flex-wrap items-center gap-1">
                <select aria-label="Kun" value={f.d} onChange={(e) => set('d', e.target.value)} className={cx(SEL, 'w-[84px]')}><option value="">Kun</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                <select aria-label="Oy" value={f.mo} onChange={(e) => set('mo', e.target.value)} className={cx(SEL, 'w-[196px]')}><option value="">Oy</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                <select aria-label="Tug‘ilgan yil" value={f.y} onChange={(e) => set('y', e.target.value)} className={cx(SEL, 'w-[112px]')}><option value="">Yil</option>{Array.from({ length: 100 }, (_, i) => <option key={i} value={year - i}>{year - i}</option>)}</select>
                {age !== null && age >= 0 && <span className="ml-1.5 text-[13px] text-sub">{age} yosh</span>}
              </span>
            </Row>
            <Row label="Kurator" info="Bemor bilan aloqa uchun mas’ul xodim" htmlFor="npK">
              <select id="npK" value={f.cur} onChange={(e) => set('cur', e.target.value)} className={cx(SEL, 'w-full')}><option value="">—</option>{curators.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select>
            </Row>
            <Row label="Ro‘yxatga olingan" req htmlFor="npR"><input id="npR" type="date" value={f.reg} onChange={(e) => set('reg', e.target.value)} className={cx(IN, 'max-w-[200px] pl-1')} /></Row>
            <Row label="Aloqa usuli" htmlFor="npT">
              <select id="npT" value={f.ch} onChange={(e) => set('ch', e.target.value as typeof f.ch)} className={cx(SEL, 'w-full max-w-[200px]')}><option value="">—</option>{Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Row>
            <Row label="Qayerdan bildi" htmlFor="npS">
              <select id="npS" value={f.src} onChange={(e) => set('src', e.target.value)} className={cx(SEL, 'w-full max-w-[260px]')}><option value="">—</option>{[...new Set([...SOURCES, ...(f.src ? [f.src] : [])])].map((s) => <option key={s}>{s}</option>)}</select>
            </Row>
            <Row label="To‘lovchi" info="Bemor o‘rniga to‘laydigan shaxs yoki tashkilot (ota-ona, korxona)" htmlFor="npPay" top>
              <textarea id="npPay" rows={2} value={f.payer} onChange={(e) => set('payer', e.target.value)} className="w-full resize-y rounded-[3px] border border-line px-2.5 py-2 text-[15px]" />
            </Row>
            <Row label="Bemor statusi" top>
              <span className="flex flex-wrap gap-1.5">
                {(statuses.data ?? []).filter((s) => s.kind === 'manual' || f.st.includes(s.id)).map((s) => {
                  const on = f.st.includes(s.id);
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => set('st', on ? f.st.filter((x) => x !== s.id) : [...f.st, s.id])}
                      className={cx('inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-[13px]', on ? 'font-medium text-fg' : 'border-line bg-white text-sub')}
                      style={on ? { borderColor: s.color, background: `${s.color}1a` } : undefined}>
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}
                    </button>
                  );
                })}
                {statuses.data?.length === 0 && <span className="pt-1.5 text-[13px] text-sub">Statuslar Sozlamalar → Bemor statuslari bo‘limida qo‘shiladi.</span>}
              </span>
            </Row>
          </div>
        </div>

        <div className="mx-[22px] flex items-center justify-end gap-2.5 border-t border-line pt-[18px] pb-[22px]">
          <span className="mr-auto text-[13px] text-sub">{ok ? (patient ? `Karta raqami: ${patient.card_number}` : `Karta raqami: ${f.card.trim() || 'avtomatik'}`) : 'Familiya va ismni kiriting'}</span>
          {patient ? <button type="button" onClick={onDone} className="h-10 rounded-[3px] bg-[#e5e9ec] px-4 text-[15px]">Bekor qilish</button>
            : <Link to="/patients" className="inline-flex h-10 items-center rounded-[3px] bg-[#e5e9ec] px-4 text-[15px] !text-fg no-underline">Bekor qilish</Link>}
          <button type="button" disabled={!ok || busy} onClick={() => void save()}
            className={cx('inline-flex h-10 items-center gap-1.5 rounded-[3px] px-[18px] text-[15px] text-white', ok ? 'bg-primary hover:bg-primary-hover' : 'bg-[#9fd8ee]')}>✓ Saqlash</button>
        </div>
      </div>
    </div>
  );
}
