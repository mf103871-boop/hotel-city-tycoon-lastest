import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { include: ['src/core/**'], // The architecture document set 80 percent on the core. It was written
      // as 70 and never reconciled.
      thresholds: { lines: 80, functions: 80 } },
  },
  resolve: {
    alias: {
      '@core': path.resolve(import.meta.dirname, 'src/core'),
      '@data': path.resolve(import.meta.dirname, 'src/data'),
    },
  },
});
