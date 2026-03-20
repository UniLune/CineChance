import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/lib/__tests__/**/*.test.ts',
      'src/lib/taste-map/__tests__/**/*.test.ts',
      'src/app/components/__tests__/**/*.test.{ts,tsx}',
      'src/app/api/**/__tests__/**/*.test.ts',
      'src/app/admin/**/__tests__/**/*.test.{ts,tsx}',
      '.planning/phases/*/tdd/*.test.{ts,tsx}'
    ],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      }
    }
  }
});
