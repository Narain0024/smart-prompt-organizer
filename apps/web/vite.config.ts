import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only talks to this dev server; /api is forwarded to the local backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true } } },
});
