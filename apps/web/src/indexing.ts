import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { runIndexLoop } from './ai-lib';

export const useAiStatus = () => useQuery({ queryKey: ['ai', 'status'], queryFn: api.aiStatus, staleTime: 15_000 });

export const indexAll = (onProgress?: (done: number, remaining: number) => void) =>
  runIndexLoop(() => api.aiIndexRun(16), onProgress);

/** After a save or import: bring the meaning-search index up to date, quietly, if the user turned that on. */
export async function autoIndex(qc: QueryClient): Promise<void> {
  try {
    const s = await qc.fetchQuery({ queryKey: ['ai', 'status'], queryFn: api.aiStatus, staleTime: 10_000 });
    if (!s.settings.enabled || !s.settings.autoIndex || !s.ollama.reachable || !s.embedModelInstalled) return;
    await indexAll();
  } catch {
    /* indexing is best-effort; the Library banner offers a manual update */
  } finally {
    qc.invalidateQueries({ queryKey: ['ai'] });
  }
}
