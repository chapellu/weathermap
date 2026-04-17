import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      '#mocks': resolve(import.meta.dirname, '__mocks__'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/types/**',
        'src/db/client.ts',
        'src/lib/env.ts',
        'src/routes/auth.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 77,
        functions: 78,
        branches: 65,
      },
    },
  },
});
