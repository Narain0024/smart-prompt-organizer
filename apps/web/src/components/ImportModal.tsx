import { useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportBody, ImportResult } from '@ppo/shared';
import { api } from '../api';
import { autoIndex } from '../indexing';
import { CATEGORIES } from '../lib';
import Modal from './Modal';

const LABEL = { new: 'New', duplicate: 'Duplicate', duplicate_in_batch: 'Duplicate in this import', invalid: 'Invalid' } as const;

export default function ImportModal({ title, accept, onClose }: { title: string; accept: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [readErr, setReadErr] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'import'>('skip');
  const [result, setResult] = useState<ImportResult | null>(null);

  const body = (commit: boolean): ImportBody => ({ files, commit, onDuplicate, category: category || undefined, tags: [] });
  const preview = useMutation({ mutationFn: () => api.importFiles(body(false)), onSuccess: setResult });
  const commit = useMutation({
    mutationFn: () => api.importFiles(body(true)),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['prompts'] }); qc.invalidateQueries({ queryKey: ['projects'] }); void autoIndex(qc); },
  });
  const done = commit.isSuccess;
  const clear = () => { setResult(null); preview.reset(); };

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const list = [...(e.target.files ?? [])];
    try {
      const read = await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() })));
      if (read.reduce((n, f) => n + f.text.length, 0) > 15_000_000) { setReadErr('These files are too large to import at once (limit about 15 MB). Import them in smaller batches.'); setFiles([]); }
      else { setFiles(read); setReadErr(null); }
      clear();
    } catch { setReadErr('Could not read one of the files.'); }
  }
  const err = (preview.error ?? commit.error) as Error | null;

  return (
    <Modal title={title} onClose={onClose} wide>
      {!done && (
        <>
          <label className="field"><span>Files ({accept})</span>
            <input className="inp" type="file" multiple accept={accept} onChange={pick} />
          </label>
          <div className="row">
            <label className="field grow"><span>Category for items without one (optional)</span>
              <select className="inp" style={{ width: '100%' }} value={category} onChange={(e) => { setCategory(e.target.value); clear(); }}>
                <option value="">Leave as is</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field grow"><span>When a prompt already exists</span>
              <select className="inp" style={{ width: '100%' }} value={onDuplicate} onChange={(e) => { setOnDuplicate(e.target.value as 'skip' | 'import'); clear(); }}>
                <option value="skip">Skip it</option>
                <option value="import">Import it anyway</option>
              </select>
            </label>
          </div>
        </>
      )}
      {readErr && <div className="err" role="alert">{readErr}</div>}
      {err && <div className="err" role="alert">{err.message}</div>}
      {result && (
        <section aria-live="polite">
          <p>
            {done
              ? <strong>Imported {result.imported} prompt{result.imported === 1 ? '' : 's'}.</strong>
              : <><strong>{result.summary.new} new</strong>, {result.summary.duplicates} duplicate{result.summary.duplicates === 1 ? '' : 's'}, {result.summary.invalid} invalid.</>}
          </p>
          <div className="scroll">
            {result.items.slice(0, 300).map((it, i) => (
              <div className="irow" key={i}>
                <span><strong>{it.title}</strong>
                  {it.duplicateOf && <span className="muted small"> · matches “{it.duplicateOf.title}”</span>}
                  {it.error && <span className="small" style={{ color: 'var(--danger)' }}> · {it.error}</span>}
                </span>
                <span className={it.status === 'new' ? 'chip g' : 'chip'}>{LABEL[it.status]}</span>
              </div>
            ))}
            {result.items.length > 300 && <p className="muted small">Showing the first 300 of {result.items.length}.</p>}
          </div>
        </section>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
        {!done && !result && <button className="btn p" disabled={!files.length || preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? 'Checking…' : 'Preview'}</button>}
        {!done && result && (
          <button className="btn p" disabled={result.toImport === 0 || commit.isPending} onClick={() => commit.mutate()}>
            {commit.isPending ? 'Importing…' : `Import ${result.toImport} prompt${result.toImport === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
