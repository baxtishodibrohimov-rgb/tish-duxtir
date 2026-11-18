import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(rootDir, 'src') } },
  // Ishlab chiqishda API so'rovlari backend'ga uzatiladi.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
});
