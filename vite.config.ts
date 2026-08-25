import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Served from https://<user>.github.io/football-app/ - an absolute base keeps the
  // service worker scope, manifest and start_url pointing at the right place.
  const base = loadEnv(mode, '.', 'VITE_').VITE_BASE || '/football-app/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Matchday — Football Tracker',
          short_name: 'Matchday',
          description: 'Track your matches, results and position-specific stats on a calendar.',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0b1220',
          theme_color: '#0b1220',
          categories: ['sports', 'health', 'productivity'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Everything is precached, so the app opens with no signal at all - which is
          // the normal state at a pitch.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The AI SDKs need the network to be any use, so precaching them for
        // offline would be ~600KB of dead weight. They load on demand instead.
        globIgnores: ['**/gemini-*.js', '**/claude-*.js'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
  ],
    server: { host: true, port: 5173 },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
