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
    // Every sprite is well under 200 kB, so a production build inlines them
    // all as data URIs; that is what makes the single-file build possible.
    //
    // Audio (docs/design-phase15-audio.md 段階 S-2) breaks that assumption:
    // effects are a few kB but a BGM loop is 1-2 MB, and an asset over the
    // limit is emitted as a separate file - which the single-file build would
    // then reference over the network, quietly ending "zero external
    // requests". So the single-file build raises the ceiling past any
    // plausible track, and the ordinary build keeps 200 kB, where a big track
    // *should* stay a separate cacheable file. bundle-single-file.mjs asserts
    // the result rather than trusting this number.
    assetsInlineLimit: singleFile ? 12_000_000 : 200000,
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
