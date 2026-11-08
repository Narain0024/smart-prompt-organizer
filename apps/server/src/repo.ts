import { randomUUID } from 'node:crypto';
import type { Prompt, PromptInput, PromptUpdate, PromptVersion } from '@ppo/shared';
import type { DB } from './db.js';

const now = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
function hydrate(db: DB, r: any): Prompt {
  const tags = db
    .prepare('SELECT t.name FROM tags t JOIN prompt_tags pt ON pt.tag_id = t.id WHERE pt.prompt_id = ? ORDER BY t.name')
    .all(r.id)
    .map((x: any) => x.name as string);
  return {
    id: r.id, title: r.title, content: r.content, description: r.description,
    category: r.category, platform: r.platform, notes: r.notes, projectId: r.project_id,
    tags, isFavorite: !!r.is_favorite, isPinned: !!r.is_pinned, archived: !!r.archived,
    version: r.current_version, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function setTags(db: DB, promptId: string, tags: string[]) {
  db.prepare('DELETE FROM prompt_tags WHERE prompt_id = ?').run(promptId);
  const seen = new Set<string>();
  for (const raw of tags) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(name);
    const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number };
    db.prepare('INSERT OR IGNORE INTO prompt_tags(prompt_id, tag_id) VALUES (?, ?)').run(promptId, tag.id);
  }
}

export function createPrompt(db: DB, input: PromptInput): Prompt {
  return db.transaction(() => {
    const id = randomUUID();
    const ts = now();
    db.prepare(
      `INSERT INTO prompts (id, title, content, description, category, platform, notes, project_id,
        is_favorite, is_pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.title, input.content, input.description ?? null, input.category ?? null,
      input.platform ?? null, input.notes ?? null, input.projectId ?? null,
      input.isFavorite ? 1 : 0, input.isPinned ? 1 : 0, ts, ts);
    setTags(db, id, input.tags);
    db.prepare('INSERT INTO prompt_versions VALUES (?, 1, ?, ?, ?, ?)').run(id, input.title, input.content, 'Original', ts);
    return getPrompt(db, id)!;
  })();
}

export function getPrompt(db: DB, id: string): Prompt | null {
  const r = db.prepare('SELECT * FROM prompts WHERE id = ? AND deleted_at IS NULL').get(id);
  return r ? hydrate(db, r) : null;
}

export function updatePrompt(db: DB, id: string, patch: PromptUpdate): Prompt | null {
  return db.transaction(() => {
    const cur = db.prepare('SELECT * FROM prompts WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!cur) return null;
    const pick = <T>(v: T | undefined, old: T) => (v !== undefined ? v : old);
    const title = pick(patch.title, cur.title);
    const content = pick(patch.content, cur.content);
    const ts = now();
    let version = cur.current_version as number;
    if (title !== cur.title || content !== cur.content) {
      version += 1;
      db.prepare('INSERT INTO prompt_versions VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, version, title, content, patch.changeReason ?? 'Edited', ts);
    }
    db.prepare(
      `UPDATE prompts SET title=?, content=?, description=?, category=?, platform=?, notes=?, project_id=?,
        is_favorite=?, is_pinned=?, archived=?, current_version=?, updated_at=? WHERE id=?`,
    ).run(title, content, pick(patch.description, cur.description), pick(patch.category, cur.category),
      pick(patch.platform, cur.platform), pick(patch.notes, cur.notes), pick(patch.projectId, cur.project_id),
      pick(patch.isFavorite, !!cur.is_favorite) ? 1 : 0, pick(patch.isPinned, !!cur.is_pinned) ? 1 : 0,
      pick(patch.archived, !!cur.archived) ? 1 : 0, version, ts, id);
    if (patch.tags) setTags(db, id, patch.tags);
    return getPrompt(db, id);
  })();
}

export function softDeletePrompt(db: DB, id: string): boolean {
  return db.prepare('UPDATE prompts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now(), id).changes > 0;
}

export interface ListOptions { category?: string; favorite?: boolean; archived?: boolean; limit?: number; offset?: number }

export function listPrompts(db: DB, o: ListOptions = {}): Prompt[] {
  const where = ['deleted_at IS NULL', 'archived = ?'];
  const args: unknown[] = [o.archived ? 1 : 0];
  if (o.category) { where.push('category = ?'); args.push(o.category); }
  if (o.favorite) where.push('is_favorite = 1');
  args.push(Math.min(o.limit ?? 50, 200), o.offset ?? 0);
  const rows = db.prepare(
    `SELECT * FROM prompts WHERE ${where.join(' AND ')} ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?`,
  ).all(...args);
  return rows.map((r) => hydrate(db, r));
}

export function listVersions(db: DB, id: string): PromptVersion[] {
  return db.prepare('SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC').all(id).map((r: any) => ({
    version: r.version, title: r.title, content: r.content, changeReason: r.change_reason, createdAt: r.created_at,
  }));
}

export function restoreVersion(db: DB, id: string, version: number): Prompt | null {
  const v = db.prepare('SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?').get(id, version) as any;
  if (!v) return null;
  return updatePrompt(db, id, { title: v.title, content: v.content, changeReason: `Restored from v${version}` });
}

type Filters = Pick<ListOptions, 'category' | 'favorite' | 'archived'>;

function filterSql(o: Filters, alias = ''): { sql: string; args: unknown[] } {
  const a = alias ? `${alias}.` : '';
  const sql = [`${a}deleted_at IS NULL`, `${a}archived = ?`];
  const args: unknown[] = [o.archived ? 1 : 0];
  if (o.category) { sql.push(`${a}category = ?`); args.push(o.category); }
  if (o.favorite) sql.push(`${a}is_favorite = 1`);
  return { sql: sql.join(' AND '), args };
}

export function countPrompts(db: DB, o: Filters = {}): number {
  const f = filterSql(o);
  return (db.prepare(`SELECT COUNT(*) AS n FROM prompts WHERE ${f.sql}`).get(...f.args) as { n: number }).n;
}

/** Keyword search (BM25). Tokens are quoted so user input can never break FTS syntax. */
export function searchPrompts(db: DB, q: string, limit = 25, o: Filters = {}): Prompt[] {
  const tokens = q.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (!tokens.length) return [];
  const match = tokens.map((t) => `"${t}"*`).join(' ');
  const f = filterSql(o, 'p');
  const rows = db.prepare(
    `SELECT p.* FROM prompts_fts JOIN prompts p ON p.seq = prompts_fts.rowid
     WHERE prompts_fts MATCH ? AND ${f.sql}
     ORDER BY bm25(prompts_fts) LIMIT ?`,
  ).all(match, ...f.args, Math.min(limit, 100));
  return rows.map((r) => hydrate(db, r));
}
