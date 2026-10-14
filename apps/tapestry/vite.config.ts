import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'tapestry', short_name: 'tapestry', description: 'Find, gather and listen to the passages you need.',
        theme_color: '#6b1e3f', background_color: '#160d13', display: 'standalone', start_url: '/',
        icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,mjs}'], navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
});
