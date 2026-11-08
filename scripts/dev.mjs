// Starts the API and the web app together; Ctrl+C stops both (also on Windows).
import { spawn } from 'node:child_process';

const kids = [];
const run = (name, script) => {
  const p = spawn('npm', ['run', script], { stdio: 'inherit', shell: true });
  p.on('exit', (code) => { console.log(`[${name}] exited (${code})`); shutdown(); });
  kids.push(p);
};
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const k of kids) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(k.pid), '/T', '/F']);
    else k.kill();
  }
  setTimeout(() => process.exit(), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
run('server', 'dev:server');
run('web', 'dev:web');
console.log('Look for the "Open the app" URL printed by the server below.');
