import type { ChatRequest, ChatResult, EmbedResult, ProviderAdapter } from '../providers/types.js';

export type OllamaErrorKind = 'unreachable' | 'timeout' | 'model_missing' | 'http' | 'bad_response';
export class OllamaError extends Error {
  kind: OllamaErrorKind;
  constructor(kind: OllamaErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'OllamaError';
  }
}

/** What the rest of the server needs from an AI backend. Tests swap in a fake. */
export interface AiClient {
  models(): Promise<string[]>;
  chat(req: ChatRequest, apiKey?: string | null): Promise<ChatResult>;
  embed(texts: string[], model: string, apiKey?: string | null): Promise<EmbedResult>;
}

export class OllamaProvider implements ProviderAdapter, AiClient {
  readonly id = 'ollama' as const;
  readonly capabilities = { chat: true, embed: true };
  private base: string;
  private timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 90_000) {
    this.base = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  private async call<T>(path: string, body: unknown, model?: string, timeoutMs = this.timeoutMs): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (isAbort(e)) throw new OllamaError('timeout', 'Ollama took too long to respond.');
      throw new OllamaError('unreachable', 'Cannot reach Ollama. Is it running? (Open the Ollama app, or run `ollama serve`.)');
    }
    try {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = text;
        try { msg = JSON.parse(text).error ?? text; } catch { /* plain text */ }
        if (res.status === 404 && model) {
          throw new OllamaError('model_missing', `The model "${model}" is not installed. Install it with: ollama pull ${model}`);
        }
        throw new OllamaError('http', `Ollama returned ${res.status}${msg ? `: ${String(msg).slice(0, 200)}` : ''}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof OllamaError) throw e;
      if (isAbort(e)) throw new OllamaError('timeout', 'Ollama took too long to respond.');
      throw new OllamaError('bad_response', 'Ollama sent a response that could not be read.');
    } finally {
      clearTimeout(timer);
    }
  }

  async models(): Promise<string[]> {
    const r = await this.call<{ models?: { name?: unknown }[] }>('/api/tags', undefined, undefined, 5_000);
    return (r.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === 'string');
  }

  async chat(req: ChatRequest, _apiKey: string | null = null): Promise<ChatResult> {
    const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream: false };
    if (req.jsonSchema) body.format = req.jsonSchema;
    const options: Record<string, unknown> = {};
    if (req.temperature !== undefined) options.temperature = req.temperature;
    if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
    if (Object.keys(options).length) body.options = options;
    const r = await this.call<{ message?: { content?: unknown } }>('/api/chat', body, req.model);
    if (typeof r.message?.content !== 'string') throw new OllamaError('bad_response', 'Ollama sent an unexpected chat response.');
    return { text: r.message.content, model: req.model };
  }

  async embed(texts: string[], model: string, _apiKey: string | null = null): Promise<EmbedResult> {
    const r = await this.call<{ embeddings?: unknown }>('/api/embed', { model, input: texts }, model);
    const ok = Array.isArray(r.embeddings) && r.embeddings.every((v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number'));
    if (!ok) throw new OllamaError('bad_response', 'Ollama sent unexpected embeddings.');
    return { vectors: r.embeddings as number[][], model };
  }
}
