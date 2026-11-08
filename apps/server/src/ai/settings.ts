import { AiSettings, DEFAULT_AI_SETTINGS } from '@ppo/shared';
import type { DB } from '../db.js';

export function getAiSettings(db: DB): AiSettings {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'ai'").get() as { value: string } | undefined;
  let stored: unknown = {};
  try { stored = row ? JSON.parse(row.value) : {}; } catch { /* fall back to defaults */ }
  const r = AiSettings.safeParse({ ...DEFAULT_AI_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) });
  return r.success ? r.data : DEFAULT_AI_SETTINGS;
}

export function saveAiSettings(db: DB, patch: Partial<AiSettings>): AiSettings {
  const merged = AiSettings.parse({ ...getAiSettings(db), ...patch });
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(merged));
  return merged;
}
