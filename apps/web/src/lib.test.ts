import { describe, expect, it } from 'vitest';
import { emptyToNull, parseTags, sideBySide, timeAgo, titleFromContent } from './lib';

describe('lib', () => {
  it('derives a title from the first non-empty line, truncated', () => {
    expect(titleFromContent('\n\n  Build an app  \nmore')).toBe('Build an app');
    expect(titleFromContent('x'.repeat(100))).toHaveLength(58);
    expect(titleFromContent('   ')).toBe('Untitled');
  });
  it('drops markdown heading and emphasis markers from derived titles', () => {
    expect(titleFromContent('# Prompt: Do the thing\nbody')).toBe('Prompt: Do the thing');
    expect(titleFromContent('### **Bold title**')).toBe('Bold title');
    expect(titleFromContent('#hashtag stays')).toBe('#hashtag stays');
  });
  it('parses comma-separated tags, trimming and de-duplicating', () => {
    expect(parseTags(' a, b ,a,, c')).toEqual(['a', 'b', 'c']);
    expect(parseTags('')).toEqual([]);
  });
  it('turns blank strings into null', () => {
    expect(emptyToNull('  ')).toBeNull();
    expect(emptyToNull(' x ')).toBe('x');
  });
  it('formats relative time', () => {
    const now = Date.now();
    expect(timeAgo(new Date(now - 30_000).toISOString(), now)).toBe('just now');
    expect(timeAgo(new Date(now - 3 * 3600_000).toISOString(), now)).toContain('3');
  });
  it('diffs identical text as unchanged', () => {
    expect(sideBySide('a\nb', 'a\nb').every((r) => !r.changed)).toBe(true);
  });
  it('pairs a changed line and keeps the context around it', () => {
    expect(sideBySide('a\nb\nc', 'a\nB\nc')).toEqual([
      { left: 'a', right: 'a', changed: false }, { left: 'b', right: 'B', changed: true }, { left: 'c', right: 'c', changed: false },
    ]);
  });
  it('shows removals and additions as one-sided rows', () => {
    expect(sideBySide('a\nb', 'a')).toEqual([{ left: 'a', right: 'a', changed: false }, { left: 'b', right: null, changed: true }]);
    expect(sideBySide('a', 'a\nb')[1]).toEqual({ left: null, right: 'b', changed: true });
  });
});
