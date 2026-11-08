import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Prompt, PromptHit, PromptUpdate } from '@ppo/shared';
import { api, downloadExport } from '../api';
import { pct } from '../ai-lib';
import { indexAll, useAiStatus } from '../indexing';
import { CATEGORIES, saveBlob, timeAgo } from '../lib';
import Editor from '../components/Editor';
import History from '../components/History';
import ImportModal from '../components/ImportModal';
import RelatedModal from '../components/RelatedModal';

type Mode = 'keyword' | 'meaning' | 'hybrid';
interface Result { items: PromptHit[]; total: number; notice?: string }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Card({ p, collection, onEdit, onHistory, onRelated, onPatch, onDelete }: {
  p: PromptHit; collection?: string; onEdit: () => void; onHistory: () => void; onRelated?: () => void;
  onPatch: (x: PromptUpdate) => void; onDelete: () => void;
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
        {p.score !== undefined && <span className="chip g">Similarity {pct(p.score)}%</span>}
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
        {onRelated && <button className="btn s" onClick={onRelated}>Similar</button>}
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
  const [modePref, setModePref] = useState<Mode | null>(null);
  const ai = useAiStatus();
  const aiOn = !!ai.data?.settings.enabled;
  const mode: Mode = aiOn ? modePref ?? 'hybrid' : 'keyword';
  const dq = useDebounced(q.trim(), mode === 'keyword' ? 250 : 450);
  const [category, setCategory] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [archived, setArchived] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Prompt | 'new' | null>(null);
  const [history, setHistory] = useState<Prompt | null>(null);
  const [related, setRelated] = useState<Prompt | null>(null);
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['prompts'] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  const projects = useQuery({ queryKey: ['projects', 'list'], queryFn: api.projects });
  const names = new Map((projects.data?.items ?? []).map((p) => [p.id, p.name]));
  const exporting = useMutation({ mutationFn: async (fmt: 'json' | 'csv') => { const r = await downloadExport(fmt); saveBlob(r.blob, r.filename); } });
  const reindex = useMutation({ mutationFn: () => indexAll(), onSettled: () => qc.invalidateQueries({ queryKey: ['ai'] }) });

  const list = useQuery<Result>({
    queryKey: ['prompts', 'list', dq, mode, category, favorite, archived, projectId],
    queryFn: async () => {
      if (dq && mode !== 'keyword') {
        const r = await api.search({ q: dq, mode, category, favorite, archived, projectId, limit: 50 });
        return { items: r.items, total: r.items.length, notice: r.notice };
      }
      const r = await api.list({ q: dq, category, favorite, archived, projectId, limit: 100 });
      return { items: r.items, total: r.total };
    },
  });
  const patch = useMutation({ mutationFn: (a: { id: string; p: PromptUpdate }) => api.update(a.id, a.p), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api.remove(id), onSuccess: refresh });
  const filtered = !!(dq || category || favorite || archived || projectId);
  const items = list.data?.items ?? [];
  const mutErr = (patch.error ?? del.error ?? exporting.error ?? reindex.error) as Error | null;
  const needsIndex = aiOn && !!ai.data && ai.data.index.stale > 0 && ai.data.ollama.reachable && ai.data.embedModelInstalled;

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
          <input className="inp" type="search" placeholder={aiOn ? 'Search by meaning or keyword…' : 'Search titles, prompts and descriptions…'} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {aiOn && (
          <label><span className="sr">Search mode</span>
            <select className="inp" value={mode} onChange={(e) => setModePref(e.target.value as Mode)}>
              <option value="hybrid">Meaning + keyword</option>
              <option value="meaning">Meaning only</option>
              <option value="keyword">Keyword only</option>
            </select>
          </label>
        )}
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
      {needsIndex && (
        <div className="note row" role="status">
          <span className="grow">{ai.data!.index.stale} prompt{ai.data!.index.stale === 1 ? ' is' : 's are'} not searchable by meaning yet.</span>
          <button className="btn s" disabled={reindex.isPending} onClick={() => reindex.mutate()}>{reindex.isPending ? 'Updating…' : 'Update index'}</button>
        </div>
      )}
      {list.data?.notice && <div className="note small" role="status">{list.data.notice}</div>}
      {mutErr && <div className="err" role="alert">{mutErr.message}</div>}
      {list.isLoading && <div className="grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>}
      {list.isError && <div className="err" role="alert">{(list.error as Error).message} <button className="btn s" onClick={() => list.refetch()}>Retry</button></div>}
      {list.data && items.length === 0 && (
        <div className="empty">
          {filtered ? <p>No prompts match.</p> : (<>
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
              <Card key={p.id} p={p} collection={p.projectId ? names.get(p.projectId) : undefined}
                onEdit={() => setEditing(p)} onHistory={() => setHistory(p)} onRelated={aiOn ? () => setRelated(p) : undefined}
                onPatch={(x) => patch.mutate({ id: p.id, p: x })}
                onDelete={() => { if (window.confirm(`Delete “${p.title}”?`)) del.mutate(p.id); }} />
            ))}
          </div>
        </>
      )}
      {editing && <Editor prompt={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportModal title="Import prompts" accept=".txt,.md,.markdown,.json" onClose={() => setImporting(false)} />}
      {history && <History prompt={history} onClose={() => setHistory(null)} />}
      {related && <RelatedModal prompt={related} onClose={() => setRelated(null)} />}
    </>
  );
}
