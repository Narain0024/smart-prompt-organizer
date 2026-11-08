import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { SecretStore } from './secrets.js';

const dataDir = process.env.PPO_DATA_DIR ?? join(homedir(), '.smart-prompt-organizer');
const port = Number(process.env.PPO_PORT ?? 4317);
mkdirSync(dataDir, { recursive: true });

const token = randomBytes(24).toString('hex'); // new per launch; the web app receives it from the launch URL
const app = buildApp({
  db: openDb(join(dataDir, 'prompts.db')),
  secrets: new SecretStore(dataDir),
  token,
  allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
});

await app.listen({ host: '127.0.0.1', port });
console.log(`Smart Prompt Organizer API on http://127.0.0.1:${port}`);
console.log(`Data directory: ${dataDir}`);
console.log(`Session token (send as x-session-token): ${token}`);
