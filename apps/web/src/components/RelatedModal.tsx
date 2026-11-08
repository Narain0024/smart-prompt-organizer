import { useQuery } from '@tanstack/react-query';
import type { Prompt } from '@ppo/shared';
import { api } from '../api';
import { VERY_SIMILAR, pct } from '../ai-lib';
import Modal from './Modal';

export default function RelatedModal({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const q = useQuery({ queryKey: ['ai', 'related', prompt.id, prompt.updatedAt], queryFn: () => api.related(prompt.id) });
  return (
    <Modal title={`Similar to: ${prompt.title}`} onClose={onClose}>
      {q.isLoading && <p className="muted">Looking…</p>}
      {q.isError && <div className="err" role="alert">{(q.error as Error).message}</div>}
      {q.data?.notice && <p className="note small">{q.data.notice}</p>}
      {q.data && q.data.items.length === 0 && !q.data.notice && <p className="muted">Nothing similar yet.</p>}
      {q.data?.items.map(({ prompt: p, score }) => (
        <div key={p.id} className="irow">
          <span><strong>{p.title}</strong>{p.category && <span className="chip g" style={{ marginLeft: 8 }}>{p.category}</span>}</span>
          <span className={score >= VERY_SIMILAR ? 'chip' : 'muted small'}>{score >= VERY_SIMILAR ? `Very similar · ${pct(score)}%` : `${pct(score)}% similar`}</span>
        </div>
      ))}
      <p className="muted small">Similarity comes from your local embedding model and is a guide, not a verdict. “Very similar” starts at {pct(VERY_SIMILAR)}%.</p>
    </Modal>
  );
}
