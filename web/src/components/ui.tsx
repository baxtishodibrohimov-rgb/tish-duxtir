import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X, Loader2 } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover border border-primary hover:border-primary-hover',
  outline: 'bg-white text-fg border border-line hover:bg-muted',
  ghost: 'bg-transparent text-fg border border-transparent hover:bg-muted',
  danger: 'bg-white text-bad border border-line hover:bg-bad-soft',
  soft: 'bg-primary-soft text-[#006b93] border border-transparent hover:bg-[#bde9fb]',
};

export function Button({ variant = 'outline', size = 'md', loading, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button type="button" {...p} disabled={p.disabled || loading}
      className={cx('app-button inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors',
        size === 'sm' ? 'app-button-sm' : 'app-button-md', BTN[variant], className)}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...p}
      className={cx('inline-grid h-[30px] w-[30px] place-items-center rounded-md text-sub hover:bg-muted hover:text-fg', className)}>
      {children}
    </button>
  );
}

const FIELD = 'app-field w-full min-w-0 border border-line bg-white px-3 outline-none shadow-[0_1px_2px_rgba(7,18,30,.04)] focus:border-primary placeholder:text-faint';

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(FIELD, className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(FIELD, 'pr-8', className)}>{children}</select>;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(FIELD, 'h-auto min-h-[72px] py-2', className)} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-sub">{label}</label>
      {children(id)}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-[#cfd8de]')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('app-card rounded-card border border-line bg-white', className)}>{children}</div>;
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  const t = { gray: 'bg-muted text-sub', green: 'bg-ok-soft text-ok', red: 'bg-bad-soft text-[#b91c1c]', amber: 'bg-warn-soft text-warn', blue: 'bg-primary-soft text-[#006b93]' }[tone];
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap', t)}>{children}</span>;
}

/** Ostki chiziqli tablar (Ombor, Kassa ichki menyulari). */
export function UnderTabs<T extends string>({ tabs, value, onChange, className }:
  { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('flex flex-wrap gap-x-5 gap-y-1 border-b border-line', className)}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}
          className={cx('-mb-px h-9 border-b-2 text-sm font-medium whitespace-nowrap',
            t.key === value ? 'border-primary text-fg' : 'border-transparent text-sub hover:text-fg')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Kulrang fonli pill tablar (sozlamalar, jadval). */
export function PillTabs<T extends string>({ tabs, value, onChange, small }:
  { tabs: { key: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-[10px] bg-muted p-0.5">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}
          className={cx('rounded-lg px-3 font-medium whitespace-nowrap', small ? 'h-[22px] text-[13px]' : 'h-8 text-sm',
            t.key === value ? 'bg-white text-fg shadow-sm' : 'text-sub hover:text-fg')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 520 }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose ko'pincha har chizilishda yangi funksiya bo'ladi — effekt faqat ochilganda ishlashi uchun ref orqali.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', k);
    // Fokus faqat oyna ochilganda bir marta (har harf yozilganda birinchi maydonga sakramasin).
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('[autofocus],input,select,textarea')?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return (
    // Tashqi qatlam aylanadi; ichki min-h-full — baland oyna tepasi kesilib qolmasin (markazlash faqat sig'sa).
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(7,18,30,.35)]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex min-h-full items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" style={{ maxWidth: width }}
        className="app-modal w-full border border-line bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 pt-[18px] pb-[14px]">
          <h2 className="m-0 text-xl font-medium">{title}</h2>
          <IconButton label="Yopish" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 pt-[18px] pb-5">{footer}</div>}
      </div>
      </div>
    </div>
  );
}

export function Confirm({ open, text, onYes, onNo, yes = 'Ha', danger, loading }:
  { open: boolean; text: ReactNode; onYes: () => void; onNo: () => void; yes?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onNo} title="Tasdiqlang" width={420}
      footer={<><Button onClick={onNo}>Bekor qilish</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onYes} loading={loading}>{yes}</Button></>}>
      <p className="m-0 text-sm text-sub">{text}</p>
    </Modal>
  );
}

/** O'ng tomondan chiqadigan panel (tarix, filtrlar). */
export function Drawer({ open, onClose, title, children, width = 440 }:
  { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(7,18,30,.25)]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside style={{ width }} className="absolute top-0 right-0 flex h-full max-w-full flex-col border-l border-line bg-white shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="m-0 text-base font-semibold">{title}</h2>
          <IconButton label="Yopish" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-sub">
      {icon && <div className="text-faint">{icon}</div>}
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={18} className={cx('animate-spin text-primary', className)} />;
}

export function PageLoader() {
  return <div className="grid h-[60vh] place-items-center"><Spinner className="h-6 w-6" /></div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="m-4 rounded-xl border border-bad-soft bg-[#fff6f6] p-4 text-sm text-[#b91c1c]">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

/** Jadval uchun umumiy uslublar */
export const TH = 'h-10 px-5 text-left text-[12px] font-medium uppercase text-sub whitespace-nowrap';
export const TD = 'h-12 px-5 text-sm border-t border-line';


/** Maketdagi forma qatori: chapda o'ngga tekislangan yorliq, o'ngda maydon. */
export function LRow({ label, req, htmlFor, children, width = 150, top, hint, className }:
  { label: ReactNode; req?: boolean; htmlFor?: string; children: ReactNode; width?: number; top?: boolean; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5 sm:flex-row sm:gap-9', top ? 'sm:items-start' : 'sm:items-center', className)}>
      <label htmlFor={htmlFor} style={{ width }} className={cx('flex-none text-[15px] sm:text-right', top && 'sm:pt-[9px]')}>
        {label}{req && <span className="text-bad"> *</span>}{hint}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Kulrang tagli switch (maket: 34×20). */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cx("relative h-5 w-[34px] flex-none rounded-full transition-colors before:absolute before:-inset-3 before:content-['']", on ? 'bg-primary' : 'bg-[#cfd8de]')}>
      <span className={cx('absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-all', on ? 'left-[17px]' : 'left-[3px]')} />
    </button>
  );
}
