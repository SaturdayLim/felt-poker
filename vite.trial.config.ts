/* Bundles the trial report page on its own (no PWA), with fonts and images inlined, so
   scripts/trial-build.ts can fold it into one shareable HTML file. Output: trial/dist (git-ignored). */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'scripts'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'trial/dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { input: resolve(__dirname, 'scripts/trial-report.html'), output: { inlineDynamicImports: true } },
  },
});
