import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { useTitle } from '@/lib/router';

export function Login() {
  useTitle('Kirish');
  const qc = useQueryClient();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await http.post('/api/auth/login', { login, password });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-card border border-line bg-white p-7 shadow-pop">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          <div>
            <h1 className="m-0 text-xl font-semibold">Tish Duxtir</h1>
            <p className="m-0 text-[13px] text-sub">Tizimga kirish</p>
          </div>
        </div>
        <div className="flex flex-col gap-3.5">
          <Field label="Email yoki telefon">
            {(id) => <Input id={id} autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="+998 90 123 45 67" required />}
          </Field>
          <Field label="Parol">
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          {error && <p role="alert" className="m-0 text-sm text-bad">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="mt-1 h-10">Kirish</Button>
          <p className="m-0 text-center text-xs text-faint">Parolni unutgan bo‘lsangiz, klinika rahbariga murojaat qiling.</p>
        </div>
      </form>
    </div>
  );
}
