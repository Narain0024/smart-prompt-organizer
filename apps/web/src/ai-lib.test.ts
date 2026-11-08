import { describe, expect, it } from 'vitest';
import { pct, runIndexLoop } from './ai-lib';

describe('runIndexLoop', () => {
  it('runs until nothing remains and reports progress', async () => {
    const steps = [{ indexed: 16, remaining: 20 }, { indexed: 16, remaining: 4 }, { indexed: 4, remaining: 0 }];
    const seen: [number, number][] = [];
    const r = await runIndexLoop(async () => steps.shift()!, (d, rem) => seen.push([d, rem]));
    expect(r).toEqual({ indexed: 36, stuck: false });
    expect(seen).toEqual([[16, 20], [32, 4], [36, 0]]);
  });
  it('stops when a step makes no progress instead of looping forever', async () => {
    let calls = 0;
    const r = await runIndexLoop(async () => { calls++; return { indexed: 0, remaining: 5 }; });
    expect(r).toEqual({ indexed: 0, stuck: true });
    expect(calls).toBe(1);
  });
  it('can be cancelled between batches', async () => {
    let calls = 0;
    const r = await runIndexLoop(async () => { calls++; return { indexed: 8, remaining: 100 }; }, undefined, () => calls >= 2);
    expect(r.indexed).toBe(16);
    expect(r.stuck).toBe(false);
  });
  it('lets errors from a step reach the caller', async () => {
    await expect(runIndexLoop(async () => { throw new Error('boom'); })).rejects.toMatchObject({ message: 'boom' });
  });
});

describe('pct', () => {
  it('rounds and clamps similarity scores', () => {
    expect(pct(0.624)).toBe(62);
    expect(pct(1.2)).toBe(100);
    expect(pct(-0.3)).toBe(0);
  });
});
