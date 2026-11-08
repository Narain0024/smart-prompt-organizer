import type { FastifyInstance } from 'fastify';
import { z } from 'zod/v4';
import { AiSettingsPatch, type AiStatus } from '@ppo/shared';
import type { DB } from '../db.js';
import { getPrompt } from '../repo.js';
import { indexBatch, indexStatus, related, search } from './embeddings.js';
import { OllamaError, OllamaProvider, type AiClient } from './ollama.js';
import { getAiSettings, saveAiSettings } from './settings.js';
import { suggestMetadata } from './suggest.js';

export interface AiRouteDeps { makeClient?: (baseUrl: string) => AiClient }

export function registerAiRoutes(app: FastifyInstance, db: DB, deps: AiRouteDeps = {}) {
  const make = deps.makeClient ?? ((url: string) => new OllamaProvider(url));
  const installed = (name: string, models: string[]) => models.includes(name) || models.includes(`${name}:latest`);
  const disabled = { error: 'ai_disabled', message: 'Turn on local AI in Settings first.' };
  // Ollama problems are reported as 502 with a readable message; anything else is a real bug and bubbles up.
  const fail = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) => {
    if (e instanceof OllamaError) return reply.code(502).send({ error: 'ai_unavailable', message: e.message });
    throw e;
  };

  app.get('/api/ai/settings', async () => getAiSettings(db));
  app.put('/api/ai/settings', async (req) => saveAiSettings(db, AiSettingsPatch.parse(req.body)));

  app.get('/api/ai/status', async (): Promise<AiStatus> => {
    const settings = getAiSettings(db);
    let ollama: AiStatus['ollama'];
    try { ollama = { reachable: true, models: await make(settings.baseUrl).models() }; }
    catch (e) { ollama = { reachable: false, models: [], error: (e as Error).message }; }
    return {
      settings, ollama,
      chatModelInstalled: installed(settings.chatModel, ollama.models),
      embedModelInstalled: installed(settings.embedModel, ollama.models),
      index: indexStatus(db, settings.embedModel),
    };
  });

  app.post('/api/ai/suggest', async (req, reply) => {
    const body = z.object({ title: z.string().max(200).optional(), content: z.string().min(1).max(200_000) }).parse(req.body);
    const s = getAiSettings(db);
    if (!s.enabled) return reply.code(409).send(disabled);
    try { return await suggestMetadata(make(s.baseUrl), s.chatModel, body); } catch (e) { return fail(reply, e); }
  });

  app.post('/api/ai/index/run', async (req, reply) => {
    const { limit } = z.object({ limit: z.number().int().positive().max(64).optional() }).parse(req.body ?? {});
    const s = getAiSettings(db);
    if (!s.enabled) return reply.code(409).send(disabled);
    try { return await indexBatch(db, make(s.baseUrl), s.embedModel, limit ?? 16); } catch (e) { return fail(reply, e); }
  });

  const SearchQuery = z.object({
    q: z.string().trim().min(1), mode: z.enum(['keyword', 'meaning', 'hybrid']).default('hybrid'),
    category: z.string().optional(), favorite: z.enum(['true', 'false']).optional(), archived: z.enum(['true', 'false']).optional(),
    projectId: z.string().optional(), limit: z.coerce.number().int().positive().max(100).default(25),
  });
  app.get('/api/search', async (req) => {
    const q = SearchQuery.parse(req.query);
    const s = getAiSettings(db);
    return search(db, make(s.baseUrl), s, q.q, q.mode,
      { category: q.category, favorite: q.favorite === 'true', archived: q.archived === 'true', projectId: q.projectId }, q.limit);
  });

  app.get<{ Params: { id: string } }>('/api/prompts/:id/related', async (req, reply) => {
    if (!getPrompt(db, req.params.id)) return reply.code(404).send({ error: 'not_found' });
    return related(db, getAiSettings(db).embedModel, req.params.id);
  });
}
