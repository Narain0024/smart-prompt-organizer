import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

interface Entry { iv: string; tag: string; data: string }

/**
 * Encrypted-at-rest API key store (AES-256-GCM). The master key lives in a separate 0600 file.
 * This protects against accidental leaks (backups, DB export, logs); it does not protect against
 * malware running as your user. An OS-keychain implementation can replace this behind the same API.
 * Keys are write-only over HTTP: there is no route that returns a stored key.
 */
export class SecretStore {
  private file: string;
  private keyFile: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'secrets.enc.json');
    this.keyFile = join(dir, 'master.key');
  }
  private masterKey(): Buffer {
    if (!existsSync(this.keyFile)) {
      writeFileSync(this.keyFile, randomBytes(32), { mode: 0o600 });
      try { chmodSync(this.keyFile, 0o600); } catch { /* not supported on some platforms */ }
    }
    return readFileSync(this.keyFile);
  }
  private load(): Record<string, Entry> {
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {};
  }
  private save(all: Record<string, Entry>) {
    writeFileSync(this.file, JSON.stringify(all), { mode: 0o600 });
  }
  set(provider: string, value: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const data = Buffer.concat([c.update(value, 'utf8'), c.final()]);
    const all = this.load();
    all[provider] = { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
    this.save(all);
  }
  /** For server-side provider calls only. Never expose through a route. */
  get(provider: string): string | null {
    const e = this.load()[provider];
    if (!e) return null;
    const d = createDecipheriv('aes-256-gcm', this.masterKey(), Buffer.from(e.iv, 'base64'));
    d.setAuthTag(Buffer.from(e.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(e.data, 'base64')), d.final()]).toString('utf8');
  }
  has(provider: string): boolean { return provider in this.load(); }
  delete(provider: string) { const all = this.load(); delete all[provider]; this.save(all); }
}
