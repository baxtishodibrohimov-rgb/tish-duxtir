import { useState } from 'react';
import { db } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import type { Patient } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

const EMPTY = { last_name: '', first_name: '', middle_name: '', phone: '', phone2: '', birth_date: '', gender: '', address: '', source: '', referrer: '', important_info: '', notes: '' };

/** Yangi bemor yoki tahrirlash oynasi. */
export function PatientForm({ patient, branchId, onClose, onSaved }: { patient?: Patient; branchId?: string; onClose: () => void; onSaved?: (p: Patient) => void }) {
  const [f, setF] = useState<Record<keyof typeof EMPTY, string>>(() => {
    if (!patient) return EMPTY;
    const out = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof typeof EMPTY)[]) out[k] = (patient[k as keyof Patient] as string | null) ?? '';
    return out;
  });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useAction(async () => {
    if (!f.last_name.trim() && !f.first_name.trim()) throw new Error('Ism yoki familiyani kiriting');
    const row = { ...f, gender: f.gender || null, birth_date: f.birth_date || null };
    return patient ? db.update<Patient>('patients', patient.id, row) : db.insert<Patient>('patients', { ...row, home_branch_id: branchId ?? null });
  }, { invalidate: ['patients'], success: patient ? 'Saqlandi' : 'Bemor qo‘shildi', onDone: (p) => { onSaved?.(p); onClose(); } });

  return (
    <Modal open onClose={onClose} title={patient ? 'Bemor ma’lumotlari' : 'Yangi bemor'} width={640}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Familiya">{(id) => <Input id={id} value={f.last_name} onChange={set('last_name')} />}</Field>
        <Field label="Ism">{(id) => <Input id={id} value={f.first_name} onChange={set('first_name')} />}</Field>
        <Field label="Otasining ismi">{(id) => <Input id={id} value={f.middle_name} onChange={set('middle_name')} />}</Field>
        <Field label="Asosiy telefon">{(id) => <Input id={id} type="tel" value={f.phone} onChange={set('phone')} placeholder="+998 90 123 45 67" />}</Field>
        <Field label="Qo‘shimcha telefon">{(id) => <Input id={id} type="tel" value={f.phone2} onChange={set('phone2')} />}</Field>
        <Field label="Tug‘ilgan sana">{(id) => <Input id={id} type="date" value={f.birth_date} onChange={set('birth_date')} />}</Field>
        <Field label="Jinsi">{(id) => (
          <Select id={id} value={f.gender} onChange={set('gender')}>
            <option value="">—</option><option value="male">Erkak</option><option value="female">Ayol</option>
          </Select>)}
        </Field>
        <Field label="Qayerdan bildi">{(id) => (
          <Select id={id} value={f.source} onChange={set('source')}>
            <option value="">—</option>
            {['Tanish-bilish', 'Instagram', 'Telegram', 'Google', 'Reklama', 'Boshqa'].map((s) => <option key={s}>{s}</option>)}
          </Select>)}
        </Field>
        <Field label="Kim yo‘lladi">{(id) => <Input id={id} value={f.referrer} onChange={set('referrer')} />}</Field>
        <Field label="Manzil" className="sm:col-span-3">{(id) => <Input id={id} value={f.address} onChange={set('address')} />}</Field>
        <Field label="Muhim ma’lumot (allergiya, kasalliklar)" className="sm:col-span-3" hint="To‘ldirilsa, jadvalda bemor ismi qizil rangda ko‘rinadi">
          {(id) => <Textarea id={id} rows={2} value={f.important_info} onChange={set('important_info')} />}
        </Field>
        <Field label="Izoh" className="sm:col-span-3">{(id) => <Textarea id={id} rows={2} value={f.notes} onChange={set('notes')} />}</Field>
      </div>
    </Modal>
  );
}
