import type { MetadataSuggestion } from '@ppo/shared';
import { CATEGORIES } from './categories.js';
import { OllamaError, type AiClient } from './ollama.js';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string', enum: [...CATEGORIES, 'Other'] },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    platform: { type: 'string' },
  },
  required: ['title', 'description', 'category', 'tags'],
};

const SYSTEM = `You label prompts that a person saved in their personal prompt library.
Read the prompt and answer with JSON only:
- title: a concise title, at most 8 words
- description: one sentence saying what the prompt asks an AI to do
- category: exactly one of the allowed values, or "Other" if none fit
- tags: up to 6 short lowercase tags (technologies, tasks, topics)
- platform: the AI platform it targets, only if the prompt names one, otherwise an empty string
Describe only what the prompt actually contains. Do not invent requirements.`;

const clean = (s: unknown, max: number): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
};

export function parseSuggestion(text: string): MetadataSuggestion {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let data: unknown = null;
  try { data = JSON.parse(stripped); } catch {
    const a = stripped.indexOf('{'), b = stripped.lastIndexOf('}');
    if (a >= 0 && b > a) { try { data = JSON.parse(stripped.slice(a, b + 1)); } catch { data = null; } }
  }
  const fail = () => new OllamaError('bad_response', 'The model did not return usable suggestions. A larger model may follow the format better.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail();
  const o = data as Record<string, unknown>;
  const cat = clean(o.category, 100);
  const category = cat ? CATEGORIES.find((c) => c.toLowerCase() === cat.toLowerCase()) ?? null : null;
  const tags = Array.isArray(o.tags)
    ? [...new Set(o.tags.map((t) => clean(t, 50)?.toLowerCase().replace(/^#/, '')).filter((t): t is string => !!t))].slice(0, 6)
    : [];
  const platformRaw = clean(o.platform, 100);
  const platform = platformRaw && !/^(none|n\/a|unknown|null|unspecified)$/i.test(platformRaw) ? platformRaw : null;
  const out: MetadataSuggestion = { title: clean(o.title, 200), description: clean(o.description, 1000), category, tags, platform };
  if (!out.title && !out.description && !out.category && !out.tags.length) throw fail();
  return out;
}

export async function suggestMetadata(client: AiClient, model: string, input: { title?: string; content: string }): Promise<MetadataSuggestion> {
  const user = `${input.title ? `Current title: ${input.title}\n` : ''}Allowed categories: ${CATEGORIES.join('; ')}\n\nPROMPT TEXT:\n"""\n${input.content.slice(0, 6000)}\n"""`;
  const r = await client.chat({
    model, temperature: 0.2, maxTokens: 400, jsonSchema: SCHEMA,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
  });
  return parseSuggestion(r.text);
}
