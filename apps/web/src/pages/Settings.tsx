import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { applyThemePref, getThemePref, type ThemePref } from '../theme';

const PROVIDERS: { id: string; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)' }, { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' }, { id: 'ollama', label: 'Ollama (local, optional key)' },
];

function ProviderRow({ id, label, saved }: { id: string; label: string; saved: boolean }) {
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const done = () => qc.invalidateQueries({ queryKey: ['secrets'] });
  const save = useMutation({ mutationFn: () => api.setSecret(id, key.trim()), onSuccess: () => { setKey(''); done(); } });
  const remove = useMutation({ mutationFn: () => api.deleteSecret(id), onSuccess: done });
  const err = (save.error ?? remove.error) as Error | null;
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{label}</strong>
        <span className={saved ? 'chip g' : 'chip'}>{saved ? 'Key saved' : 'No key'}</span>
      </div>
      <form className="row" style={{ marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); if (key.trim()) save.mutate(); }}>
        <label className="grow"><span className="sr">{label} API key</span>
          <input className="inp" type="password" autoComplete="off" placeholder={saved ? 'Enter a new key to replace it' : 'Paste API key'} value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <button className="btn p" disabled={!key.trim() || save.isPending}>Save</button>
        {saved && <button type="button" className="btn d" onClick={() => remove.mutate()} disabled={remove.isPending}>Remove</button>}
      </form>
      {err && <div className="err" role="alert" style={{ marginTop: 6 }}>{err.message}</div>}
    </div>
  );
}

export default function Settings() {
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const secrets = useQuery({ queryKey: ['secrets'], queryFn: api.secrets });
  const pick = (t: ThemePref) => { setTheme(t); applyThemePref(t); };
  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <h2>Appearance</h2>
        <div className="row" role="radiogroup" aria-label="Theme" style={{ marginTop: 10 }}>
          {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
            <label key={t} className="row"><input type="radio" name="theme" checked={theme === t} onChange={() => pick(t)} /> {t === 'system' ? 'Follow system' : t[0].toUpperCase() + t.slice(1)}</label>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>AI providers</h2>
        <p className="muted">Keys are encrypted by the local server and never sent back to the browser. They are stored now, but no AI feature uses them until Stage 4.</p>
        {secrets.isError && <div className="err" role="alert">{(secrets.error as Error).message}</div>}
        {PROVIDERS.map((p) => <ProviderRow key={p.id} {...p} saved={!!secrets.data?.providers[p.id]} />)}
      </section>
    </>
  );
}
