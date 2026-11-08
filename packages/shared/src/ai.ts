import { z } from 'zod/v4';
import type { Prompt } from './index';

export function isLoopbackUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

const model = z.string().trim().min(1).max(100);

/** Local AI settings. The address must be on this computer, so prompt text can never be sent to another host by accident. */
export const AiSettings = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().refine(isLoopbackUrl, { message: 'Must be an http address on this computer (127.0.0.1, localhost or ::1).' }),
  chatModel: model,
  embedModel: model,
  suggestOnSave: z.boolean(),
  autoIndex: z.boolean(),
});
export type AiSettings = z.infer<typeof AiSettings>;
export const AiSettingsPatch = AiSettings.partial();

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:11434',
  chatModel: 'llama3.2',
  embedModel: 'nomic-embed-text',
  suggestOnSave: true,
  autoIndex: true,
};

export interface MetadataSuggestion {
  title: string | null; description: string | null; category: string | null; tags: string[]; platform: string | null;
}
export interface AiStatus {
  settings: AiSettings;
  ollama: { reachable: boolean; error?: string; models: string[] };
  chatModelInstalled: boolean;
  embedModelInstalled: boolean;
  index: { total: number; indexed: number; stale: number };
}
export type PromptHit = Prompt & { score?: number };
export interface SearchResponse { items: PromptHit[]; mode: 'keyword' | 'meaning' | 'hybrid'; notice?: string }
export interface RelatedResponse { items: { prompt: Prompt; score: number }[]; notice?: string }
