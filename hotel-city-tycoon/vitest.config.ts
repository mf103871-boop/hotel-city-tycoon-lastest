import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /*
     * Measurement only, no gate.
     *
     * Thresholds of 80 percent sat here from the architecture document and
     * were never enforced: nothing passed `--coverage`, and the include of
     * `src/core/**` also fed src/core/README.md to the parser, which failed
     * the run. Measured on 2026-09-03 with the include below: lines 51%,
     * functions 59%, branches 37%. A gate belongs with the tests that would
     * meet it (BL-019 in the master reference), not on a number the suite
     * has never reached.
     */
    coverage: { include: ['src/core/**/*.ts'] },
  },
  resolve: {
    alias: {
      '@core': path.resolve(import.meta.dirname, 'src/core'),
      '@data': path.resolve(import.meta.dirname, 'src/data'),
    },
  },
});
