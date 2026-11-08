import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Prompt } from '@ppo/shared';
import { api } from '../api';
import { CATEGORIES, PLATFORMS, emptyToNull, parseTags } from '../lib';
import Modal from './Modal';

export default function Editor({ prompt, onClose }: { prompt: Prompt | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: prompt?.title ?? '', content: prompt?.content ?? '', description: prompt?.description ?? '',
    category: prompt?.category ?? '', platform: prompt?.platform ?? '', tags: (prompt?.tags ?? []).join(', '),
    notes: prompt?.notes ?? '', projectId: prompt?.projectId ?? '', reason: '',
  });
  const projects = useQuery({ queryKey: ['projects', 'list'], queryFn: api.projects });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => {
      const base = {
        title: f.title.trim(), content: f.content, description: emptyToNull(f.description),
        category: emptyToNull(f.category), platform: emptyToNull(f.platform), notes: emptyToNull(f.notes),
        tags: parseTags(f.tags), projectId: f.projectId || null,
      };
      return prompt
        ? api.update(prompt.id, { ...base, changeReason: f.reason.trim() || undefined })
        : api.create({ ...base, isFavorite: false, isPinned: false });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); qc.invalidateQueries({ queryKey: ['projects'] }); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <Modal title={prompt ? 'Edit prompt' : 'New prompt'} onClose={onClose}>
      <form onSubmit={submit} className="col" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field"><span>Title</span><input className="inp" value={f.title} onChange={set('title')} required maxLength={200} /></label>
        <label className="field"><span>Prompt</span><textarea className="inp code" rows={10} value={f.content} onChange={set('content')} required /></label>
        <label className="field"><span>Short description (optional)</span><input className="inp" value={f.description} onChange={set('description')} maxLength={1000} /></label>
        <div className="row">
          <label className="field grow"><span>Category</span><input className="inp" list="cats" value={f.category} onChange={set('category')} /></label>
          <label className="field grow"><span>Platform</span><input className="inp" list="plats" value={f.platform} onChange={set('platform')} /></label>
        </div>
        <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="plats">{PLATFORMS.map((c) => <option key={c} value={c} />)}</datalist>
        <label className="field"><span>Collection</span>
          <select className="inp" style={{ width: '100%' }} value={f.projectId} onChange={set('projectId')}>
            <option value="">None</option>
            {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Tags (comma separated)</span><input className="inp" value={f.tags} onChange={set('tags')} /></label>
        <label className="field"><span>Personal notes (optional)</span><textarea className="inp" rows={2} value={f.notes} onChange={set('notes')} /></label>
        {prompt && <label className="field"><span>Reason for change (saved with the new version)</span><input className="inp" value={f.reason} onChange={set('reason')} maxLength={500} /></label>}
        {save.isError && <div className="err" role="alert">{(save.error as Error).message}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn p" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
