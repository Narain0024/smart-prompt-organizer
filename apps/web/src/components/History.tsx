import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Prompt } from '@ppo/shared';
import { api } from '../api';
import { timeAgo } from '../lib';
import Modal from './Modal';

export default function History({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['prompts', 'versions', prompt.id, prompt.version], queryFn: () => api.versions(prompt.id) });
  const current = sel ?? prompt.version;
  const shown = q.data?.items.find((v) => v.version === current);
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
            {shown && <><h3>{shown.title}</h3><pre className="pv">{shown.content}</pre></>}
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
