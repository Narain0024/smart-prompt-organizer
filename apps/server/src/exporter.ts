import type { DB } from './db.js';
import * as repo from './repo.js';

/** Full-fidelity backup: every prompt (archived included) with its whole version history, plus collections. */
export function buildBackup(db: DB) {
  const projects = repo.listProjects(db);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  return {
    app: 'smart-prompt-organizer', formatVersion: 1, exportedAt: new Date().toISOString(),
    projects: projects.map(({ name, description, notes }) => ({ name, description, notes })),
    prompts: repo.listAllPrompts(db).map((p) => ({
      title: p.title, content: p.content, description: p.description, category: p.category, platform: p.platform,
      notes: p.notes, tags: p.tags, isFavorite: p.isFavorite, isPinned: p.isPinned, archived: p.archived,
      project: p.projectId ? names.get(p.projectId) ?? null : null, createdAt: p.createdAt, updatedAt: p.updatedAt,
      versions: repo.listVersions(db, p.id).reverse().map((v) => ({
        title: v.title, content: v.content, changeReason: v.changeReason, createdAt: v.createdAt,
      })),
    })),
  };
}

// Cells starting with = + - @ are prefixed with ' so spreadsheets never run them as formulas. CSV is export-only.
const esc = (v: unknown): string => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function buildCsv(db: DB): string {
  const b = buildBackup(db);
  const head = ['title', 'content', 'description', 'category', 'platform', 'tags', 'collection', 'favorite', 'pinned', 'archived', 'versions', 'created_at', 'updated_at'];
  const rows = b.prompts.map((p) => [p.title, p.content, p.description, p.category, p.platform, p.tags.join('; '), p.project,
    p.isFavorite, p.isPinned, p.archived, p.versions.length, p.createdAt, p.updatedAt].map(esc).join(','));
  return '\uFEFF' + [head.join(','), ...rows].join('\r\n') + '\r\n'; // BOM so Excel on Windows reads UTF-8
}
