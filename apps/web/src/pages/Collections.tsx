import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import ProjectModal from '../components/ProjectModal';

function List() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['projects', 'list'], queryFn: api.projects });
  const items = q.data?.items ?? [];
  return (
    <>
      <div className="row"><h1 className="grow">Collections</h1><button className="btn p" onClick={() => setCreating(true)}>New collection</button></div>
      <p className="muted">Group related prompts, for example every prompt behind one app, and read them as a timeline.</p>
      {q.isLoading && <div className="grid" aria-busy="true"><div className="skeleton" /><div className="skeleton" /></div>}
      {q.isError && <div className="err" role="alert">{(q.error as Error).message} <button className="btn s" onClick={() => q.refetch()}>Retry</button></div>}
      {q.data && items.length === 0 && (
        <div className="empty"><p><strong>No collections yet.</strong></p><p className="muted">Create one, then add prompts to it from the prompt editor.</p>
          <button className="btn p" onClick={() => setCreating(true)}>Create a collection</button></div>
      )}
      <div className="grid">
        {items.map((p) => (
          <a key={p.id} className="card" href={`#/collections/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <h3>{p.name}</h3>
            {p.description && <div className="clamp">{p.description}</div>}
            <div className="small muted">{p.promptCount} prompt{p.promptCount === 1 ? '' : 's'}</div>
          </a>
        ))}
      </div>
      {creating && <ProjectModal project={null} onClose={() => setCreating(false)} onSaved={(p) => { location.hash = `#/collections/${p.id}`; }} />}
    </>
  );
}

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const project = useQuery({ queryKey: ['projects', 'one', id], queryFn: () => api.project(id) });
  const prompts = useQuery({ queryKey: ['prompts', 'project', id], queryFn: () => api.list({ projectId: id, limit: 200 }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['prompts'] }); qc.invalidateQueries({ queryKey: ['projects'] }); };
  const remove = useMutation({ mutationFn: () => api.deleteProject(id), onSuccess: () => { refresh(); location.hash = '#/collections'; } });
  const detach = useMutation({ mutationFn: (pid: string) => api.update(pid, { projectId: null }), onSuccess: refresh });

  if (project.isLoading) return <p className="muted">Loading…</p>;
  if (project.isError) return <><a className="back" href="#/collections">← Collections</a><div className="err" role="alert">{(project.error as Error).message}</div></>;
  const p = project.data!;
  const ordered = [...(prompts.data?.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const err = (remove.error ?? detach.error) as Error | null;

  return (
    <>
      <a className="back" href="#/collections">← Collections</a>
      <div className="row">
        <h1 className="grow">{p.name}</h1>
        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        <button className="btn d" disabled={remove.isPending}
          onClick={() => { if (window.confirm(`Delete the collection “${p.name}”? Its prompts are kept.`)) remove.mutate(); }}>Delete</button>
      </div>
      {p.description && <p className="muted">{p.description}</p>}
      {p.notes && <section className="card"><h2 style={{ marginBottom: 6 }}>Notes</h2><div style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</div></section>}
      {err && <div className="err" role="alert">{err.message}</div>}
      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Timeline</h2>
        {prompts.isLoading && <p className="muted">Loading prompts…</p>}
        {prompts.isError && <div className="err" role="alert">{(prompts.error as Error).message}</div>}
        {prompts.data && ordered.length === 0 && <p className="muted">No prompts yet. Open a prompt in My Prompts, choose Edit, and set its collection to “{p.name}”.</p>}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ordered.map((x) => (
            <li key={x.id} className="irow">
              <span><strong>{x.title}</strong>{x.category && <span className="chip g" style={{ marginLeft: 8 }}>{x.category}</span>}
                <div className="muted small">{new Date(x.createdAt).toLocaleDateString()} · v{x.version}</div></span>
              <button className="btn s" onClick={() => detach.mutate(x.id)} disabled={detach.isPending}>Remove from collection</button>
            </li>
          ))}
        </ol>
      </section>
      {editing && <ProjectModal project={p} onClose={() => setEditing(false)} />}
    </>
  );
}

export default function Collections({ id }: { id?: string }) {
  return id ? <Detail id={id} /> : <List />;
}
