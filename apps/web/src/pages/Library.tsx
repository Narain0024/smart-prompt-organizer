import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Prompt, PromptUpdate } from '@ppo/shared';
import { api, downloadExport } from '../api';
import { CATEGORIES, saveBlob, timeAgo } from '../lib';
import ImportModal from '../components/ImportModal';
import Editor from '../components/Editor';
import History from '../components/History';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Card({ p, collection, onEdit, onHistory, onPatch, onDelete }: {
  p: Prompt; collection?: string; onEdit: () => void; onHistory: () => void; onPatch: (x: PromptUpdate) => void; onDelete: () => void;
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(p.content); setCopied('ok'); } catch { setCopied('fail'); }
    setTimeout(() => setCopied(null), 1800);
  };
  return (
    <article className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <h3>{p.title}</h3>
        <button className="btn s" aria-pressed={p.isFavorite} aria-label={p.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onPatch({ isFavorite: !p.isFavorite })}>{p.isFavorite ? '★' : '☆'}</button>
      </div>
      <div className="clamp">{p.description || p.content}</div>
      <div>
        {p.category && <span className="chip g">{p.category}</span>}
        {collection && <span className="chip">📁 {collection}</span>}
        {p.platform && <span className="chip">{p.platform}</span>}
        {p.tags.map((t) => <span className="chip" key={t}>#{t}</span>)}
      </div>
      <div className="small muted">v{p.version} · updated {timeAgo(p.updatedAt)}{p.isPinned && ' · pinned'}</div>
      <div className="acts">
        <button className="btn s p" onClick={copy}>{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy'}</button>
        <button className="btn s" onClick={onEdit}>Edit</button>
        <button className="btn s" onClick={onHistory}>History</button>
        <details className="more">
          <summary className="btn s">More</summary>
          <div className="pop">
            <button className="btn s" onClick={() => onPatch({ isPinned: !p.isPinned })}>{p.isPinned ? 'Unpin' : 'Pin'}</button>
            <button className="btn s" onClick={() => onPatch({ archived: !p.archived })}>{p.archived ? 'Unarchive' : 'Archive'}</button>
            <button className="btn s d" onClick={onDelete}>Delete</button>
          </div>
        </details>
      </div>
    </article>
  );
}

export default function Library() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const [category, setCategory] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [archived, setArchived] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Prompt | 'new' | null>(null);
  const [history, setHistory] = useState<Prompt | null>(null);
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['prompts'] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  const projects = useQuery({ queryKey: ['projects', 'list'], queryFn: api.projects });
  const names = new Map((projects.data?.items ?? []).map((p) => [p.id, p.name]));
  const exporting = useMutation({ mutationFn: async (fmt: 'json' | 'csv') => { const r = await downloadExport(fmt); saveBlob(r.blob, r.filename); } });

  const list = useQuery({
    queryKey: ['prompts', 'list', dq, category, favorite, archived, projectId],
    queryFn: () => api.list({ q: dq, category, favorite, archived, projectId, limit: 100 }),
  });
  const patch = useMutation({ mutationFn: (a: { id: string; p: PromptUpdate }) => api.update(a.id, a.p), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api.remove(id), onSuccess: refresh });
  const filtered = !!(dq || category || favorite || archived || projectId);
  const items = list.data?.items ?? [];
  const mutErr = (patch.error ?? del.error ?? exporting.error) as Error | null;

  return (
    <>
      <div className="row">
        <h1 className="grow">My Prompts</h1>
        <button className="btn" onClick={() => setImporting(true)}>Import</button>
        <details className="more down">
          <summary className="btn">Export</summary>
          <div className="pop">
            <button className="btn s" disabled={exporting.isPending} onClick={() => exporting.mutate('json')}>Full backup (JSON)</button>
            <button className="btn s" disabled={exporting.isPending} onClick={() => exporting.mutate('csv')}>Spreadsheet (CSV)</button>
          </div>
        </details>
        <button className="btn p" onClick={() => setEditing('new')}>New prompt</button>
      </div>
      <div className="row">
        <label className="grow"><span className="sr">Search prompts</span>
          <input className="inp" type="search" placeholder="Search titles, prompts and descriptions…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label><span className="sr">Category</span>
          <select className="inp" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label><span className="sr">Collection</span>
          <select className="inp" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All collections</option>
            {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Favorites</label>
        <label className="row"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Archived</label>
      </div>
      {mutErr && <div className="err" role="alert">{mutErr.message}</div>}
      {list.isLoading && <div className="grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>}
      {list.isError && <div className="err" role="alert">{(list.error as Error).message} <button className="btn s" onClick={() => list.refetch()}>Retry</button></div>}
      {list.data && items.length === 0 && (
        <div className="empty">
          {filtered ? <p>No prompts match these filters.</p> : (<>
            <p><strong>Your library is empty.</strong></p>
            <p className="muted">Save your first prompt to start building your collection.</p>
            <button className="btn p" onClick={() => setEditing('new')}>Create a prompt</button>
          </>)}
        </div>
      )}
      {items.length > 0 && (
        <>
          <div className="muted small" aria-live="polite">{dq ? `${items.length} match${items.length === 1 ? '' : 'es'}` : `${list.data!.total} prompt${list.data!.total === 1 ? '' : 's'}`}</div>
          <div className="grid">
            {items.map((p) => (
              <Card key={p.id} p={p} collection={p.projectId ? names.get(p.projectId) : undefined} onEdit={() => setEditing(p)} onHistory={() => setHistory(p)}
                onPatch={(x) => patch.mutate({ id: p.id, p: x })}
                onDelete={() => { if (window.confirm(`Delete “${p.title}”?`)) del.mutate(p.id); }} />
            ))}
          </div>
        </>
      )}
      {editing && <Editor prompt={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportModal title="Import prompts" accept=".txt,.md,.markdown,.json" onClose={() => setImporting(false)} />}
      {history && <History prompt={history} onClose={() => setHistory(null)} />}
    </>
  );
}
