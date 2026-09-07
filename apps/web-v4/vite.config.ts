import { fileURLToPath } from 'node:url';

import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * DEUX runtimes, UN code source.
 *
 * `MEESHY_RUNTIME=react` construit avec React 19 ; par defaut on construit avec
 * Preact via `preact/compat`. Le code applicatif est IDENTIQUE dans les deux
 * cas — c'est tout l'interet de compat, et c'est ce qui rend la comparaison de
 * poids honnete : le meme arbre, le meme Tailwind, le meme routeur, seul le
 * runtime change. Le POC mesure les deux (scripts/mesure-poids.mjs).
 */
const runtime = process.env.MEESHY_RUNTIME === 'react' ? 'react' : 'preact';

/**
 * Forme TABLEAU avec motifs ancres, et non objet.
 *
 * Un alias objet fait un remplacement de PREFIXE : la cle `react` capture aussi
 * `react/jsx-runtime`, qui devient alors `<chemin du shim>/jsx-runtime` — une
 * erreur « Not a directory » a la construction. Les motifs `^...$` ci-dessous
 * n'attrapent que le specificateur exact.
 */
const aliasPreact = [
  // `react` pointe le SHIM, pas compat directement : voir src/lib/react-shim.js
  // (TanStack Router lit `React.use`, que compat n'expose pas).
  { find: /^react$/, replacement: fileURLToPath(new URL('./src/lib/react-shim.js', import.meta.url)) },
  { find: /^react-dom$/, replacement: 'preact/compat' },
  { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
  { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
  { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
];

/**
 * VARIANTE B (Capacitor) : la coque native charge le bundle depuis le systeme
 * de fichiers, jamais depuis une origine http. Les chemins absolus casseraient
 * — d'ou la base relative. `MEESHY_CIBLE=capacitor` bascule la construction.
 */
const pourCapacitor = process.env.MEESHY_CIBLE === 'capacitor';

export default defineConfig({
  base: pourCapacitor ? './' : '/',
  resolve: {
    alias: [
      ...(runtime === 'preact' ? aliasPreact : []),
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  plugins: [
    tailwind(),
    /**
     * VARIANTE A (PWA). Desactivee sous Capacitor : la coque native gere
     * elle-meme son cycle de vie, et un service worker par-dessus ferait deux
     * caches concurrents sur le meme bundle.
     */
    ...(pourCapacitor
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'Meeshy',
              short_name: 'Meeshy',
              description: 'Messagerie multilingue temps reel',
              lang: 'fr',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#0b0c14',
              theme_color: '#0b0c14',
              icons: [
                { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: '/icone-512-masque.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,woff2}'],
              /**
               * La zone rurale est la raison d'etre de ce cache : le shell est
               * precache une fois, puis JAMAIS retelecharge tant que son hash
               * ne change pas. Les reponses d'API vont en NetworkFirst avec un
               * repli sur le cache — lecture possible hors ligne (principe
               * « Offline Graceful Degradation »).
               */
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'api',
                    networkTimeoutSeconds: 3,
                    expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                  },
                },
                {
                  urlPattern: ({ request }) => request.destination === 'image',
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'medias',
                    expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  },
                },
              ],
            },
          }),
        ]),
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        /**
         * Le socle et les ecrans sont separes pour que le gate DESIGNE un
         * coupable quand un poids monte (§ 8.4 de la conception v3), et pour
         * qu'un ecran neuf ne renchérisse pas la premiere peinture.
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@tanstack/react-query')) return 'donnees';
            return 'socle';
          }
          return undefined;
        },
      },
    },
  },
});
