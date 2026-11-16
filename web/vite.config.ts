import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Ishlab chiqishda API so'rovlari backend'ga uzatiladi.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
});
