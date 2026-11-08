import Database from 'better-sqlite3';

export type DB = Database.Database;

// Append-only. Each entry runs once, in order, tracked by PRAGMA user_version.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE prompts (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL, content TEXT NOT NULL,
    description TEXT, category TEXT, platform TEXT, notes TEXT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0, is_pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0, current_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX idx_prompts_category ON prompts(category);
  CREATE INDEX idx_prompts_updated ON prompts(updated_at);
  CREATE TABLE prompt_versions (
    prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
    change_reason TEXT, created_at TEXT NOT NULL,
    PRIMARY KEY (prompt_id, version)
  );
  CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
  CREATE TABLE prompt_tags (
    prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (prompt_id, tag_id)
  );
  CREATE VIRTUAL TABLE prompts_fts USING fts5(
    title, content, description, content='prompts', content_rowid='seq'
  );
  CREATE TRIGGER prompts_ai AFTER INSERT ON prompts BEGIN
    INSERT INTO prompts_fts(rowid, title, content, description)
    VALUES (new.seq, new.title, new.content, new.description);
  END;
  CREATE TRIGGER prompts_ad AFTER DELETE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, description)
    VALUES ('delete', old.seq, old.title, old.content, old.description);
  END;
  CREATE TRIGGER prompts_au AFTER UPDATE OF title, content, description ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, title, content, description)
    VALUES ('delete', old.seq, old.title, old.content, old.description);
    INSERT INTO prompts_fts(rowid, title, content, description)
    VALUES (new.seq, new.title, new.content, new.description);
  END;
  `,
  `ALTER TABLE projects ADD COLUMN notes TEXT;`,
];

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return db;
}
