import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AiSettings, AiStatus } from '@ppo/shared';
import { api } from '../api';
import { indexAll, useAiStatus } from '../indexing';

function Form({ s, recheck, checking }: { s: AiStatus; recheck: () => void; checking: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState<AiSettings>(s.settings);
  const [progress, setProgress] = useState<string | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(s.settings);
  const done = () => qc.invalidateQueries({ queryKey: ['ai'] });
  const save = useMutation({ mutationFn: () => api.saveAiSettings(f), onSuccess: done });
  const index = useMutation({
    mutationFn: async () => {
      setProgress('Starting…');
      const r = await indexAll((d, rem) => setProgress(`${d} indexed, ${rem} to go…`));
      setProgress(r.stuck ? 'Stopped: the model made no progress. Check the status above.' : `Done. ${r.indexed} prompt${r.indexed === 1 ? '' : 's'} indexed.`);
    },
    onSettled: done,
  });
  const ready = s.settings.enabled && s.ollama.reachable && s.embedModelInstalled;
  const set = <K extends keyof AiSettings>(k: K, v: AiSettings[K]) => setF({ ...f, [k]: v } as AiSettings);
  const err = (save.error ?? index.error) as Error | null;

  return (
    <>
      <p className="muted">
        Everything runs on your computer through Ollama. Your prompt text is sent only to the address below, and it must be on this machine.
      </p>
      <label className="row"><input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Turn on local AI features</label>
      <label className="row"><input type="checkbox" checked={f.suggestOnSave} onChange={(e) => set('suggestOnSave', e.target.checked)} /> Suggest title, tags and category when I save (you review before anything is applied)</label>
      <label className="row"><input type="checkbox" checked={f.autoIndex} onChange={(e) => set('autoIndex', e.target.checked)} /> Keep the meaning-search index up to date automatically</label>
      <div className="row" style={{ marginTop: 8 }}>
        <label className="field grow"><span>Ollama address</span><input className="inp" value={f.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} /></label>
        <label className="field grow"><span>Chat model</span><input className="inp" list="ollama-models" value={f.chatModel} onChange={(e) => set('chatModel', e.target.value)} /></label>
        <label className="field grow"><span>Embedding model</span><input className="inp" list="ollama-models" value={f.embedModel} onChange={(e) => set('embedModel', e.target.value)} /></label>
      </div>
      <datalist id="ollama-models">{s.ollama.models.map((m) => <option key={m} value={m} />)}</datalist>
      {err && <div className="err" role="alert" style={{ marginTop: 8 }}>{err.message}</div>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn p" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save AI settings'}</button>
        <button className="btn" disabled={checking} onClick={recheck}>{checking ? 'Checking…' : 'Check connection'}</button>
        {dirty && <span className="muted small">Unsaved changes. The status below reflects saved settings.</span>}
      </div>

      <h3 style={{ marginTop: 16 }}>Status</h3>
      <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
        <li>Ollama: {s.ollama.reachable
          ? <span className="ok">reachable ({s.ollama.models.length} model{s.ollama.models.length === 1 ? '' : 's'} installed)</span>
          : <span className="bad">not reachable. {s.ollama.error}</span>}</li>
        {s.ollama.reachable && <li>Chat model “{s.settings.chatModel}”: {s.chatModelInstalled ? <span className="ok">installed</span> : <span className="bad">not installed. Run <code className="cmd">ollama pull {s.settings.chatModel}</code></span>}</li>}
        {s.ollama.reachable && <li>Embedding model “{s.settings.embedModel}”: {s.embedModelInstalled ? <span className="ok">installed</span> : <span className="bad">not installed. Run <code className="cmd">ollama pull {s.settings.embedModel}</code></span>}</li>}
        <li>Meaning-search index: {s.index.indexed} of {s.index.total} prompts up to date{s.index.stale > 0 && `, ${s.index.stale} waiting`}</li>
      </ul>
      <div className="row">
        <button className="btn p" disabled={!ready || index.isPending || s.index.stale === 0} onClick={() => index.mutate()}>
          {index.isPending ? 'Indexing…' : 'Build or update index'}
        </button>
        {progress && <span className="muted small" aria-live="polite">{progress}</span>}
        {!ready && <span className="muted small">Turn on AI, save, and make sure both models are installed.</span>}
      </div>

      <details style={{ marginTop: 12 }}>
        <summary>First-time setup</summary>
        <ol>
          <li>Install Ollama from ollama.com and start it.</li>
          <li>In a terminal run <code className="cmd">ollama pull llama3.2</code> (about 2 GB) for suggestions.</li>
          <li>Run <code className="cmd">ollama pull nomic-embed-text</code> (about 0.3 GB) for meaning search.</li>
          <li>Come back here, tick “Turn on local AI features”, save, then build the index.</li>
        </ol>
        <p className="muted small">Larger chat models usually follow the suggestion format better. Pick any installed model in the Chat model field.</p>
      </details>
    </>
  );
}

export default function AiSettingsCard() {
  const status = useAiStatus();
  return (
    <section className="card">
      <h2>Local AI (Ollama)</h2>
      {status.isLoading && <p className="muted">Checking…</p>}
      {status.isError && <div className="err" role="alert">{(status.error as Error).message}</div>}
      {status.data && <Form s={status.data} recheck={() => status.refetch()} checking={status.isFetching} />}
    </section>
  );
}
