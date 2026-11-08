import { describe, expect, it } from 'vitest';
import type { ImportBody } from '@ppo/shared';
import { openDb } from './db.js';
import { buildBackup, buildCsv } from './exporter.js';
import { runImport } from './importer.js';
import * as repo from './repo.js';

const req = (files: { name: string; text: string }[], over: Partial<ImportBody> = {}): ImportBody =>
  ({ files, commit: false, onDuplicate: 'skip', tags: [], ...over });
const base = { title: 'T', content: 'Build a Kotlin app.', tags: [] as string[], isFavorite: false, isPinned: false };

describe('import', () => {
  it('preview writes nothing', () => {
    const db = openDb(':memory:');
    const r = runImport(db, req([{ name: 'a.txt', text: 'hello' }]));
    expect(r.summary.new).toBe(1);
    expect(r.imported).toBeNull();
    expect(repo.countPrompts(db)).toBe(0);
  });

  it('commits new prompts and flags duplicates against the library and within the batch', () => {
    const db = openDb(':memory:');
    repo.createPrompt(db, { ...base, content: 'Hello   World' });
    const r = runImport(db, req([
      { name: 'a.txt', text: 'hello world' }, { name: 'b.txt', text: 'fresh' }, { name: 'c.txt', text: 'FRESH' }, { name: 'd.bin', text: 'x' },
    ], { commit: true }));
    expect(r.items.map((i) => i.status)).toEqual(['duplicate', 'new', 'duplicate_in_batch', 'invalid']);
    expect(r.items[0].duplicateOf?.title).toBe('T');
    expect(r.imported).toBe(1);
    expect(repo.countPrompts(db)).toBe(2);
  });

  it('imports duplicates anyway when asked', () => {
    const db = openDb(':memory:');
    repo.createPrompt(db, base);
    const r = runImport(db, req([{ name: 'a.txt', text: base.content }], { commit: true, onDuplicate: 'import' }));
    expect(r.imported).toBe(1);
    expect(repo.countPrompts(db)).toBe(2);
  });

  it('applies the batch category only to items without one', () => {
    const db = openDb(':memory:');
    const json = JSON.stringify([{ content: 'one', category: 'Android Development' }, { content: 'two' }]);
    runImport(db, req([{ name: 'a.json', text: json }], { commit: true, category: 'Web Development' }));
    const cats = repo.listPrompts(db).map((p) => p.category).sort();
    expect(cats).toEqual(['Android Development', 'Web Development']);
  });

  it('round-trips a backup: versions, collection details, archive state', () => {
    const a = openDb(':memory:');
    const proj = repo.createProject(a, { name: 'Tracker', description: 'd', notes: 'n' });
    const p = repo.createPrompt(a, { ...base, projectId: proj.id, category: 'Android Development' });
    repo.updatePrompt(a, p.id, { content: 'Build a Kotlin app with charts.', changeReason: 'Added charts' });
    repo.updatePrompt(a, p.id, { archived: true });
    const json = JSON.stringify(buildBackup(a));

    const b = openDb(':memory:');
    runImport(b, req([{ name: 'backup.json', text: json }], { commit: true }));
    const [got] = repo.listAllPrompts(b);
    expect(got).toMatchObject({ content: 'Build a Kotlin app with charts.', archived: true, version: 2, category: 'Android Development' });
    expect(repo.listVersions(b, got.id).map((v) => [v.version, v.changeReason])).toEqual([[2, 'Added charts'], [1, 'Original']]);
    expect(repo.listProjects(b)[0]).toMatchObject({ name: 'Tracker', description: 'd', notes: 'n', promptCount: 1 });

    const again = runImport(b, req([{ name: 'backup.json', text: json }], { commit: true }));
    expect(again.summary.duplicates).toBe(1);
    expect(repo.listAllPrompts(b)).toHaveLength(1);
  });
});

describe('csv export', () => {
  it('escapes quotes and newlines, guards formulas, starts with a BOM', () => {
    const db = openDb(':memory:');
    repo.createPrompt(db, { ...base, title: 'Quote', content: 'say "hi"\nbye' });
    repo.createPrompt(db, { ...base, title: 'Formula', content: '=cmd()' });
    const csv = buildCsv(db);
    expect(csv.startsWith('\uFEFFtitle,content')).toBe(true);
    expect(csv).toContain('"say ""hi""\nbye"');
    expect(csv).toContain("'=cmd()");
  });
});

describe('collections', () => {
  it('counts prompts, filters by collection, and keeps prompts when a collection is deleted', () => {
    const db = openDb(':memory:');
    const proj = repo.createProject(db, { name: 'P' });
    const p = repo.createPrompt(db, { ...base, projectId: proj.id });
    repo.createPrompt(db, { ...base, title: 'Other', content: 'other' });
    expect(repo.getProject(db, proj.id)?.promptCount).toBe(1);
    expect(repo.listPrompts(db, { projectId: proj.id }).map((x) => x.id)).toEqual([p.id]);
    expect(repo.deleteProject(db, proj.id)).toBe(true);
    expect(repo.getPrompt(db, p.id)?.projectId).toBeNull();
  });
});
