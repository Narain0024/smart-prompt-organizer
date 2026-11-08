import { createHash } from 'node:crypto';
import type { ImportBody, ImportItemResult, ImportResult, ImportStatus } from '@ppo/shared';
import type { DB } from './db.js';
import { parseFile, type ProjectDef } from './importers.js';
import { getOrCreateProjectByName, insertImported, type ImportPrompt } from './repo.js';

const hash = (s: string) => createHash('sha256').update(s.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');

/**
 * Preview (commit=false) writes nothing. Commit runs in one transaction, so a failure leaves the library untouched.
 * Duplicates are exact matches after ignoring case and whitespace; similar-but-not-identical prompts come with embeddings (Stage 4).
 */
export function runImport(db: DB, req: ImportBody): ImportResult {
  const existing = new Map<string, { id: string; title: string }>();
  for (const r of db.prepare('SELECT id, title, content FROM prompts WHERE deleted_at IS NULL').all() as { id: string; title: string; content: string }[]) {
    const h = hash(r.content);
    if (!existing.has(h)) existing.set(h, { id: r.id, title: r.title });
  }
  const seen = new Set<string>();
  const items: ImportItemResult[] = [];
  const toInsert: ImportPrompt[] = [];
  const projects: ProjectDef[] = [];

  for (const f of req.files) {
    const parsed = parseFile(f.name, f.text);
    projects.push(...parsed.projects);
    for (const p of parsed.items) {
      if (!p.input) { items.push({ file: p.file, title: p.file, status: 'invalid', error: p.error }); continue; }
      const input: ImportPrompt = {
        ...p.input,
        category: p.input.category ?? req.category ?? null,
        tags: [...new Set([...p.input.tags, ...req.tags])],
      };
      const h = hash(input.content);
      let status: ImportStatus = 'new';
      let duplicateOf: { id: string; title: string } | undefined;
      if (existing.has(h)) { status = 'duplicate'; duplicateOf = existing.get(h); }
      else if (seen.has(h)) status = 'duplicate_in_batch';
      seen.add(h);
      items.push({ file: p.file, title: input.title, status, duplicateOf });
      if (status === 'new' || req.onDuplicate === 'import') toInsert.push(input);
    }
  }

  let imported: number | null = null;
  if (req.commit) {
    db.transaction(() => {
      for (const p of projects) getOrCreateProjectByName(db, p.name, p);
      for (const it of toInsert) insertImported(db, it);
    })();
    imported = toInsert.length;
  }
  return {
    items,
    summary: {
      new: items.filter((i) => i.status === 'new').length,
      duplicates: items.filter((i) => i.status === 'duplicate' || i.status === 'duplicate_in_batch').length,
      invalid: items.filter((i) => i.status === 'invalid').length,
    },
    toImport: toInsert.length,
    imported,
  };
}
