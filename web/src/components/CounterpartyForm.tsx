import { useState } from 'react';
import { db } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import type { Counterparty, CounterpartyType } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Switch, Textarea } from './ui';

export const CP_TYPE: Record<CounterpartyType, string> = {
  supplier: 'Yetkazib beruvchi', doctor: 'Shifokor', assistant: 'Assistent', lab: 'Laboratoriya', technician: 'Texnik', other: 'Boshqa',
};

type F = Omit<Counterparty, 'id' | 'org_id'>;
const EMPTY: F = { type: 'other', name: '', phone: '', email: '', address: '', contact_person: '', inn: '', bank_name: '', bank_account: '', mfo: '', note: '', archived: false };

/** Kontragent oynasi. Ombordan ochilganda tur "Yetkazib beruvchi" bilan qotiriladi. */
export function CounterpartyForm({ cp, fixedType, onClose }: { cp?: Counterparty; fixedType?: CounterpartyType; onClose: () => void }) {
  const [f, setF] = useState<F>(() => (cp ? { ...EMPTY, ...cp } : { ...EMPTY, type: fixedType ?? 'other' }));
  const [tab, setTab] = useState<'main' | 'req'>('main');
  const s = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => {
    if (!f.name.trim()) throw new Error('Nomini kiriting');
    const { ...row } = f;
    return cp ? db.update('counterparties', cp.id, row) : db.insert('counterparties', row);
  }, { invalidate: ['counterparties', ['stock']], success: 'Saqlandi', onDone: onClose });

  return (
    <Modal open onClose={onClose} title={cp ? 'Kontragent' : 'Kontragent qo‘shish'} width={620}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Saqlash</Button></>}>
      <div className="mb-4 flex gap-5 border-b border-line">
        {([['main', 'Asosiy'], ['req', 'Rekvizitlar']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px h-9 border-b-2 text-sm font-medium ${tab === k ? 'border-primary' : 'border-transparent text-sub'}`}>{l}</button>
        ))}
      </div>
      {tab === 'main' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nomi" className="sm:col-span-2">{(id) => <Input id={id} value={f.name} onChange={s('name')} autoFocus />}</Field>
          <Field label="Turi">{(id) => (
            <Select id={id} value={f.type} onChange={s('type')} disabled={!!fixedType}>
              {Object.entries(CP_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>)}
          </Field>
          <Field label="Mas’ul shaxs">{(id) => <Input id={id} value={f.contact_person ?? ''} onChange={s('contact_person')} />}</Field>
          <Field label="Telefon">{(id) => <Input id={id} type="tel" value={f.phone ?? ''} onChange={s('phone')} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={f.email ?? ''} onChange={s('email')} />}</Field>
          <Field label="Manzil" className="sm:col-span-2">{(id) => <Input id={id} value={f.address ?? ''} onChange={s('address')} />}</Field>
          <Field label="Izoh" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={f.note ?? ''} onChange={s('note')} />}</Field>
          {cp && <Switch checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="Arxivda" />}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="STIR (INN)">{(id) => <Input id={id} inputMode="numeric" value={f.inn ?? ''} onChange={s('inn')} />}</Field>
          <Field label="MFO">{(id) => <Input id={id} inputMode="numeric" value={f.mfo ?? ''} onChange={s('mfo')} />}</Field>
          <Field label="Bank nomi" className="sm:col-span-2">{(id) => <Input id={id} value={f.bank_name ?? ''} onChange={s('bank_name')} />}</Field>
          <Field label="Hisob raqami" className="sm:col-span-2">{(id) => <Input id={id} inputMode="numeric" value={f.bank_account ?? ''} onChange={s('bank_account')} />}</Field>
        </div>
      )}
    </Modal>
  );
}
