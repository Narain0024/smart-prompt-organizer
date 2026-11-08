import { describe, expect, it, beforeEach } from 'vitest';
import { openDb, type DB } from './db.js';
import * as repo from './repo.js';

let db: DB;
beforeEach(() => { db = openDb(':memory:'); });
const base = { title: 'Android expense tracker', content: 'Build a Kotlin expense tracker with Room.', tags: ['android'], isFavorite: false, isPinned: false };

describe('prompt repository', () => {
  it('creates a prompt with version 1 and tags', () => {
    const p = repo.createPrompt(db, base);
    expect(p.version).toBe(1);
    expect(p.tags).toEqual(['android']);
    expect(repo.listVersions(db, p.id)).toHaveLength(1);
  });

  it('adds a version only when title or content changes', () => {
    const p = repo.createPrompt(db, base);
    repo.updatePrompt(db, p.id, { isFavorite: true });
    expect(repo.getPrompt(db, p.id)!.version).toBe(1);
    repo.updatePrompt(db, p.id, { content: 'Build a Kotlin expense tracker with Room and charts.', changeReason: 'Added charts' });
    const versions = repo.listVersions(db, p.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0].changeReason).toBe('Added charts');
  });

  it('restores an older version as a new version without losing history', () => {
    const p = repo.createPrompt(db, base);
    repo.updatePrompt(db, p.id, { content: 'changed' });
    const restored = repo.restoreVersion(db, p.id, 1)!;
    expect(restored.content).toBe(base.content);
    expect(restored.version).toBe(3);
    expect(repo.listVersions(db, p.id)).toHaveLength(3);
  });

  it('finds prompts by keyword and follows edits', () => {
    const p = repo.createPrompt(db, base);
    expect(repo.searchPrompts(db, 'kotlin').map((x) => x.id)).toEqual([p.id]);
    repo.updatePrompt(db, p.id, { content: 'Design an ESP32 robot app.' });
    expect(repo.searchPrompts(db, 'kotlin')).toHaveLength(0);
    expect(repo.searchPrompts(db, 'esp32')).toHaveLength(1);
  });

  it('never throws on hostile search input', () => {
    repo.createPrompt(db, base);
    expect(() => repo.searchPrompts(db, '"( AND * OR ::')).not.toThrow();
    expect(repo.searchPrompts(db, '***')).toEqual([]);
  });

  it('soft-deletes: hidden from list, get and search', () => {
    const p = repo.createPrompt(db, base);
    expect(repo.softDeletePrompt(db, p.id)).toBe(true);
    expect(repo.getPrompt(db, p.id)).toBeNull();
    expect(repo.listPrompts(db)).toHaveLength(0);
    expect(repo.searchPrompts(db, 'kotlin')).toHaveLength(0);
  });

  it('lists pinned prompts first and filters archived', () => {
    const a = repo.createPrompt(db, { ...base, title: 'A' });
    const b = repo.createPrompt(db, { ...base, title: 'B', isPinned: true });
    expect(repo.listPrompts(db)[0].id).toBe(b.id);
    repo.updatePrompt(db, a.id, { archived: true });
    expect(repo.listPrompts(db).map((x) => x.id)).toEqual([b.id]);
    expect(repo.listPrompts(db, { archived: true }).map((x) => x.id)).toEqual([a.id]);
  });
});

describe('filters and counts', () => {
  it('applies category and favorite filters to search and counts', () => {
    repo.createPrompt(db, { ...base, title: 'A', category: 'Android Development', isFavorite: true });
    repo.createPrompt(db, { ...base, title: 'B', category: 'Web Development' });
    expect(repo.searchPrompts(db, 'kotlin')).toHaveLength(2);
    expect(repo.searchPrompts(db, 'kotlin', 25, { category: 'Web Development' }).map((p) => p.title)).toEqual(['B']);
    expect(repo.searchPrompts(db, 'kotlin', 25, { favorite: true }).map((p) => p.title)).toEqual(['A']);
    expect(repo.countPrompts(db)).toBe(2);
    expect(repo.countPrompts(db, { favorite: true })).toBe(1);
  });
});
