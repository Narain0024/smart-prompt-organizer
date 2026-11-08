import { z } from 'zod';
import type { ImportPrompt } from './repo.js';

export interface ParsedItem { file: string; input?: ImportPrompt; error?: string }
export interface ProjectDef { name: string; description?: string | null; notes?: string | null }
export interface ParsedFile { items: ParsedItem[]; projects: ProjectDef[] }

const short = (max: number) => z.string().trim().max(max);
const Version = z.object({
  title: z.string().max(200), content: z.string().max(200_000),
  changeReason: z.string().max(500).nullish(), createdAt: z.string().optional(),
});
const Item = z.object({
  title: short(200).optional(), content: z.string().min(1).max(200_000),
  description: short(1000).nullish(), category: short(100).nullish(), platform: short(100).nullish(),
  notes: z.string().max(20_000).nullish(), tags: z.array(short(50).min(1)).max(50).default([]),
  isFavorite: z.boolean().default(false), isPinned: z.boolean().default(false), archived: z.boolean().default(false),
  project: short(120).nullish(), createdAt: z.string().optional(), updatedAt: z.string().optional(),
  versions: z.array(Version).max(500).optional(),
});
const Project = z.object({ name: short(120).min(1), description: short(1000).nullish(), notes: z.string().max(20_000).nullish() });

export function titleFromContent(content: string): string {
  const line = content.split('\n').map((s) => s.trim()).find(Boolean) ?? 'Untitled';
  return line.length > 60 ? line.slice(0, 57) + '…' : line;
}

function simple(file: string, title: string, content: string): ParsedItem {
  const body = content.trim();
  if (!body) return { file, error: 'File is empty.' };
  if (body.length > 200_000) return { file, error: 'Prompt is longer than 200,000 characters.' };
  return { file, input: { title: (title.trim() || titleFromContent(body)).slice(0, 200), content: body, tags: [], isFavorite: false, isPinned: false } };
}

function parseJson(file: string, text: string): ParsedFile {
  let data: any;
  try { data = JSON.parse(text); } catch { return { items: [{ file, error: 'Not valid JSON.' }], projects: [] }; }
  const list: unknown[] | null = Array.isArray(data) ? data : Array.isArray(data?.prompts) ? data.prompts : null;
  if (!list) return { items: [{ file, error: 'Expected a JSON array, or an object with a "prompts" array.' }], projects: [] };
  const items = list.map((raw, i): ParsedItem => {
    const name = `${file} #${i + 1}`;
    const r = Item.safeParse(raw);
    if (!r.success) return { file: name, error: r.error.issues.map((x) => `${x.path.join('.') || 'item'}: ${x.message}`).join('; ') };
    return { file: name, input: { ...r.data, title: r.data.title || titleFromContent(r.data.content) } };
  });
  const projects: ProjectDef[] = [];
  if (Array.isArray(data?.projects)) for (const p of data.projects) { const r = Project.safeParse(p); if (r.success) projects.push(r.data); }
  return { items, projects };
}

export function parseFile(name: string, rawText: string): ParsedFile {
  const text = rawText.replace(/^\uFEFF/, '');
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const base = name.replace(/\.[^.]+$/, '');
  if (ext === 'json') return parseJson(name, text);
  if (ext === 'txt') return { items: [simple(name, base, text)], projects: [] };
  if (ext === 'md' || ext === 'markdown') {
    const lines = text.split(/\r?\n/);
    const first = lines.findIndex((l) => l.trim());
    const m = first >= 0 ? lines[first].match(/^#\s+(.+?)\s*#*\s*$/) : null;
    if (!m) return { items: [simple(name, base, text)], projects: [] };
    const rest = lines.slice(first + 1).join('\n').trim();
    return { items: [simple(name, m[1], rest || text)], projects: [] };
  }
  return { items: [{ file: name, error: `Unsupported file type ".${ext ?? ''}". Use .txt, .md or .json.` }], projects: [] };
}
