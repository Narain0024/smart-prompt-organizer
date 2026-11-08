import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { openDb } from '../db.js';
import * as repo from '../repo.js';
import { SecretStore } from '../secrets.js';
import { startFakeOllama, type FakeOllama } from './fakeOllama.js';
import { OllamaProvider } from './ollama.js';
import { registerAiRoutes } from './routes.js';

let fake: FakeOllama;
beforeAll(async () => {
  fake = await startFakeOllama({ chat: () => JSON.stringify({ title: 'Expense tracker', description: 'Builds an app.', category: 'Android Development', tags: ['kotlin'] }) });
});
afterAll(() => fake.close());

async function setup() {
  const db = openDb(':memory:');
  const app = Fastify();
  registerAiRoutes(app, db, { makeClient: (url) => new OllamaProvider(url, 2_000) });
  await app.ready();
  const setAi = (p: object) => app.inject({ method: 'PUT', url: '/api/ai/settings', payload: p });
  return { db, app, setAi };
}

describe('AI routes', () => {
  it('require the session token when mounted in the real app', async () => {
    const app = buildApp({ db: openDb(':memory:'), secrets: new SecretStore(mkdtempSync(join(tmpdir(), 'ppo-'))), token: 'tok', allowedHosts: ['localhost:80'] });
    for (const url of ['/api/ai/status', '/api/ai/settings', '/api/search?q=x']) {
      expect((await app.inject(url)).statusCode).toBe(401);
    }
  });

  it('refuse AI work while AI is turned off', async () => {
    const { app } = await setup();
    expect((await app.inject({ method: 'POST', url: '/api/ai/suggest', payload: { content: 'hi' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/ai/index/run', payload: {} })).statusCode).toBe(409);
  });

  it('report status including installed models and index counts', async () => {
    const { app, db, setAi } = await setup();
    repo.createPrompt(db, { title: 'T', content: 'hello', tags: [], isFavorite: false, isPinned: false });
    await setAi({ enabled: true, baseUrl: fake.url, embedModel: 'fake-embed' });
    const s = (await app.inject('/api/ai/status')).json();
    expect(s.ollama.reachable).toBe(true);
    expect(s.chatModelInstalled).toBe(true);
    expect(s.embedModelInstalled).toBe(true);
    expect(s.index).toEqual({ total: 1, indexed: 0, stale: 1 });
  });

  it('report an unreachable Ollama instead of failing', async () => {
    const { app, setAi } = await setup();
    await setAi({ baseUrl: 'http://127.0.0.1:1' });
    const s = (await app.inject('/api/ai/status')).json();
    expect(s.ollama.reachable).toBe(false);
    expect(s.ollama.error).toMatch(/Cannot reach Ollama/);
  });

  it('suggest metadata, index, and search by meaning end to end', async () => {
    const { app, db, setAi } = await setup();
    const p = repo.createPrompt(db, { title: 'Tracker', content: 'Build an android expense tracker', tags: [], isFavorite: false, isPinned: false });
    await setAi({ enabled: true, baseUrl: fake.url, embedModel: 'fake-embed' });
    const sug = await app.inject({ method: 'POST', url: '/api/ai/suggest', payload: { content: 'Build an android expense tracker' } });
    expect(sug.json()).toMatchObject({ category: 'Android Development', tags: ['kotlin'] });
    expect((await app.inject({ method: 'POST', url: '/api/ai/index/run', payload: {} })).json()).toEqual({ indexed: 1, remaining: 0 });
    const found = (await app.inject('/api/search?q=android%20tracker&mode=meaning')).json();
    expect(found.items[0].id).toBe(p.id);
    const rel = (await app.inject(`/api/prompts/${p.id}/related`)).json();
    expect(rel.items).toEqual([]);
    expect((await app.inject('/api/prompts/nope/related')).statusCode).toBe(404);
  });

  it('turn a missing model into a readable 502', async () => {
    const { app, setAi } = await setup();
    await setAi({ enabled: true, baseUrl: fake.url, chatModel: 'missing' });
    const r = await app.inject({ method: 'POST', url: '/api/ai/suggest', payload: { content: 'hi' } });
    expect(r.statusCode).toBe(502);
    expect(r.json().message).toContain('ollama pull missing');
  });
});
