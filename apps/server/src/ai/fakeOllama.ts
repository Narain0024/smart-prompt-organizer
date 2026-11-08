import { createServer } from 'node:http';

export interface FakeOllama { url: string; calls: { path: string; body: any }[]; close(): Promise<void> }

const DIM = 256;
/** Bag-of-words embedding: texts that share words get similar vectors, which is all the tests need. */
export function fakeVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 7;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) % DIM;
    v[h] += 1;
  }
  return v;
}

export async function startFakeOllama(opts: { models?: string[]; chat?: (body: any) => string; hang?: boolean } = {}): Promise<FakeOllama> {
  const calls: FakeOllama['calls'] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (opts.hang) return; // never answer
      const path = req.url ?? '';
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({ path, body });
      const send = (status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (body?.model === 'missing') return send(404, { error: "model 'missing' not found" });
      if (path === '/api/tags') return send(200, { models: (opts.models ?? ['llama3.2:latest', 'fake-embed:latest']).map((name) => ({ name })) });
      if (path === '/api/chat') return send(200, { message: { role: 'assistant', content: opts.chat ? opts.chat(body) : '{}' } });
      if (path === '/api/embed') {
        const input: string[] = Array.isArray(body.input) ? body.input : [body.input];
        return send(200, { embeddings: input.map(fakeVector) });
      }
      send(404, { error: 'not found' });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`, calls,
    close: () => new Promise<void>((r) => { (server as any).closeAllConnections?.(); server.close(() => r()); }),
  };
}
