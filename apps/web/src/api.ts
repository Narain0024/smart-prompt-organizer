import type { ImportBody, ImportResult, Project, Prompt, PromptInput, PromptUpdate, PromptVersion } from '@ppo/shared';

const KEY = 'ppo.token';

/** The server prints a launch URL ending in #token=…; keep the token for this tab only, then clean the URL. */
export function captureToken() {
  const m = location.hash.match(/token=([A-Za-z0-9]+)/);
  if (!m) return;
  try { sessionStorage.setItem(KEY, m[1]); } catch { /* storage unavailable */ }
  history.replaceState(null, '', location.pathname + location.search + '#/');
}
const token = (): string => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const hasToken = (): boolean => !!token();

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const SESSION_MSG = 'Session missing or expired. Open the launch URL printed by the server.';

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { 'x-session-token': token(), ...(hasBody ? { 'content-type': 'application/json' } : {}) },
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the local server. Is it running?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      res.status === 401 ? SESSION_MSG
      : data?.issues ? data.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : data?.error === 'invalid_reference' ? 'That collection no longer exists.'
      : data?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export async function downloadExport(format: 'json' | 'csv'): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try { res = await fetch(`/api/export?format=${format}`, { headers: { 'x-session-token': token() } }); }
  catch { throw new ApiError(0, 'Cannot reach the local server. Is it running?'); }
  if (!res.ok) throw new ApiError(res.status, res.status === 401 ? SESSION_MSG : `Export failed (${res.status})`);
  const filename = (res.headers.get('content-disposition') ?? '').match(/filename="([^"]+)"/)?.[1] ?? `prompts.${format}`;
  return { blob: await res.blob(), filename };
}

export interface ListParams { q?: string; category?: string; favorite?: boolean; archived?: boolean; projectId?: string; limit?: number }
export interface ListResult { items: Prompt[]; total: number }
export interface ProjectInputBody { name: string; description?: string | null; notes?: string | null }

export const api = {
  health: () => req<{ ok: boolean }>('/api/health'),
  list(p: ListParams = {}) {
    const sp = new URLSearchParams();
    if (p.q) sp.set('q', p.q);
    if (p.category) sp.set('category', p.category);
    if (p.favorite) sp.set('favorite', 'true');
    if (p.archived) sp.set('archived', 'true');
    if (p.projectId) sp.set('projectId', p.projectId);
    if (p.limit) sp.set('limit', String(p.limit));
    return req<ListResult>(`/api/prompts?${sp}`);
  },
  create: (input: PromptInput) => req<Prompt>('/api/prompts', { method: 'POST', body: input }),
  update: (id: string, patch: PromptUpdate) => req<Prompt>(`/api/prompts/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) => req<void>(`/api/prompts/${id}`, { method: 'DELETE' }),
  versions: (id: string) => req<{ items: PromptVersion[] }>(`/api/prompts/${id}/versions`),
  restore: (id: string, n: number) => req<Prompt>(`/api/prompts/${id}/versions/${n}/restore`, { method: 'POST' }),
  projects: () => req<{ items: Project[] }>('/api/projects'),
  project: (id: string) => req<Project>(`/api/projects/${id}`),
  createProject: (b: ProjectInputBody) => req<Project>('/api/projects', { method: 'POST', body: b }),
  updateProject: (id: string, b: Partial<ProjectInputBody>) => req<Project>(`/api/projects/${id}`, { method: 'PATCH', body: b }),
  deleteProject: (id: string) => req<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  importFiles: (b: ImportBody) => req<ImportResult>('/api/import', { method: 'POST', body: b }),
  secrets: () => req<{ providers: Record<string, boolean> }>('/api/secrets'),
  setSecret: (provider: string, apiKey: string) => req<void>(`/api/secrets/${provider}`, { method: 'PUT', body: { apiKey } }),
  deleteSecret: (provider: string) => req<void>(`/api/secrets/${provider}`, { method: 'DELETE' }),
};
