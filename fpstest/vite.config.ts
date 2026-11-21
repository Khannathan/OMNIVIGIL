import { defineConfig } from 'vite';
// FPS TEST builds to ONE self-contained HTML file (fpstest/build/fps-test.html) via tools/inline.mjs.
export default defineConfig({
  root: __dirname, base: './', publicDir: false,
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'build/vite', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 100000000, sourcemap: false, chunkSizeWarningLimit: 8000,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } } },
});
