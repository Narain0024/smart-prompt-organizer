import { createHash } from 'node:crypto';
import type { Prompt, RelatedResponse, SearchResponse, AiSettings } from '@ppo/shared';
import type { DB } from '../db.js';
import { filterSql, getPrompt, searchPrompts, type Filters } from '../repo.js';
import { OllamaError, type AiClient } from './ollama.js';
import { dot, fromBlob, normalize, rrf, toBlob } from './vectors.js';

export const MAX_EMBED_CHARS = 6000;

// nomic-embed-text was trained with task prefixes; other models get the plain text.
const usesPrefixes = (model: string) => model.startsWith('nomic-embed-text');
export const docInput = (model: string, text: string) => (usesPrefixes(model) ? `search_document: ${text}` : text);
export const queryInput = (model: string, q: string) => (usesPrefixes(model) ? `search_query: ${q}` : q);

export const embedSource = (p: { title: string; description: string | null; content: string }) =>
  `${p.title}\n${p.description ?? ''}\n${p.content}`.slice(0, MAX_EMBED_CHARS);
const hashOf = (model: string, text: string) => createHash('sha256').update(`${model}\0${text}`).digest('hex');

interface Row { id: string; title: string; description: string | null; content: string; content_hash: string | null }

function rows(db: DB, model: string): Row[] {
  return db.prepare(
    `SELECT p.id, p.title, p.description, p.content, e.content_hash
     FROM prompts p LEFT JOIN embeddings e ON e.prompt_id = p.id AND e.model = ?
     WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC`,
  ).all(model) as unknown as Row[];
}
const needsIndex = (r: Row, model: string) => r.content_hash !== hashOf(model, embedSource(r));

export function indexStatus(db: DB, model: string) {
  const all = rows(db, model);
  const stale = all.filter((r) => needsIndex(r, model)).length;
  return { total: all.length, indexed: all.length - stale, stale };
}

/** Embeds one batch of prompts that are missing or out of date. Call repeatedly until remaining is 0. */
export async function indexBatch(db: DB, client: AiClient, model: string, limit = 16) {
  const todo = rows(db, model).filter((r) => needsIndex(r, model));
  const batch = todo.slice(0, Math.max(1, Math.min(limit, 64)));
  if (batch.length) {
    const texts = batch.map((r) => embedSource(r));
    const { vectors } = await client.embed(texts.map((t) => docInput(model, t)), model);
    if (vectors.length !== batch.length) throw new OllamaError('bad_response', 'Ollama returned a different number of embeddings than requested.');
    const up = db.prepare(
      `INSERT INTO embeddings (prompt_id, model, content_hash, dim, vector, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(prompt_id, model) DO UPDATE SET content_hash = excluded.content_hash, dim = excluded.dim,
         vector = excluded.vector, updated_at = excluded.updated_at`,
    );
    db.transaction(() => {
      batch.forEach((r, i) => {
        const v = normalize(vectors[i]);
        up.run(r.id, model, hashOf(model, texts[i]), v.length, toBlob(v), new Date().toISOString());
      });
    })();
  }
  return { indexed: batch.length, remaining: todo.length - batch.length };
}

function semanticRank(db: DB, model: string, q: Float32Array, f: Filters, limit: number) {
  const w = filterSql(f, 'p');
  const rs = db.prepare(
    `SELECT p.id, e.vector FROM prompts p JOIN embeddings e ON e.prompt_id = p.id AND e.model = ? WHERE ${w.sql}`,
  ).all(model, ...(w.args as never[])) as unknown as { id: string; vector: Uint8Array }[];
  return rs
    .map((r) => ({ id: r.id, v: fromBlob(r.vector) }))
    .filter((r) => r.v.length === q.length)
    .map((r) => ({ id: r.id, score: dot(q, r.v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function search(
  db: DB, client: AiClient, settings: AiSettings, q: string,
  mode: 'keyword' | 'meaning' | 'hybrid', f: Filters, limit = 25,
): Promise<SearchResponse> {
  const keyword = () => searchPrompts(db, q, limit * 2, f);
  if (mode === 'keyword') return { items: keyword().slice(0, limit), mode: 'keyword' };
  if (!settings.enabled) {
    return { items: keyword().slice(0, limit), mode: 'keyword', notice: 'Local AI is turned off, so this is a keyword search. Turn it on in Settings.' };
  }
  const model = settings.embedModel;
  let sem: { id: string; score: number }[];
  try {
    const { vectors } = await client.embed([queryInput(model, q)], model);
    if (!vectors[0]) throw new OllamaError('bad_response', 'No embedding returned.');
    sem = semanticRank(db, model, normalize(vectors[0]), f, limit * 2);
  } catch (e) {
    return { items: keyword().slice(0, limit), mode: 'keyword', notice: `Meaning search is unavailable (${(e as Error).message}) Showing keyword results.` };
  }
  const score = new Map(sem.map((s) => [s.id, s.score]));
  const ids = mode === 'meaning' ? sem.slice(0, limit).map((s) => s.id) : rrf([keyword().map((p) => p.id), sem.map((s) => s.id)]).slice(0, limit);
  const items = ids.map((id) => getPrompt(db, id)).filter((p): p is Prompt => !!p).map((p) => ({ ...p, score: score.get(p.id) }));
  const st = indexStatus(db, model);
  let notice: string | undefined;
  if (st.total > 0 && st.indexed === 0) notice = 'No prompts are indexed for meaning search yet. Build the index in Settings.';
  else if (st.stale > 0) notice = `${st.stale} prompt${st.stale === 1 ? ' is' : 's are'} not indexed yet and may be missing from meaning results.`;
  return { items, mode, notice };
}

/** Similar prompts from stored vectors only, so it works even when Ollama is not running. */
export function related(db: DB, model: string, id: string, limit = 6): RelatedResponse {
  const me = db.prepare('SELECT vector FROM embeddings WHERE prompt_id = ? AND model = ?').get(id, model) as unknown as { vector: Uint8Array } | undefined;
  if (!me) return { items: [], notice: 'This prompt is not indexed yet. Build the index in Settings.' };
  const q = fromBlob(me.vector);
  const rs = db.prepare(
    `SELECT p.id, e.vector FROM prompts p JOIN embeddings e ON e.prompt_id = p.id AND e.model = ?
     WHERE p.deleted_at IS NULL AND p.id != ?`,
  ).all(model, id) as unknown as { id: string; vector: Uint8Array }[];
  const top = rs
    .map((r) => ({ id: r.id, v: fromBlob(r.vector) }))
    .filter((r) => r.v.length === q.length)
    .map((r) => ({ id: r.id, score: dot(q, r.v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const items = top.flatMap((t) => { const p = getPrompt(db, t.id); return p ? [{ prompt: p, score: t.score }] : []; });
  return { items };
}
