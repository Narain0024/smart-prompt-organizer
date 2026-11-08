export const CATEGORIES = [
  'AI Application Development', 'Android Development', 'Web Development', 'UI/UX Design',
  'Robotics and Electronics', 'Arduino and ESP32', 'AI Engineering', 'Prompt Engineering',
  'Image Generation', 'Data Analytics', 'Research and Learning', 'Professional Writing',
  'Automation', 'Personal Projects',
];
export const PLATFORMS = ['Claude', 'ChatGPT', 'Gemini', 'Midjourney', 'Other'];

export function titleFromContent(content: string): string {
  const line = content.split('\n').map((s) => s.trim()).find(Boolean) ?? 'Untitled';
  return line.length > 60 ? line.slice(0, 57) + '…' : line;
}
export const parseTags = (s: string): string[] => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))];
export const emptyToNull = (s: string): string | null => (s.trim() ? s.trim() : null);

export function timeAgo(iso: string, now = Date.now()): string {
  const sec = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, s] of steps) if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit);
  return 'just now';
}

export interface DiffRow { left: string | null; right: string | null; changed: boolean }

/** Line diff (longest common subsequence) laid out for a two-column view; adjacent removals and additions share a row. */
export function sideBySide(a: string, b: string): DiffRow[] {
  const x = a.split('\n'), y = b.split('\n');
  const n = x.length, m = y.length;
  const rows: DiffRow[] = [];
  const del: string[] = [], add: string[] = [];
  const flush = () => {
    for (let k = 0; k < Math.max(del.length, add.length); k++) rows.push({ left: del[k] ?? null, right: add[k] ?? null, changed: true });
    del.length = 0; add.length = 0;
  };
  if (n * m > 4_000_000) { // too large for an exact diff: compare line by line
    for (let k = 0; k < Math.max(n, m); k++) rows.push({ left: x[k] ?? null, right: y[k] ?? null, changed: x[k] !== y[k] });
    return rows;
  }
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { flush(); rows.push({ left: x[i], right: y[j], changed: false }); i++; j++; }
    else if (j >= m || (i < n && t[i + 1][j] >= t[i][j + 1])) { del.push(x[i]); i++; }
    else { add.push(y[j]); j++; }
  }
  flush();
  return rows;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
