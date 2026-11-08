import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Prompt } from '@ppo/shared';
import { api } from '../api';
import { sideBySide, timeAgo } from '../lib';
import Modal from './Modal';

export default function History({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<'view' | 'compare'>('view');
  const [against, setAgainst] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['prompts', 'versions', prompt.id, prompt.version], queryFn: () => api.versions(prompt.id) });
  const current = sel ?? prompt.version;
  const other = against ?? prompt.version;
  const left = q.data?.items.find((v) => v.version === current);
  const right = q.data?.items.find((v) => v.version === other);
  const rows = useMemo(() => (mode === 'compare' && left && right ? sideBySide(left.content, right.content) : []), [mode, left, right]);
  const restore = useMutation({
    mutationFn: () => api.restore(prompt.id, current),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); onClose(); },
  });

  return (
    <Modal title={`Version history: ${prompt.title}`} onClose={onClose} wide>
      {q.isLoading && <p className="muted">Loading versions…</p>}
      {q.isError && <div className="err" role="alert">{(q.error as Error).message}</div>}
      {q.data && (
        <div className="versions">
          <div className="vlist" role="group" aria-label="Versions">
            {q.data.items.map((v) => (
              <button key={v.version} className="btn vitem" aria-pressed={v.version === current} onClick={() => setSel(v.version)}>
                <strong>v{v.version}</strong>{v.version === prompt.version && ' (current)'}
                <div className="small muted">{v.changeReason ?? 'Edited'} · {timeAgo(v.createdAt)}</div>
              </button>
            ))}
          </div>
          <div>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="btn s" aria-pressed={mode === 'view'} onClick={() => setMode('view')}>View</button>
              <button className="btn s" aria-pressed={mode === 'compare'} onClick={() => setMode('compare')}>Compare</button>
              {mode === 'compare' && (
                <label className="row small">Against
                  <select className="inp" value={other} onChange={(e) => setAgainst(Number(e.target.value))}>
                    {q.data.items.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.version === prompt.version ? ' (current)' : ''}</option>)}
                  </select>
                </label>
              )}
            </div>
            {mode === 'view' && left && <><h3>{left.title}</h3><pre className="pv">{left.content}</pre></>}
            {mode === 'compare' && left && right && (
              current === other ? <p className="muted">Pick two different versions to compare.</p> : (
                <div className="diff" role="group" aria-label={`Comparison of v${current} and v${other}`}>
                  <div className="dh">v{current}: {left.title}</div><div className="dh">v{other}: {right.title}</div>
                  {rows.map((r, i) => (
                    <Fragment key={i}>
                      <div className={`dl${r.changed && r.left !== null ? ' del' : ''}`}>{r.left ?? ''}</div>
                      <div className={`dl${r.changed && r.right !== null ? ' add' : ''}`}>{r.right ?? ''}</div>
                    </Fragment>
                  ))}
                </div>
              )
            )}
            {restore.isError && <div className="err" role="alert">{(restore.error as Error).message}</div>}
            <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
              <button className="btn p" disabled={current === prompt.version || restore.isPending} onClick={() => restore.mutate()}>
                Restore v{current} as a new version
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
