import type { ProviderId } from '@ppo/shared';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatRequest {
  model: string; messages: ChatMessage[]; maxTokens?: number; temperature?: number;
  /** Ask the model to answer as JSON matching this JSON Schema (where the provider supports it). */
  jsonSchema?: Record<string, unknown>;
}
export interface ChatResult { text: string; model: string }
export interface EmbedResult { vectors: number[][]; model: string }

/** Every vendor implements this. Features ask for a capability, never for a specific vendor. */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: { chat: boolean; embed: boolean };
  chat(req: ChatRequest, apiKey: string | null): Promise<ChatResult>;
  embed?(texts: string[], model: string, apiKey: string | null): Promise<EmbedResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(id: string) { super(`Provider "${id}" is not configured or has no adapter yet.`); }
}

const registry = new Map<ProviderId, ProviderAdapter>();
export const registerProvider = (a: ProviderAdapter) => registry.set(a.id, a);
export function getProvider(id: ProviderId): ProviderAdapter {
  const a = registry.get(id);
  if (!a) throw new ProviderNotConfiguredError(id);
  return a;
}
