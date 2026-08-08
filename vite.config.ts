import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * SIMWORLD_SINGLE_FILE=1 builds one flat JS chunk (dynamic imports inlined) so
 * tools/bundle-single-file.mjs can fold the whole app into a single HTML file.
 */
const singleFile = process.env.SIMWORLD_SINGLE_FILE === '1';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // every sprite is well under this, so a production build inlines them all
    // as data URIs; that is what makes the single-file build possible
    assetsInlineLimit: 200000,
    modulePreload: singleFile ? false : undefined,
    rollupOptions: singleFile
      ? { output: { inlineDynamicImports: true, entryFileNames: 'app.js' } }
      : undefined,
  },
  server: { host: true, port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // multi-day soak runs simulate tens of thousands of ticks
    testTimeout: 120000,
  },
});
