/** Pure helpers for the AI features (no React, no network), so they are easy to test. */

export const VERY_SIMILAR = 0.93; // keep in sync with the "very similar" wording in RelatedModal
export const pct = (score: number): number => Math.max(0, Math.min(100, Math.round(score * 100)));

export interface IndexStep { indexed: number; remaining: number }

/**
 * Calls `step` until nothing remains. Stops early if a step makes no progress (so a failing model can never cause
 * an endless loop) or when `shouldStop` says so.
 */
export async function runIndexLoop(
  step: () => Promise<IndexStep>,
  onProgress?: (done: number, remaining: number) => void,
  shouldStop: () => boolean = () => false,
): Promise<{ indexed: number; stuck: boolean }> {
  let indexed = 0;
  for (;;) {
    const r = await step();
    indexed += r.indexed;
    onProgress?.(indexed, r.remaining);
    if (r.remaining === 0) return { indexed, stuck: false };
    if (r.indexed === 0) return { indexed, stuck: true };
    if (shouldStop()) return { indexed, stuck: false };
  }
}
