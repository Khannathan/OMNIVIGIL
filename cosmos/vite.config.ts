import { defineConfig } from 'vite';
// The Cosmos explorer builds to ONE self-contained HTML file (cosmos/build/omnivigil-cosmos.html)
// via tools/inline.mjs, so it can be published as an artifact or zipped for itch.io.
export default defineConfig({
  root: __dirname, base: './', publicDir: false,
  build: { outDir: 'build/vite', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 100000000, sourcemap: false, chunkSizeWarningLimit: 8000,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } } },
});
