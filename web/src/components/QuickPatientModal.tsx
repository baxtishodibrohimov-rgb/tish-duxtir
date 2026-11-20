import { useState } from 'react';
import { db } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { MONTHS, pad, phoneDigits, phoneMask } from '@/lib/format';
import type { Patient } from '@/lib/types';
import { Button, Input, LRow, Modal, Select } from './ui';

/** Tezkor "Yangi bemor" oynasi (jadval va qabul oynasidan). */
export function QuickPatientModal({ branchId, init, onClose, onSaved }:
  { branchId: string; init?: { last?: string; first?: string; phone?: string }; onClose: () => void; onSaved: (p: Patient) => void }) {
  const [f, setF] = useState({ last: init?.last ?? '', first: init?.first ?? '', phone: phoneDigits(init?.phone ?? ''), g: 'u', d: '', mo: '', y: '' });
  const ok = f.last.trim() && f.first.trim();
  const save = useAction(() => db.insert<Patient>('patients', {
    last_name: f.last.trim(), first_name: f.first.trim(), phone: f.phone ? '998' + f.phone : null, home_branch_id: branchId,
    gender: f.g === 'f' ? 'female' : f.g === 'm' ? 'male' : null,
    birth_date: f.d && f.mo && f.y ? `${f.y}-${pad(Number(f.mo))}-${pad(Number(f.d))}` : null,
  }), { invalidate: ['patients'], success: 'Bemor qo‘shildi', onDone: onSaved });
  const year = new Date().getFullYear();
  return (
    <Modal open onClose={onClose} title="Yangi bemor" width={686}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><span className="flex-1" /><Button variant="primary" disabled={!ok} loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="flex flex-col gap-[18px] pb-2">
        <LRow label="Familiya" req htmlFor="qpL" width={140}><Input id="qpL" value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} /></LRow>
        <LRow label="Ism" req htmlFor="qpF" width={140}><Input id="qpF" value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} /></LRow>
        <LRow label="Telefon" htmlFor="qpP" width={140}>
          <Input id="qpP" type="tel" inputMode="numeric" placeholder="+998(__)___-__-__" value={phoneMask(f.phone)} onChange={(e) => setF({ ...f, phone: phoneDigits(e.target.value) })} />
        </LRow>
        <div role="radiogroup" aria-label="Jinsi" className="flex flex-wrap items-center gap-[22px] text-[15px] sm:ml-[176px]">
          {([['f', '🚺', 'Ayol'], ['m', '🚹', 'Erkak'], ['u', '', 'Aniqlanmagan']] as const).map(([k, ic, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="radio" name="qpg" checked={f.g === k} onChange={() => setF({ ...f, g: k })} />{ic && <span aria-hidden="true">{ic}</span>}{l}</label>
          ))}
        </div>
        <LRow label="Tug‘ilgan sana" width={140}>
          <div className="flex flex-wrap gap-1">
            <Select aria-label="Kun" value={f.d} onChange={(e) => setF({ ...f, d: e.target.value })} className="!w-[100px] text-[#3d4858]">
              <option value="">Kun</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </Select>
            <Select aria-label="Oy" value={f.mo} onChange={(e) => setF({ ...f, mo: e.target.value })} className="!w-[156px] text-[#3d4858]">
              <option value="">Oy</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select aria-label="Tug‘ilgan yil" value={f.y} onChange={(e) => setF({ ...f, y: e.target.value })} className="!w-[188px] text-[#3d4858]">
              <option value="">Tug‘ilgan yil</option>{Array.from({ length: 100 }, (_, i) => <option key={i} value={year - i}>{year - i}</option>)}
            </Select>
          </div>
        </LRow>
      </div>
    </Modal>
  );
}
