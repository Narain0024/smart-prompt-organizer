import type { Prompt, PromptInput, PromptUpdate, PromptVersion } from '@ppo/shared';

const KEY = 'ppo.token';

/** The server prints a launch URL ending in #token=…; keep the token for this tab only, then clean the URL. */
export function captureToken() {
  const m = location.hash.match(/token=([A-Za-z0-9]+)/);
  if (!m) return;
  try { sessionStorage.setItem(KEY, m[1]); } catch { /* storage unavailable */ }
  history.replaceState(null, '', location.pathname + location.search + '#/');
}
export function hasToken(): boolean {
  try { return !!sessionStorage.getItem(KEY); } catch { return false; }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let token = '';
  try { token = sessionStorage.getItem(KEY) ?? ''; } catch { /* ignore */ }
  const hasBody = init.body !== undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { 'x-session-token': token, ...(hasBody ? { 'content-type': 'application/json' } : {}) },
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the local server. Is `npm run dev:server` running?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      res.status === 401 ? 'Session missing or expired. Open the launch URL printed by the server.'
      : data?.issues ? data.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : data?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export interface ListParams { q?: string; category?: string; favorite?: boolean; archived?: boolean; limit?: number }
export interface ListResult { items: Prompt[]; total: number }

export const api = {
  health: () => req<{ ok: boolean }>('/api/health'),
  list(p: ListParams = {}) {
    const sp = new URLSearchParams();
    if (p.q) sp.set('q', p.q);
    if (p.category) sp.set('category', p.category);
    if (p.favorite) sp.set('favorite', 'true');
    if (p.archived) sp.set('archived', 'true');
    if (p.limit) sp.set('limit', String(p.limit));
    return req<ListResult>(`/api/prompts?${sp}`);
  },
  create: (input: PromptInput) => req<Prompt>('/api/prompts', { method: 'POST', body: input }),
  update: (id: string, patch: PromptUpdate) => req<Prompt>(`/api/prompts/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) => req<void>(`/api/prompts/${id}`, { method: 'DELETE' }),
  versions: (id: string) => req<{ items: PromptVersion[] }>(`/api/prompts/${id}/versions`),
  restore: (id: string, n: number) => req<Prompt>(`/api/prompts/${id}/versions/${n}/restore`, { method: 'POST' }),
  secrets: () => req<{ providers: Record<string, boolean> }>('/api/secrets'),
  setSecret: (provider: string, apiKey: string) => req<void>(`/api/secrets/${provider}`, { method: 'PUT', body: { apiKey } }),
  deleteSecret: (provider: string) => req<void>(`/api/secrets/${provider}`, { method: 'DELETE' }),
};
