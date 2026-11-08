import { describe, expect, it } from 'vitest';
import { OllamaError } from './ollama.js';
import { parseSuggestion, suggestMetadata } from './suggest.js';

describe('parseSuggestion', () => {
  it('cleans a well-formed answer', () => {
    const s = parseSuggestion(JSON.stringify({ title: '  Android  expense tracker ', description: 'Build it.', category: 'android development', tags: ['#Kotlin', 'kotlin', 'Room'], platform: 'None' }));
    expect(s).toEqual({ title: 'Android expense tracker', description: 'Build it.', category: 'Android Development', tags: ['kotlin', 'room'], platform: null });
  });
  it('drops categories that are not in the list', () => {
    expect(parseSuggestion('{"title":"T","category":"Cooking","tags":[]}').category).toBeNull();
    expect(parseSuggestion('{"title":"T","category":"Other","tags":[]}').category).toBeNull();
  });
  it('accepts JSON wrapped in code fences or chatter', () => {
    expect(parseSuggestion('```json\n{"title":"A","tags":[]}\n```').title).toBe('A');
    expect(parseSuggestion('Sure! {"title":"B","tags":[]} Hope that helps').title).toBe('B');
  });
  it('limits tags to six', () => {
    expect(parseSuggestion(JSON.stringify({ title: 'T', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })).tags).toHaveLength(6);
  });
  it('rejects unusable answers with a readable error', () => {
    for (const bad of ['not json', '[]', '{}', '{"title":"","tags":[]}']) {
      try { parseSuggestion(bad); throw new Error('should have thrown'); }
      catch (e) { expect(e).toBeInstanceOf(OllamaError); expect((e as OllamaError).kind).toBe('bad_response'); }
    }
  });
});

describe('suggestMetadata', () => {
  it('asks for JSON with the category list and returns the parsed result', async () => {
    let seen: any;
    const client = {
      models: async () => [],
      embed: async () => ({ vectors: [], model: '' }),
      chat: async (req: any) => { seen = req; return { text: '{"title":"Plan","tags":["x"],"category":"Web Development"}', model: 'm' }; },
    };
    const r = await suggestMetadata(client, 'llama3.2', { title: 'Old', content: 'Build a landing page' });
    expect(r.category).toBe('Web Development');
    expect(seen.jsonSchema.properties.category.enum).toContain('Android Development');
    expect(seen.messages[1].content).toContain('Build a landing page');
    expect(seen.messages[1].content).toContain('Current title: Old');
  });
});
