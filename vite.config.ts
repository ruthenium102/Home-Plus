import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __APP_VERSION__: JSON.stringify(version)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
