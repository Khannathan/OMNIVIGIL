import { defineConfig } from 'vite';
// OMNIVIGIL Zero builds to ONE self-contained HTML file (zero/build/omnivigil-zero.html) via tools/inline.mjs.
export default defineConfig({
  root: __dirname, base: './', publicDir: false,
  build: { outDir: 'build/vite', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 100000000, sourcemap: false, chunkSizeWarningLimit: 8000,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } } },
});
