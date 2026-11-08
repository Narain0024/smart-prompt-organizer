import { describe, expect, it } from 'vitest';
import { emptyToNull, parseTags, timeAgo, titleFromContent } from './lib';

describe('lib', () => {
  it('derives a title from the first non-empty line, truncated', () => {
    expect(titleFromContent('\n\n  Build an app  \nmore')).toBe('Build an app');
    expect(titleFromContent('x'.repeat(100))).toHaveLength(58);
    expect(titleFromContent('   ')).toBe('Untitled');
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
});
