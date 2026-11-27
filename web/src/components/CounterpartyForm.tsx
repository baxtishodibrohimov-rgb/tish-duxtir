import { useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/api';
import { useAction, useList } from '@/lib/hooks';
import type { Counterparty, CounterpartyKind, CounterpartyType } from '@/lib/types';
import { Button, Field, Input, Modal, Select, Switch, Textarea } from './ui';

/** Majburiy turlar (o'chirib bo'lmaydi): ombor va laboratoriya shularga bog'langan. */
export const CP_BUILTIN: Record<Exclude<CounterpartyType, 'other'>, string> = {
  doctor: 'Shifokor', assistant: 'Assistent', technician: 'Texnik', supplier: 'Yetkazib beruvchi',
};

/**
 * Kontragent turlari: majburiylar + klinika o'zi kiritganlar.
 * Kalit: majburiy tur nomi ('doctor'...) yoki o'z turi uchun 'c:<id>'.
 */
export function useCpTypes() {
  const kinds = useList<CounterpartyKind>('counterparty_types');
  const options = [
    ...Object.entries(CP_BUILTIN).map(([k, v]) => ({ key: k, label: v, builtin: true })),
    ...(kinds.data ?? []).map((t) => ({ key: `c:${t.id}`, label: t.name, builtin: false })),
  ];
  const keyOf = (c: Pick<Counterparty, 'type' | 'type_id'>) => (c.type === 'other' ? `c:${c.type_id ?? ''}` : c.type);
  const labelOf = (c: Pick<Counterparty, 'type' | 'type_id'>) => options.find((o) => o.key === keyOf(c))?.label ?? '—';
  return { options, kinds: kinds.data ?? [], keyOf, labelOf, loading: kinds.isLoading };
}
const fromKey = (k: string): { type: CounterpartyType; type_id: string | null } => (k.startsWith('c:') ? { type: 'other', type_id: k.slice(2) } : { type: k as CounterpartyType, type_id: null });

type F = Omit<Counterparty, 'id' | 'org_id'>;
const EMPTY: F = { type: 'other', type_id: null, name: '', phone: '', email: '', address: '', contact_person: '', inn: '', bank_name: '', bank_account: '', mfo: '', note: '', archived: false, website: '' };

/** Kontragent oynasi. Ombordan ochilganda tur "Yetkazib beruvchi" bilan qotiriladi. */
export function CounterpartyForm({ cp, fixedType, onClose }: { cp?: Counterparty; fixedType?: CounterpartyType; onClose: () => void }) {
  const [f, setF] = useState<F>(() => (cp ? { ...EMPTY, ...cp } : { ...EMPTY, type: fixedType ?? 'other' }));
  const ct = useCpTypes();
  const [types, setTypes] = useState(false);
  const tkey = f.type === 'other' ? (f.type_id ? `c:${f.type_id}` : '') : f.type;
  const [tab, setTab] = useState<'main' | 'req'>('main');
  const s = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => {
    if (!f.name.trim()) throw new Error('Nomini kiriting');
    if (f.type === 'other' && !f.type_id) throw new Error('Turini tanlang');
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
            <span className="flex gap-1.5">
              <Select id={id} value={tkey} onChange={(e) => setF({ ...f, ...fromKey(e.target.value) })} disabled={!!fixedType}>
                {!tkey && <option value="">— tanlang —</option>}
                <optgroup label="Asosiy">{ct.options.filter((o) => o.builtin).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
                {ct.kinds.length > 0 && <optgroup label="Klinika turlari">{ct.options.filter((o) => !o.builtin).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>}
              </Select>
              {!fixedType && <Button type="button" onClick={() => setTypes(true)} title="Turlarni boshqarish">Turlar</Button>}
            </span>)}
          </Field>
          <Field label="Mas’ul shaxs">{(id) => <Input id={id} value={f.contact_person ?? ''} onChange={s('contact_person')} />}</Field>
          <Field label="Telefon">{(id) => <Input id={id} type="tel" value={f.phone ?? ''} onChange={s('phone')} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={f.email ?? ''} onChange={s('email')} />}</Field>
          <Field label="Veb-sayt" className="sm:col-span-2">{(id) => <Input id={id} value={f.website ?? ''} onChange={s('website')} />}</Field>
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
      {types && <CpTypesModal onClose={() => setTypes(false)} />}
    </Modal>
  );
}

/** Kontragent turlari: majburiylar qulflangan, o'z turlarini qo'shish / nomini o'zgartirish / o'chirish. */
export function CpTypesModal({ onClose }: { onClose: () => void }) {
  const ct = useCpTypes();
  const cps = useList<Counterparty>('counterparties');
  const [nw, setNw] = useState('');
  const [ed, setEd] = useState<{ id: string; name: string } | null>(null);
  const used = (id: string) => (cps.data ?? []).filter((c) => c.type_id === id).length;
  const inv = ['counterparty_types', 'counterparties'];
  const add = useAction(() => db.insert('counterparty_types', { name: nw.trim(), position: ct.kinds.length }), { invalidate: inv, onDone: () => setNw('') });
  const ren = useAction(() => db.update('counterparty_types', ed!.id, { name: ed!.name.trim() }), { invalidate: inv, onDone: () => setEd(null) });
  const del = useAction((id: string) => db.remove('counterparty_types', id), { invalidate: inv, success: 'O‘chirildi' });
  const ROW = 'flex min-h-10 items-center gap-2 border-t border-line px-1 text-sm';
  return (
    <Modal open onClose={onClose} title="Kontragent turlari" width={460} footer={<Button onClick={onClose}>Yopish</Button>}>
      <div className="flex flex-col">
        <span className="pb-1 text-xs text-sub">Asosiy turlar — o‘chirib bo‘lmaydi (ombor va laboratoriya shularga bog‘langan)</span>
        {ct.options.filter((o) => o.builtin).map((o) => (
          <div key={o.key} className={ROW}><Lock size={14} className="text-faint" /><span className="flex-1">{o.label}</span></div>
        ))}
        <span className="pt-3 pb-1 text-xs text-sub">Klinika turlari</span>
        {ct.kinds.map((t) => {
          const n = used(t.id);
          return ed?.id === t.id ? (
            <form key={t.id} className={ROW} onSubmit={(e) => { e.preventDefault(); if (ed.name.trim()) ren.mutate(undefined); }}>
              <Input autoFocus aria-label="Tur nomi" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} className="flex-1" />
              <Button type="submit" variant="primary" size="sm" loading={ren.isPending}>Saqlash</Button>
              <Button type="button" size="sm" onClick={() => setEd(null)}>Bekor</Button>
            </form>
          ) : (
            <div key={t.id} className={ROW}>
              <span className="flex-1">{t.name} <span className="text-xs text-sub">· {n} ta</span></span>
              <button type="button" aria-label={`${t.name}: nomini o‘zgartirish`} onClick={() => setEd({ id: t.id, name: t.name })} className="grid h-8 w-8 place-items-center rounded text-sub hover:bg-muted"><Pencil size={14} /></button>
              <button type="button" aria-label={`${t.name}: o‘chirish`} disabled={n > 0 || del.isPending} title={n > 0 ? 'Avval shu turdagi kontragentlarni boshqa turga o‘tkazing' : 'O‘chirish'}
                onClick={() => del.mutate(t.id)} className="grid h-8 w-8 place-items-center rounded text-sub hover:bg-muted hover:text-bad disabled:opacity-30"><Trash2 size={14} /></button>
            </div>
          );
        })}
        {ct.kinds.length === 0 && <span className="py-2 text-sm text-sub">Hali o‘z turingiz yo‘q.</span>}
        <form className="flex gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); if (nw.trim()) add.mutate(undefined); }}>
          <Input aria-label="Yangi tur nomi" placeholder="Masalan: Xarajat, Ijara, Ovqat" value={nw} onChange={(e) => setNw(e.target.value)} className="flex-1" />
          <Button type="submit" variant="primary" disabled={!nw.trim()} loading={add.isPending}><Plus size={15} /> Qo‘shish</Button>
        </form>
      </div>
    </Modal>
  );
}
