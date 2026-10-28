import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string;

export default defineConfig({
  base: './',
  // The site root is the splash screen; the app itself lives at app/.
  build: { rollupOptions: { input: { landing: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app/index.html') } } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The app page sits in app/, but sw.js and the manifest are at the site root: register
      // "../sw.js" with the root as scope so the landing page is cached for offline launches too.
      buildBase: '../',
      scope: '../',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Felt — Home Game Tracker',
        short_name: 'Felt',
        description: 'Offline Texas Hold\'em home game tracker',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0F12',
        theme_color: '#0A0F12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: 'app/index.html',
        navigateFallbackAllowlist: [/\/app\//],
      },
    }),
    // Splash page: stamp the version, and fix the manifest link, which the PWA plugin writes with
    // buildBase ("../") because that is right for app/.
    {
      name: 'felt-splash',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html: string, ctx: { path: string }) =>
          ctx.path.includes('/app/') ? html : html.replace('__FELT_VERSION__', version).replace('href="../manifest.webmanifest"', 'href="./manifest.webmanifest"'),
      },
    },
  ],
  test: { environment: 'node' },
} as any);
