import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { autoIndex } from '../indexing';
import { timeAgo, titleFromContent } from '../lib';

export default function Dashboard() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const all = useQuery({ queryKey: ['prompts', 'dash', 'all'], queryFn: () => api.list({ limit: 1 }) });
  const favs = useQuery({ queryKey: ['prompts', 'dash', 'fav'], queryFn: () => api.list({ favorite: true, limit: 1 }) });
  const recent = useQuery({ queryKey: ['prompts', 'dash', 'recent'], queryFn: () => api.list({ limit: 6 }) });
  const quick = useMutation({
    mutationFn: () => api.create({ title: titleFromContent(draft), content: draft, tags: [], isFavorite: false, isPinned: false }),
    onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: ['prompts'] }); void autoIndex(qc); },
  });
  const stat = (v?: number) => (v === undefined ? '—' : String(v));

  return (
    <>
      <h1>Dashboard</h1>
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) quick.mutate(); }}>
        <label className="field"><span>Quick create</span>
          <textarea className="inp" rows={3} placeholder="Paste or type a prompt. The title comes from its first line; you can refine it later." value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        {quick.isError && <div className="err" role="alert" style={{ marginTop: 8 }}>{(quick.error as Error).message}</div>}
        <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
          <span className="muted small" aria-live="polite">{quick.isSuccess && !draft ? 'Saved to My Prompts.' : ''}</span>
          <button className="btn p" disabled={!draft.trim() || quick.isPending}>{quick.isPending ? 'Saving…' : 'Save prompt'}</button>
        </div>
      </form>
      <div className="row">
        <div className="card grow"><div className="muted">Total prompts</div><div className="stat">{stat(all.data?.total)}</div></div>
        <div className="card grow"><div className="muted">Favorites</div><div className="stat">{stat(favs.data?.total)}</div></div>
        <div className="card grow"><div className="muted">Prompt DNA</div><div className="muted" style={{ marginTop: 8 }}>Not built yet (Stage 6)</div></div>
      </div>
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Pinned and recent</h2>
        {recent.isLoading && <p className="muted">Loading…</p>}
        {recent.isError && <div className="err" role="alert">{(recent.error as Error).message}</div>}
        {recent.data?.items.length === 0 && <p className="muted">Nothing here yet. Save a prompt above to get started.</p>}
        {recent.data?.items.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
            <span>{p.isPinned && '📌 '}<strong>{p.title}</strong>{p.category && <span className="chip g" style={{ marginLeft: 8 }}>{p.category}</span>}</span>
            <span className="muted small">{timeAgo(p.updatedAt)}</span>
          </div>
        ))}
      </section>
    </>
  );
}
