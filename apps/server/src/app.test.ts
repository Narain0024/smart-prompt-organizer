import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { SecretStore } from './secrets.js';

const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ppo-'));
  const secrets = new SecretStore(dir);
  return { secrets, app: buildApp({ db: openDb(':memory:'), secrets, token: 'tok', allowedHosts: ['localhost:80'] }) };
};
const auth = { 'x-session-token': 'tok' };

describe('API security and behaviour', () => {
  it('rejects missing or wrong token, allows health without one', async () => {
    const { app } = mk();
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect((await app.inject('/api/prompts')).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/prompts', headers: { 'x-session-token': 'bad' } })).statusCode).toBe(401);
  });

  it('rejects unexpected Host headers (DNS rebinding)', async () => {
    const { app } = mk();
    const res = await app.inject({ url: '/api/health', headers: { host: 'evil.example' } });
    expect(res.statusCode).toBe(403);
  });

  it('validates input and round-trips a prompt', async () => {
    const { app } = mk();
    expect((await app.inject({ method: 'POST', url: '/api/prompts', headers: auth, payload: { title: '' } })).statusCode).toBe(400);
    const created = await app.inject({ method: 'POST', url: '/api/prompts', headers: auth, payload: { title: 'T', content: 'hello world' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const found = await app.inject({ url: '/api/prompts?q=hello', headers: auth });
    expect(found.json().items[0].id).toBe(id);
    expect((await app.inject({ method: 'GET', url: '/api/prompts/nope', headers: auth })).statusCode).toBe(404);
  });

  it('stores API keys write-only and encrypted', async () => {
    const { app, secrets } = mk();
    const put = await app.inject({ method: 'PUT', url: '/api/secrets/openai', headers: auth, payload: { apiKey: 'sk-test-123' } });
    expect(put.statusCode).toBe(204);
    const list = await app.inject({ url: '/api/secrets', headers: auth });
    expect(list.json().providers.openai).toBe(true);
    expect(list.body).not.toContain('sk-test-123');
    expect(secrets.get('openai')).toBe('sk-test-123');
  });

  it('rejects an unknown collection id, serves exports as attachments, and previews imports', async () => {
    const { app } = mk();
    const bad = await app.inject({ method: 'POST', url: '/api/prompts', headers: auth, payload: { title: 'T', content: 'x', projectId: 'nope' } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject('/api/export')).statusCode).toBe(401);
    const exp = await app.inject({ url: '/api/export?format=csv', headers: auth });
    expect(exp.headers['content-disposition']).toContain('attachment');
    const imp = await app.inject({ method: 'POST', url: '/api/import', headers: auth, payload: { files: [{ name: 'a.txt', text: 'hello' }] } });
    expect(imp.json().summary.new).toBe(1);
    expect(imp.json().imported).toBeNull();
  });
});
