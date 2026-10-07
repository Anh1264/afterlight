import { defineConfig } from 'vitest/config';

// Standalone on purpose: vite.config.ts sets root: 'client', which must not leak into tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'client/src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.claude/**'],
  },
});
