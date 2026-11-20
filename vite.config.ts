import { defineConfig } from 'vite';
// Static build: one JS bundle + CSS in build/, relative paths so it runs from the artifact host,
// itch.io, or any folder. Workers stay separate files.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'build', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 0, sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { entryFileNames: 'assets/omnivigil.js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]', inlineDynamicImports: true } }
  },
  worker: { format: 'es' }
});
