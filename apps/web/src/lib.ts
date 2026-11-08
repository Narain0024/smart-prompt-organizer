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
