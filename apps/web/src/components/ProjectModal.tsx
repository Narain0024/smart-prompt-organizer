import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@ppo/shared';
import { api } from '../api';
import { emptyToNull } from '../lib';
import Modal from './Modal';

export default function ProjectModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved?: (p: Project) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: project?.name ?? '', description: project?.description ?? '', notes: project?.notes ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const b = { name: f.name.trim(), description: emptyToNull(f.description), notes: emptyToNull(f.notes) };
      return project ? api.updateProject(project.id, b) : api.createProject(b);
    },
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projects'] }); onSaved?.(p); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal title={project ? 'Edit collection' : 'New collection'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field"><span>Name</span><input className="inp" value={f.name} onChange={set('name')} required maxLength={120} /></label>
        <label className="field"><span>Description (optional)</span><input className="inp" value={f.description} onChange={set('description')} maxLength={1000} /></label>
        <label className="field"><span>Notes (optional)</span><textarea className="inp" rows={5} value={f.notes} onChange={set('notes')} /></label>
        {save.isError && <div className="err" role="alert">{(save.error as Error).message}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn p" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
