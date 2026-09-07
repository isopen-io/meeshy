import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import tailwind from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { INSTITUTIONAL_PATTERN } from './scripts/lib/institutional-routes.mjs';

/**
 * DEUX runtimes, UN code source.
 *
 * `MEESHY_RUNTIME=react` construit avec React 19 ; par defaut on construit avec
 * Preact via `preact/compat`. Le code applicatif est IDENTIQUE dans les deux
 * cas — c'est tout l'interet de compat, et c'est ce qui rend la comparaison de
 * poids honnete : le meme arbre, le meme Tailwind, le meme routeur, seul le
 * runtime change. Le POC mesure les deux (scripts/measure-weight.mjs).
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
const forCapacitor = process.env.MEESHY_TARGET === 'capacitor';

/**
 * LE BANC DE FIL LONG — une constante de CONSTRUCTION, jamais un paramètre d'URL.
 *
 * La virtualisation ne se prouve pas sur sept messages ; il en faut cinq cents.
 * Les fabriquer à la demande depuis l'application aurait fait entrer du code de
 * banc d'essai dans le bundle servi aux utilisateurs — pour mesurer la légèreté,
 * on l'aurait dégradée.
 *
 * `__BENCH__` est remplacé par un LITTÉRAL à la construction. Dans le build
 * normal il vaut `0`, la branche qui rembourre la fixture devient
 * `if (0 > 0)`, et rolldown l'élimine : le coût est nul, et le gate de poids
 * le prouve plutôt que ce commentaire. `MEESHY_BENCH=500 bun run build` produit
 * la variante que le témoin mesure — même mécanique que `MEESHY_RUNTIME` et
 * `MEESHY_TARGET`, déjà en place.
 */
const bench = Number.parseInt(process.env.MEESHY_BENCH ?? '0', 10) || 0;

/**
 * LE PRÉCHAUFFAGE ENTRE DANS LA CONSTRUCTION, et il n'y est pas par commodité.
 *
 * Il était enchaîné APRÈS `vite build` dans le script `build` du manifeste, et
 * cet ordre-là avait un coût invisible : quand `vite-plugin-pwa` parcourait
 * `dist/` pour composer son manifeste de précache, les cinq documents
 * n'existaient pas encore. Le service worker ne les connaissait donc pas — et,
 * pire que de ne pas les mettre en cache, sa `NavigationRoute` servait la
 * COQUILLE de l'application à leur place dès la deuxième visite. Mesuré :
 * `/about` rendait « À propos de Meeshy », zéro script, en visite 1 ; puis
 * « Meeshy », aucun `<h1>`, deux scripts, en visite 2.
 *
 * `closeBundle` d'un greffon ORDINAIRE s'exécute avant celui de
 * `vite-plugin-pwa`, qui se déclare `enforce: 'post'`. Les documents sont donc
 * sur le disque quand le manifeste se scelle, et ils y entrent avec leur
 * empreinte — ce qui règle du même coup leur invalidation : une page qui change
 * change son empreinte, et le déploiement suivant la remplace. C'est ce que le
 * cache d'exécution ne sait pas faire.
 *
 * Le préchauffage reste un PROCESSUS séparé : il rend du JSX avec la pragma
 * preact et lit des `.tsx`, ce que ce fichier de configuration — chargé par
 * Node — ne sait pas faire.
 */
const prerenderInstitutionalPages = (): Plugin => ({
  name: 'meeshy-prerender-institutional',
  apply: 'build',
  closeBundle: {
    sequential: true,
    handler() {
      const r = spawnSync('bun', ['run', 'scripts/prerender-institutional.tsx'], {
        cwd: fileURLToPath(new URL('.', import.meta.url)),
        stdio: 'inherit',
      });
      if (r.status !== 0) {
        throw new Error(
          `Le préchauffage des pages institutionnelles a échoué (code ${r.status}). ` +
            'La construction s\'arrête : un `dist` sans ces documents produirait un ' +
            'service worker qui sert la coquille de l\'application sur /about, /privacy, ' +
            'etc. — un défaut SILENCIEUX, que seule une deuxième visite révèle.',
        );
      }
    },
  },
});

