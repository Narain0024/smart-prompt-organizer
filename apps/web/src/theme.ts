export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'ppo.theme';

export function getThemePref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch { /* ignore */ }
  return 'system';
}
export function applyThemePref(p: ThemePref) {
  const root = document.documentElement;
  if (p === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p);
  try { localStorage.setItem(KEY, p); } catch { /* ignore */ }
}
