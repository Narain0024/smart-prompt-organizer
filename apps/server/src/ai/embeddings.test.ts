import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AiSettings } from '@ppo/shared';
import { openDb } from '../db.js';
import * as repo from '../repo.js';
import { docInput, indexBatch, indexStatus, queryInput, related, search } from './embeddings.js';
import { startFakeOllama, type FakeOllama } from './fakeOllama.js';
import { OllamaProvider } from './ollama.js';

let fake: FakeOllama;
beforeAll(async () => { fake = await startFakeOllama(); });
afterAll(() => fake.close());

const MODEL = 'fake-embed';
const settings = (over: Partial<AiSettings> = {}): AiSettings => ({
  enabled: true, baseUrl: fake.url, chatModel: 'llama3.2', embedModel: MODEL, suggestOnSave: true, autoIndex: true, ...over,
});
const P = (title: string, content: string, extra: object = {}) =>
  ({ title, content, tags: [] as string[], isFavorite: false, isPinned: false, ...extra });

function library() {
  const db = openDb(':memory:');
  const a = repo.createPrompt(db, P('Expense tracker', 'Build an android expense tracker with kotlin and room'));
  const b = repo.createPrompt(db, P('Robot', 'Control an esp32 robot arm over bluetooth with arduino'));
  const c = repo.createPrompt(db, P('Landing', 'Write landing page copy for a hiring poster'));
  return { db, a, b, c };
}
const client = () => new OllamaProvider(fake.url);

describe('indexing', () => {
  it('indexes in batches and reports status', async () => {
    const { db } = library();
    expect(indexStatus(db, MODEL)).toEqual({ total: 3, indexed: 0, stale: 3 });
    expect(await indexBatch(db, client(), MODEL, 2)).toEqual({ indexed: 2, remaining: 1 });
    expect(await indexBatch(db, client(), MODEL, 2)).toEqual({ indexed: 1, remaining: 0 });
    expect(indexStatus(db, MODEL)).toEqual({ total: 3, indexed: 3, stale: 0 });
    expect(await indexBatch(db, client(), MODEL)).toEqual({ indexed: 0, remaining: 0 });
  });

  it('re-indexes only a prompt whose text changed, and ignores deleted ones', async () => {
    const { db, a, c } = library();
    await indexBatch(db, client(), MODEL, 16);
    repo.updatePrompt(db, a.id, { content: 'Build a budgeting app in flutter' });
    expect(indexStatus(db, MODEL).stale).toBe(1);
    repo.softDeletePrompt(db, c.id);
    expect(indexStatus(db, MODEL)).toEqual({ total: 2, indexed: 1, stale: 1 });
    expect(await indexBatch(db, client(), MODEL)).toEqual({ indexed: 1, remaining: 0 });
  });

  it('uses document and query prefixes only for nomic models', () => {
    expect(docInput('nomic-embed-text', 'x')).toBe('search_document: x');
    expect(queryInput('nomic-embed-text:latest', 'x')).toBe('search_query: x');
    expect(docInput('other', 'x')).toBe('x');
  });
});

describe('search', () => {
  it('finds prompts by meaning and reports a similarity score', async () => {
    const { db, a } = library();
    await indexBatch(db, client(), MODEL);
    const r = await search(db, client(), settings(), 'android tracker', 'meaning', {});
    expect(r.mode).toBe('meaning');
    expect(r.items[0].id).toBe(a.id);
    expect(r.items[0].score!).toBeGreaterThan(0.3);
    expect(r.notice).toBeUndefined();
  });

  it('respects filters', async () => {
    const { db, a } = library();
    await indexBatch(db, client(), MODEL);
    repo.updatePrompt(db, a.id, { archived: true });
    await indexBatch(db, client(), MODEL);
    const r = await search(db, client(), settings(), 'android tracker', 'meaning', {});
    expect(r.items.map((p) => p.id)).not.toContain(a.id);
    const archived = await search(db, client(), settings(), 'android tracker', 'meaning', { archived: true });
    expect(archived.items[0].id).toBe(a.id);
  });

  it('hybrid keeps keyword hits and adds meaning hits', async () => {
    const { db, a } = library();
    await indexBatch(db, client(), MODEL);
    const r = await search(db, client(), settings(), 'kotlin', 'hybrid', {});
    expect(r.items[0].id).toBe(a.id);
    expect(r.mode).toBe('hybrid');
  });

  it('falls back to keyword results with a notice when Ollama is down', async () => {
    const { db, a } = library();
    const r = await search(db, new OllamaProvider('http://127.0.0.1:1'), settings({ baseUrl: 'http://127.0.0.1:1' }), 'kotlin', 'meaning', {});
    expect(r.mode).toBe('keyword');
    expect(r.items.map((p) => p.id)).toEqual([a.id]);
    expect(r.notice).toMatch(/unavailable/i);
  });

  it('does keyword search with a notice when AI is turned off', async () => {
    const { db } = library();
    const r = await search(db, client(), settings({ enabled: false }), 'kotlin', 'hybrid', {});
    expect(r.mode).toBe('keyword');
    expect(r.notice).toMatch(/turned off/i);
  });

  it('says so when nothing is indexed yet', async () => {
    const { db } = library();
    const r = await search(db, client(), settings(), 'android', 'meaning', {});
    expect(r.items).toHaveLength(0);
    expect(r.notice).toMatch(/not.*indexed|No prompts are indexed/i);
  });
});

describe('related', () => {
  it('ranks the most similar prompt first, excluding itself, without calling Ollama', async () => {
    const { db, a } = library();
    const similar = repo.createPrompt(db, P('Expense app v2', 'Build an android expense tracker app with kotlin and charts'));
    await indexBatch(db, client(), MODEL);
    const before = fake.calls.length;
    const r = related(db, MODEL, a.id);
    expect(fake.calls.length).toBe(before);
    expect(r.items[0].prompt.id).toBe(similar.id);
    expect(r.items.map((x) => x.prompt.id)).not.toContain(a.id);
    expect(r.items[0].score).toBeGreaterThan(0.5);
  });
  it('explains when a prompt is not indexed', () => {
    const { db, a } = library();
    expect(related(db, MODEL, a.id).notice).toMatch(/not indexed/);
  });
});