export default defineConfig({
  base: forCapacitor ? './' : '/',
  define: { __BENCH__: JSON.stringify(bench) },
  resolve: {
    alias: [
      ...(runtime === 'preact' ? aliasPreact : []),
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  plugins: [
    tailwind(),
    prerenderInstitutionalPages(),
    /**
     * VARIANTE A (PWA). Desactivee sous Capacitor : la coque native gere
     * elle-meme son cycle de vie, et un service worker par-dessus ferait deux
     * caches concurrents sur le meme bundle.
     */
    ...(forCapacitor
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
                { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,woff2}'],
              /**
               * Chaque page institutionnelle est écrite dans DEUX formes —
               * `about.html` et `about/index.html` — parce qu'un serveur
               * statique ne résout pas forcément les deux (#5554). Elles sont
               * identiques octet pour octet, mais ce sont deux ADRESSES :
               * Workbox les précachait toutes les deux. Mesuré sur navigateur
               * réel — 10 requêtes, 279,8 Ko bruts à l'installation, dont la
               * moitié en pur doublon (~37 Ko gzip), soit PLUS que la première
               * peinture entière de l'application.
               *
               * Seule la forme canonique entre donc au précache ; `/about/`
               * est ramenée sur `/about` par `sw-institutional.js`. Le motif
               * ne croise pas les `/`, donc l'`index.html` de la racine — la
               * coquille de l'application — n'est PAS exclu.
               */
              globIgnores: ['*/index.html'],
              /**
               * Chargé EN TÊTE du service worker généré, donc son écouteur
               * `fetch` passe avant ceux de Workbox.
               */
              importScripts: ['sw-institutional.js'],
              /**
               * LA CEINTURE, le précache étant les bretelles.
               *
               * Sans cette liste, `NavigationRoute` répond à TOUTE navigation
               * par `index.html` — la coquille de l'application. Les cinq
               * documents institutionnels avaient beau être sur le disque, un
               * visiteur qui revenait recevait la coquille, qui n'a pas de
               * route `/about` : page blanche. Le motif est ancré aux deux
               * bouts, donc `/about-nous` — qui appartient bien à
               * l'application — n'est pas exclu par erreur.
               *
               * Sa source est partagée avec le préchauffage
               * (`scripts/lib/institutional-routes.mjs`) : deux listes
               * tenues à la main auraient divergé au premier ajout de page.
               */
              navigateFallbackDenylist: [INSTITUTIONAL_PATTERN],
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
      /**
       * DEUX entrées CSS : celle de l'application, et celle — beaucoup plus
       * maigre — des pages institutionnelles préchauffées, dont la détection
       * Tailwind est limitée à leurs propres fichiers (`source(none)` +
       * `@source`). Voir src/styles/institutional.css.
       */
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        institutional: fileURLToPath(new URL('./src/styles/institutional.css', import.meta.url)),
      },
      output: {
        /**
         * Le socle et les ecrans sont separes pour que le gate DESIGNE un
         * coupable quand un poids monte (§ 8.4 de la conception v3), et pour
         * qu'un ecran neuf ne renchérisse pas la premiere peinture.
         */
        /**
         * `core` est le SOCLE : ce que le document référence lui-même, donc ce
         * que le lecteur paie AVANT le premier pixel. Une dépendance n'y entre
         * que si plusieurs routes la lisent.
         *
         * Le règle par défaut — « node_modules ⇒ core » — est fausse dès qu'une
         * dépendance ne sert qu'à un écran, et elle l'est en silence : mesuré,
         * `@tanstack/react-virtual` y a fait passer la première peinture de
         * 26,33 à 31,44 Ko pour un module que seul le fil monte. On NOMME donc
         * les dépendances mono-écran, et le gate de poids garde la porte.
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@tanstack/react-query')) return 'data';
            // Le virtualiseur ne sert qu'au fil : son propre morceau, chargé
            // par la route qui l'importe et par personne d'autre.
            // `virtual-core` porte l'essentiel du calcul : le nommer AUSSI est
            // le point qui compte — nommer le seul paquet React laissait 6 Ko
            // de son moteur dans le socle, et la mesure l'a dit avant moi.
            if (id.includes('@tanstack/react-virtual') || id.includes('@tanstack/virtual-core')) {
              return 'virtual';
            }
            return 'core';
          }
          return undefined;
        },
      },
    },
  },
});
