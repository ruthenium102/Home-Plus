import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Pure-logic unit tests run in a Node environment. The `@` alias mirrors
// vite.config.ts / tsconfig.json so test imports resolve the same way.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
