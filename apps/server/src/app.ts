import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { ZodError, z } from 'zod';
import { PROVIDER_IDS, PromptInput, PromptUpdate, SecretInput } from '@ppo/shared';
import type { DB } from './db.js';
import type { SecretStore } from './secrets.js';
import * as repo from './repo.js';

export interface AppOptions { db: DB; secrets: SecretStore; token: string; allowedHosts: string[] }

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function buildApp({ db, secrets, token, allowedHosts }: AppOptions) {
  const app = Fastify({ logger: false });

  // Only this machine may talk to the API: host allow-list blocks DNS-rebinding, token blocks other web pages.
  app.addHook('onRequest', async (req, reply) => {
    if (!allowedHosts.includes(req.headers.host ?? '')) return reply.code(403).send({ error: 'forbidden_host' });
    if (req.url === '/api/health') return;
    if (req.url.startsWith('/api/')) {
      const given = req.headers['x-session-token'];
      if (typeof given !== 'string' || !safeEqual(given, token)) return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation', issues: err.issues });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  const notFound = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => reply.code(404).send({ error: 'not_found' });
  type IdReq = { params: { id: string } };

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/prompts', async (req) => {
    const q = z.object({
      q: z.string().optional(), category: z.string().optional(),
      favorite: z.enum(['true', 'false']).optional(), archived: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().positive().optional(), offset: z.coerce.number().int().min(0).optional(),
    }).parse(req.query);
    const opts = { category: q.category, favorite: q.favorite === 'true', archived: q.archived === 'true' };
    const items = q.q
      ? repo.searchPrompts(db, q.q, q.limit, opts)
      : repo.listPrompts(db, { ...opts, limit: q.limit, offset: q.offset });
    return { items, total: q.q ? items.length : repo.countPrompts(db, opts) };
  });

  app.post('/api/prompts', async (req, reply) => reply.code(201).send(repo.createPrompt(db, PromptInput.parse(req.body))));

  app.get<IdReq>('/api/prompts/:id', async (req, reply) => repo.getPrompt(db, req.params.id) ?? notFound(reply));
  app.patch<IdReq>('/api/prompts/:id', async (req, reply) =>
    repo.updatePrompt(db, req.params.id, PromptUpdate.parse(req.body)) ?? notFound(reply));
  app.delete<IdReq>('/api/prompts/:id', async (req, reply) =>
    repo.softDeletePrompt(db, req.params.id) ? reply.code(204).send() : notFound(reply));

  app.get<IdReq>('/api/prompts/:id/versions', async (req, reply) =>
    repo.getPrompt(db, req.params.id) ? { items: repo.listVersions(db, req.params.id) } : notFound(reply));
  app.post<{ Params: { id: string; n: string } }>('/api/prompts/:id/versions/:n/restore', async (req, reply) =>
    repo.restoreVersion(db, req.params.id, Number(req.params.n)) ?? notFound(reply));

  // API keys are write-only. This route reports presence, never the value.
  app.get('/api/secrets', async () => ({ providers: Object.fromEntries(PROVIDER_IDS.map((p) => [p, secrets.has(p)])) }));
  app.put<{ Params: { provider: string } }>('/api/secrets/:provider', async (req, reply) => {
    const provider = z.enum(PROVIDER_IDS).parse(req.params.provider);
    secrets.set(provider, SecretInput.parse(req.body).apiKey);
    return reply.code(204).send();
  });
  app.delete<{ Params: { provider: string } }>('/api/secrets/:provider', async (req, reply) => {
    secrets.delete(z.enum(PROVIDER_IDS).parse(req.params.provider));
    return reply.code(204).send();
  });

  return app;
}
