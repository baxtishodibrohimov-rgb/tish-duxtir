import { useRef, useState } from 'react';
import { Sparkles, Bot, Mic, Send } from 'lucide-react';
import { db } from '@/lib/api';
import { phoneFmt } from '@/lib/format';
import { Link, useTitle } from '@/lib/router';
import type { Patient } from '@/lib/types';
import { cx } from '@/components/ui';

interface Msg { bot: boolean; text: string; patients?: Patient[] }

// Brauzerning ovozni matnga aylantirish API'si (Chrome, Edge, Safari).
type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void };
const SR = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

const STOP = new Set(['degan', 'bemorni', 'bemor', 'topa', 'olasanmi', 'top', 'qidir', 'toping', 'kartasi', 'ertaga', 'bugun', 'ga', 'yozib', 'qo‘y', 'найди', 'пациента']);

/** AI yordamchi. Til modeli hali ulanmagan: hozircha bemor qidiruvi va ovozli kiritish ishlaydi. */
export function Assistant() {
  useTitle('AI yordamchi');
  const [msgs, setMsgs] = useState<Msg[]>([{ bot: true, text: 'Salom! Men sizning AI yordamchingizman. Misol uchun:' }]);
  const [draft, setDraft] = useState('');
  const [lang, setLang] = useState<'uz' | 'ru'>('uz');
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);

  async function send() {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    const next = [...msgs, { bot: false, text: t }];
    setMsgs(next);
    const words = t.replace(/[?!.,]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
    let found: Patient[] = [];
    for (const w of words) {
      found = await db.list<Patient>('patients', { deleted_at: null }, { q: w.replace(/(ni|ning|ga|dan)$/i, ''), limit: 5 }).catch(() => []);
      if (found.length) break;
    }
    setMsgs([...next, found.length
      ? { bot: true, text: `Topilgan bemorlar (${found.length}):`, patients: found }
      : { bot: true, text: 'AI yordamchi hali serverga ulanmagan. Hozircha bemorni ism, telefon yoki karta raqami bo‘yicha qidira olaman.' }]);
  }

  function mic() {
    if (!SR) { setMsgs([...msgs, { bot: true, text: 'Bu brauzer ovozli kiritishni qo‘llamaydi. Chrome yoki Edge’da oching.' }]); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = lang === 'uz' ? 'uz-UZ' : 'ru-RU';
    r.interimResults = false;
    r.onresult = (e) => setDraft((d) => `${d} ${e.results[0]?.[0]?.transcript ?? ''}`.trim());
    r.onend = () => setListening(false);
    rec.current = r; r.start(); setListening(true);
  }

  return (
    <main className="mx-auto flex max-w-[768px] flex-col gap-6 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 grid h-10 w-10 flex-none place-items-center rounded-xl bg-primary-soft"><Sparkles size={20} className="text-primary" /></span>
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">AI yordamchi</h1>
          <span className="text-sm text-sub">Ovozli yoki yozma buyruq bering — bemor yarating, vizit yozing, to‘lov qabul qiling.</span>
        </div>
      </div>

      <section className="app-card flex min-h-[540px] flex-col gap-4 rounded-card border border-line bg-white p-4">
        {msgs.map((m, i) => (
          <div key={i} className={cx('flex items-start gap-3', !m.bot && 'justify-end')}>
            {m.bot && <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary-soft"><Bot size={16} className="text-primary" /></span>}
            <div className={cx('max-w-[80%] px-4 py-3.5 text-sm leading-normal', m.bot ? 'rounded-t-2xl bg-muted text-fg' : 'rounded-2xl bg-primary text-white')}>
              {m.text}
              {m.patients && (
                <span className="mt-2 flex flex-col gap-1">
                  {m.patients.map((p) => <Link key={p.id} to={`/patients/${p.id}`}>{p.full_name} · №{p.card_number} {phoneFmt(p.phone)}</Link>)}
                </span>
              )}
            </div>
          </div>
        ))}
        {msgs.length === 1 && (
          <ul className="-mt-2 ml-12 max-w-[360px] rounded-b-2xl bg-muted py-4 pr-4 pl-9 text-sm leading-[2.4] italic">
            <li>Ali Valiyevni ertaga 14:00 ga yozib qo‘y</li>
            <li>Bu oyda nechta yangi bemor keldi?</li>
            <li>Karimov degan bemorni topa olasanmi?</li>
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <label htmlFor="msg" className="sr-only">Buyruq</label>
          <textarea id="msg" rows={2} placeholder="Buyruq yozing... (Enter — yuborish)" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            className="min-h-[60px] flex-1 resize-none rounded-[10px] border border-line bg-white px-3 py-2.5 text-sm shadow-[0_1px_2px_rgba(7,18,30,.04)] outline-none focus:border-primary" />
          <div className="flex flex-col gap-2">
            <button type="button" onClick={mic} aria-label="Mikrofon" aria-pressed={listening}
              className={cx('grid h-9 w-9 place-items-center rounded-[10px] border', listening ? 'border-bad bg-bad-soft text-bad' : 'border-line bg-white')}><Mic size={16} /></button>
            <button type="button" onClick={() => void send()} aria-label="Yuborish" disabled={!draft.trim()}
              className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-white"><Send size={16} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {(['uz', 'ru'] as const).map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
              className={cx('rounded-md px-2 py-0.5', lang === l ? 'bg-primary-soft text-primary-hover' : 'text-sub')}>{l === 'uz' ? 'O‘zbek' : 'Русский'}</button>
          ))}
          <span className="ml-auto text-sub">{listening ? 'Tinglanmoqda…' : 'Mikrofon bosing'}</span>
        </div>
      </div>
    </main>
  );
}
