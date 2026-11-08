import { describe, expect, it } from 'vitest';
import { parseFile } from './importers.js';

describe('parseFile', () => {
  it('takes a markdown title from the first heading', () => {
    expect(parseFile('x.md', '# Plan\n\nDo the thing').items[0].input).toMatchObject({ title: 'Plan', content: 'Do the thing' });
  });
  it('keeps the whole text when markdown has only a heading', () => {
    expect(parseFile('x.md', '# Only').items[0].input).toMatchObject({ title: 'Only', content: '# Only' });
  });
  it('uses the filename as title for txt and strips a BOM', () => {
    expect(parseFile('notes.txt', '\uFEFFhello').items[0].input).toMatchObject({ title: 'notes', content: 'hello' });
  });
  it('reads a json array and a {prompts} object', () => {
    expect(parseFile('a.json', '[{"content":"one"}]').items[0].input).toMatchObject({ title: 'one', tags: [] });
    expect(parseFile('b.json', '{"prompts":[{"title":"T","content":"two"}]}').items[0].input?.title).toBe('T');
  });
  it('reports bad input instead of throwing', () => {
    expect(parseFile('a.json', '{nope').items[0].error).toMatch(/valid JSON/);
    expect(parseFile('a.json', '{"x":1}').items[0].error).toMatch(/array/);
    expect(parseFile('a.pdf', 'x').items[0].error).toMatch(/Unsupported/);
    expect(parseFile('e.txt', '   ').items[0].error).toMatch(/empty/);
    expect(parseFile('a.json', '[{"title":"no content"}]').items[0].error).toMatch(/content/);
  });
  it('collects collection definitions from a backup', () => {
    const r = parseFile('a.json', '{"projects":[{"name":"P","notes":"n"}],"prompts":[]}');
    expect(r.projects).toEqual([{ name: 'P', notes: 'n' }]);
  });
});
