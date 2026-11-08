import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Prompt } from '@ppo/shared';
import { api } from '../api';
import { autoIndex, useAiStatus } from '../indexing';
import { CATEGORIES, PLATFORMS, emptyToNull, parseTags, titleFromContent } from '../lib';
import Modal from './Modal';

type Form = {
  title: string; content: string; description: string; category: string; platform: string;
  tags: string; notes: string; projectId: string; reason: string;
};
type FieldKey = 'title' | 'description' | 'category' | 'platform' | 'tags';
const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'title', label: 'Title' }, { key: 'description', label: 'Description' }, { key: 'category', label: 'Category' },
  { key: 'platform', label: 'Platform' }, { key: 'tags', label: 'Tags' },
];
interface Review { error: string | null; use: Record<FieldKey, boolean>; vals: Record<FieldKey, string> }

export default function Editor({ prompt, onClose }: { prompt: Prompt | null; onClose: () => void }) {
  const qc = useQueryClient();
  const ai = useAiStatus();
  const projects = useQuery({ queryKey: ['projects', 'list'], queryFn: api.projects });
  const [f, setF] = useState<Form>({
    title: prompt?.title ?? '', content: prompt?.content ?? '', description: prompt?.description ?? '',
    category: prompt?.category ?? '', platform: prompt?.platform ?? '', tags: (prompt?.tags ?? []).join(', '),
    notes: prompt?.notes ?? '', projectId: prompt?.projectId ?? '', reason: '',
  });
  const [suggesting, setSuggesting] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const skipped = useRef(false);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const withTitle = (form: Form): Form => ({ ...form, title: form.title.trim() || titleFromContent(form.content) });

  const save = useMutation({
    mutationFn: (form: Form) => {
      const base = {
        title: form.title.trim(), content: form.content, description: emptyToNull(form.description),
        category: emptyToNull(form.category), platform: emptyToNull(form.platform), notes: emptyToNull(form.notes),
        tags: parseTags(form.tags), projectId: form.projectId || null,
      };
      return prompt
        ? api.update(prompt.id, { ...base, changeReason: form.reason.trim() || undefined })
        : api.create({ ...base, isFavorite: false, isPinned: false });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompts'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      void autoIndex(qc);
      onClose();
    },
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = ai.data;
    const contentChanged = !prompt || prompt.content !== f.content;
    const gaps = !f.description.trim() || !f.category.trim() || parseTags(f.tags).length === 0;
    const wants = !!s && s.settings.enabled && s.settings.suggestOnSave && s.ollama.reachable && s.chatModelInstalled
      && contentChanged && (!prompt || gaps);
    if (!wants) return save.mutate(withTitle(f));

    skipped.current = false;
    setSuggesting(true);
    const current = withTitle(f);
    const emptyNow: Record<FieldKey, boolean> = {
      title: !f.title.trim() || f.title.trim() === titleFromContent(f.content),
      description: !f.description.trim(), category: !f.category.trim(), platform: !f.platform.trim(),
      tags: parseTags(f.tags).length === 0,
    };
    try {
      const sug = await api.aiSuggest({ title: current.title, content: f.content });
      if (skipped.current) return;
      const vals: Record<FieldKey, string> = {
        title: sug.title ?? current.title, description: sug.description ?? '', category: sug.category ?? '',
        platform: sug.platform ?? '', tags: sug.tags.join(', '),
      };
      setReview({
        error: null, vals,
        use: {
          title: emptyNow.title && !!sug.title, description: emptyNow.description && !!sug.description,
          category: emptyNow.category && !!sug.category, platform: emptyNow.platform && !!sug.platform,
          tags: emptyNow.tags && sug.tags.length > 0,
        },
      });
    } catch (err) {
      if (skipped.current) return;
      setReview({
        error: (err as Error).message,
        vals: { title: current.title, description: '', category: '', platform: '', tags: '' },
        use: { title: false, description: false, category: false, platform: false, tags: false },
      });
    } finally {
      setSuggesting(false);
    }
  }

  const skip = () => { skipped.current = true; setSuggesting(false); save.mutate(withTitle(f)); };
  const finish = (useSuggestions: boolean) => {
    const merged = withTitle(f);
    if (useSuggestions && review) {
      for (const { key } of FIELDS) {
        const v = review.vals[key];
        if (review.use[key] && !(key === 'title' && !v.trim())) merged[key] = v;
      }
    }
    save.mutate(merged);
  };
  const shownNow = (k: FieldKey) => (k === 'title' ? withTitle(f).title : f[k]);

  return (
    <Modal title={prompt ? 'Edit prompt' : 'New prompt'} onClose={onClose}>
      <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="plats">{PLATFORMS.map((c) => <option key={c} value={c} />)}</datalist>
      {review ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {review.error ? (
            <div className="err" role="alert">AI suggestions are unavailable: {review.error} You can still save your prompt.</div>
          ) : (
            <p className="note small">Suggested by your local model ({ai.data?.settings.chatModel}). It can be wrong, so review each one. Only ticked items are applied.</p>
          )}
          {!review.error && FIELDS.map(({ key, label }) => (
            <div className="rvrow" key={key}>
              <input id={`use-${key}`} type="checkbox" aria-label={`Use suggested ${label}`} checked={review.use[key]}
                onChange={(e) => setReview({ ...review, use: { ...review.use, [key]: e.target.checked } })} />
              <div>
                <label htmlFor={`val-${key}`}><strong>{label}</strong></label>
                <div className="muted small">Now: {shownNow(key) || '(empty)'}</div>
                <input id={`val-${key}`} className="inp" list={key === 'category' ? 'cats' : key === 'platform' ? 'plats' : undefined}
                  value={review.vals[key]} onChange={(e) => setReview({ ...review, vals: { ...review.vals, [key]: e.target.value } })} />
              </div>
            </div>
          ))}
          {save.isError && <div className="err" role="alert">{(save.error as Error).message}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setReview(null)} disabled={save.isPending}>Back to editing</button>
            <button className="btn" onClick={() => finish(false)} disabled={save.isPending}>Save without suggestions</button>
            {!review.error && <button className="btn p" onClick={() => finish(true)} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save with selected'}</button>}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field"><span>Title</span>
            <input className="inp" value={f.title} onChange={set('title')} maxLength={200} placeholder="Leave blank to use the first line" /></label>
          <label className="field"><span>Prompt</span><textarea className="inp code" rows={10} value={f.content} onChange={set('content')} required /></label>
          <label className="field"><span>Short description (optional)</span><input className="inp" value={f.description} onChange={set('description')} maxLength={1000} /></label>
          <div className="row">
            <label className="field grow"><span>Category</span><input className="inp" list="cats" value={f.category} onChange={set('category')} /></label>
            <label className="field grow"><span>Platform</span><input className="inp" list="plats" value={f.platform} onChange={set('platform')} /></label>
          </div>
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
            {suggesting && <span className="muted small" aria-live="polite">Asking your local model…</span>}
            {suggesting && <button type="button" className="btn" onClick={skip}>Skip AI and save</button>}
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn p" disabled={save.isPending || suggesting}>{save.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
