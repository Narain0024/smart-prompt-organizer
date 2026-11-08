import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeOllama, type FakeOllama } from './fakeOllama.js';
import { OllamaProvider } from './ollama.js';

let fake: FakeOllama;
beforeAll(async () => { fake = await startFakeOllama({ chat: () => '{"title":"T"}' }); });
afterAll(() => fake.close());

describe('OllamaProvider', () => {
  it('lists installed models', async () => {
    expect(await new OllamaProvider(fake.url).models()).toEqual(['llama3.2:latest', 'fake-embed:latest']);
  });
  it('sends the model, messages and JSON schema, and returns the reply text', async () => {
    const r = await new OllamaProvider(fake.url).chat({
      model: 'llama3.2', messages: [{ role: 'user', content: 'hi' }], temperature: 0.2, maxTokens: 50, jsonSchema: { type: 'object' },
    });
    expect(r.text).toBe('{"title":"T"}');
    const sent = fake.calls.filter((c) => c.path === '/api/chat').pop()!.body;
    expect(sent).toMatchObject({ model: 'llama3.2', stream: false, format: { type: 'object' }, options: { temperature: 0.2, num_predict: 50 } });
  });
  it('embeds a batch', async () => {
    const r = await new OllamaProvider(fake.url).embed(['android app', 'robot arm'], 'fake-embed');
    expect(r.vectors).toHaveLength(2);
    expect(r.vectors[0]).toHaveLength(256);
  });
  it('explains how to install a missing model', async () => {
    await expect(new OllamaProvider(fake.url).chat({ model: 'missing', messages: [] }))
      .rejects.toMatchObject({ kind: 'model_missing', message: expect.stringContaining('ollama pull missing') });
  });
  it('reports an unreachable server', async () => {
    await expect(new OllamaProvider('http://127.0.0.1:1').models()).rejects.toMatchObject({ kind: 'unreachable' });
  });
  it('times out instead of waiting forever', async () => {
    const hang = await startFakeOllama({ hang: true });
    try {
      await expect(new OllamaProvider(hang.url, 150).chat({ model: 'm', messages: [] })).rejects.toMatchObject({ kind: 'timeout' });
    } finally { await hang.close(); }
  });
});
