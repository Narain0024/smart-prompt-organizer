import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, isLoopbackUrl } from '@ppo/shared';
import { openDb } from '../db.js';
import { getAiSettings, saveAiSettings } from './settings.js';

describe('AI settings', () => {
  it('starts disabled with sensible defaults', () => {
    expect(getAiSettings(openDb(':memory:'))).toEqual(DEFAULT_AI_SETTINGS);
    expect(DEFAULT_AI_SETTINGS.enabled).toBe(false);
  });
  it('saves partial updates and keeps the rest', () => {
    const db = openDb(':memory:');
    saveAiSettings(db, { enabled: true, chatModel: 'qwen2.5:7b' });
    expect(getAiSettings(db)).toMatchObject({ enabled: true, chatModel: 'qwen2.5:7b', embedModel: 'nomic-embed-text' });
  });
  it('only accepts addresses on this computer', () => {
    const db = openDb(':memory:');
    expect(() => saveAiSettings(db, { baseUrl: 'http://example.com:11434' })).toThrow();
    expect(() => saveAiSettings(db, { baseUrl: 'not a url' })).toThrow();
    expect(saveAiSettings(db, { baseUrl: 'http://localhost:11434' }).baseUrl).toBe('http://localhost:11434');
    expect(isLoopbackUrl('http://[::1]:11434')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1.evil.com')).toBe(false);
  });
  it('recovers from corrupted stored settings', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai', ?)").run('{broken');
    expect(getAiSettings(db)).toEqual(DEFAULT_AI_SETTINGS);
  });
});
