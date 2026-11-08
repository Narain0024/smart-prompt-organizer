import { describe, expect, it } from 'vitest';
import { dot, fromBlob, normalize, rrf, toBlob } from './vectors.js';

describe('vectors', () => {
  it('normalises to unit length and round-trips through a blob', () => {
    const v = normalize([3, 4]);
    expect(dot(v, v)).toBeCloseTo(1, 5);
    expect(Array.from(fromBlob(toBlob(v)))).toEqual(Array.from(v));
  });
  it('survives a zero vector', () => {
    expect(Array.from(normalize([0, 0]))).toEqual([0, 0]);
  });
  it('gives cosine 1 for identical and 0 for orthogonal vectors', () => {
    expect(dot(normalize([1, 2]), normalize([2, 4]))).toBeCloseTo(1, 5);
    expect(dot(normalize([1, 0]), normalize([0, 1]))).toBeCloseTo(0, 5);
  });
});

describe('rrf', () => {
  it('ranks items found by both lists above items found by one', () => {
    expect(rrf([['a', 'b', 'c'], ['c', 'd']])[0]).toBe('c');
    expect(rrf([['a', 'b'], ['b', 'a']]).sort()).toEqual(['a', 'b']);
  });
  it('keeps every id exactly once', () => {
    expect(rrf([['a', 'b'], ['b', 'c']]).sort()).toEqual(['a', 'b', 'c']);
    expect(rrf([])).toEqual([]);
  });
});
