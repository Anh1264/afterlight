import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const env = (k: string) => (process.env[k] ?? '').trim();
const railwayDomain = env('RAILWAY_PUBLIC_DOMAIN');
const resolved = env('VITE_PUBLIC_ORIGIN') || (railwayDomain ? 'https://' + railwayDomain : '');
if (!resolved && env('RAILWAY_ENVIRONMENT_NAME')) {
  console.warn('WARNING: no public origin (set VITE_PUBLIC_ORIGIN or RAILWAY_PUBLIC_DOMAIN): og:image will point at localhost and link previews will be broken.');
}
const origin = (resolved || 'http://localhost:3001').replace(/\/+$/, '');

export default defineConfig({
  root: 'client',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_PUBLIC_ORIGIN': JSON.stringify(origin),
  },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
