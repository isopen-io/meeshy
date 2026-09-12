import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwind from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { INSTITUTIONAL_PATTERN } from './scripts/lib/institutional-routes.mjs';
import { INLINE_INTERFACE_LANGUAGE_BOOTSTRAP } from './src/lib/inline-interface-language-bootstrap.js';
import { INLINE_SCHEME_BOOTSTRAP } from './src/lib/inline-scheme-bootstrap.js';
import { declaredBuildFlag } from './src/lib/build-flag';

/**
 * `index.html` ne porte plus le TEXTE du script d'amorçage du schéma, mais un
 * marqueur — voir son commentaire. Trois lecteurs (`index.html` via ce
 * greffon, `scripts/prerender-institutional.tsx`, `src/lib/scheme.ts`) importent
 * désormais la MÊME constante plutôt que de la recopier (#5588) : la clé et le
 * script ne peuvent plus diverger entre eux.
 */
const SCHEME_BOOTSTRAP_MARKER = '/*@INLINE_SCHEME_BOOTSTRAP@*/';

const inlineSchemeBootstrap = (): Plugin => ({
  name: 'meeshy-inline-scheme-bootstrap',
  transformIndexHtml(html) {
    if (!html.includes(SCHEME_BOOTSTRAP_MARKER)) {
      throw new Error(
        `index.html ne porte plus le marqueur ${SCHEME_BOOTSTRAP_MARKER} : le script d'amorçage du ` +
          "schéma ne serait plus injecté, et le premier rendu à froid basculerait de couleur (#5588).",
      );
    }
    return html.replace(SCHEME_BOOTSTRAP_MARKER, INLINE_SCHEME_BOOTSTRAP);
  },
});

/**
 * Même patron que ci-dessus, pour la langue d'INTERFACE (#6206) : `index.html`
 * porte un marqueur, ce greffon l'injecte depuis
 * `inline-interface-language-bootstrap.js` — la même constante que lit
 * `src/lib/interface-language.ts` — pour que le HTML et le module applicatif
 * ne puissent plus diverger sur la clé de stockage ni sur les langues
 * supportées.
 */
const INTERFACE_LANGUAGE_BOOTSTRAP_MARKER = '/*@INLINE_INTERFACE_LANGUAGE_BOOTSTRAP@*/';

const inlineInterfaceLanguageBootstrap = (): Plugin => ({
  name: 'meeshy-inline-interface-language-bootstrap',
  transformIndexHtml(html) {
    if (!html.includes(INTERFACE_LANGUAGE_BOOTSTRAP_MARKER)) {
      throw new Error(
        `index.html ne porte plus le marqueur ${INTERFACE_LANGUAGE_BOOTSTRAP_MARKER} : le script ` +
          "d'amorçage de la langue d'interface ne serait plus injecté, et <html lang> resterait figé sur " +
          'la valeur statique du HTML (#6206).',
      );
    }
    return html.replace(INTERFACE_LANGUAGE_BOOTSTRAP_MARKER, INLINE_INTERFACE_LANGUAGE_BOOTSTRAP);
  },
});

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
 * — d'ou la base relative. `MEESHY_TARGET=capacitor` bascule la construction.
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
 * LA VERSION DU PRODUIT — LUE, jamais recopiée (revue de #5555, défaut 8).
 *
 * `BrandSignature` rend « Meeshy {version} » sur les cinq pages
 * institutionnelles ET sur l'écran de connexion. Le préchauffage lit
 * `package.json` (`scripts/prerender-institutional.tsx`) ; l'application, elle,
 * n'a pas de système de fichiers — la version y arrivait donc en LITTÉRAL
 * (`'3.1.0'` dans `routes/login.tsx`), juste ce jour-là et faux au prochain
 * `npm version`. Un littéral de construction relit la MÊME source au même
 * moment que le reste de la table : une source, deux lecteurs, aucune copie.
 */
const appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).version as string;

/**
 * LA SOURCE DE DONNÉES EST CÂBLÉE (#5650) — `resolveApiConfig`
 * (`src/lib/api/config.ts`) rend `source`, et `routes/conversations.tsx` /
 * `routes/thread.tsx` la LISENT désormais via `lib/api/query.ts`
 * (`useConversations`/`useThreadData`) : `VITE_DATA_SOURCE=gateway`
 * construit une application qui parle réellement à la passerelle. La garde
 * qui refusait cette valeur (#5605) a disparu dans CE diff — sa disparition
 * est le témoin que le câblage est fait, un commentaire seul ne l'aurait pas
 * prouvé. `bun test` et tous les gates restent sur `fixtures` (la valeur par
 * défaut) ; `scripts/check-gateway-build.mjs` est le SEUL gate qui construit
 * en `gateway` et le vérifie dans un navigateur réel.
 *
 * LA GARDE RESTE, SON SENS CHANGE (revue-correction). Celle de #5605
 * refusait la valeur `gateway` parce qu'elle n'était pas câblée ; elle
 * faisait AUSSI, sans le dire, un second travail : refuser une valeur
 * INCONNUE. `resolveSource` (`config.ts:79-81`) rend `fixtures` pour tout ce
 * qui n'est pas EXACTEMENT `gateway` — donc `VITE_DATA_SOURCE=gatway`,
 * `Gateway` ou `true` construirait, en silence, un déploiement de
 * PRODUCTION servant des FIXTURES à des utilisateurs, en croyant parler à
 * la passerelle. C'est exactement ce que la garde `VITE_READING_MODES`
 * ci-dessous refuse pour sa propre variable, et son doc-comment CITE cette
 * garde-ci comme précédent. On refuse donc toujours de construire sur une
 * valeur inconnue ; on accepte désormais les deux qui existent.
 */
const declaredDataSource = declaredBuildFlag('VITE_DATA_SOURCE', process.env.VITE_DATA_SOURCE, [
  'fixtures',
  'gateway',
]);

/**
 * LES MODES DE LECTURE DU FIL — PARAMÈTRE DE CONSTRUCTION, jamais un toggle
 * utilisateur ni un programme bêta (directive porteur 2026-09-08, D-20). La
 * liste Lentille n'en dépend pas (D-9).
 *
 * Miroir de `MEESHY_FLAG_READING_MODES` (iOS, `LentilleFeatureFlag.swift:82-90`) :
 * `resolveApiConfig` (`src/lib/api/config.ts`) accepte déjà `'on'`, `'off'` et
 * l'absence — `'off'` seul désactive. Une TROISIÈME valeur ne ferait rien de
 * mal à l'exécution (`resolveReadingModes` la traiterait comme `'on'`), mais
 * ce silence est exactement le malentendu que la garde `VITE_DATA_SOURCE`
 * ci-dessus refuse déjà : une faute de frappe (`'On'`, `'disabled'`) partirait
 * pour un déploiement entier en croyant avoir choisi une valeur qui n'existe
 * pas. On refuse ici de CONSTRUIRE plutôt que de laisser passer le malentendu.
 */
/* Aucune liaison : contrairement à `VITE_DATA_SOURCE`, cette valeur n'est
   relue nulle part dans ce fichier — l'appel est ici pour REFUSER DE
   CONSTRUIRE sur une faute de frappe, et c'est tout ce qu'on lui demande. */
void declaredBuildFlag('VITE_READING_MODES', process.env.VITE_READING_MODES, ['on', 'off']);

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
const prerenderInstitutionalPages = (): Plugin => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  /**
   * REÇU DE `configResolved`, JAMAIS DEVINÉ (#5812, élargit #5821).
   *
   * Ce greffon tourne pour LES DEUX variantes (rien ne le conditionne à
   * `forCapacitor`) : la A construit `dist/` par défaut, la B `dist-
   * capacitor/` sous `--outDir` explicite (`check-shell-dist.mjs`) ou
   * `MEESHY_TARGET=capacitor` seul (le défaut de `outDir` reste alors
   * `dist`, MAIS les deux constructions ne coexistent jamais dans le même
   * process). Sans relayer `config.build.outDir` au script préchauffé, ce
   * dernier retombait sur `../dist` EN DUR quel que soit l'appelant : une
   * construction de la variante B écrivait ses cinq pages dans la sortie de
   * la variante A — mesuré, `dist-capacitor/` n'en recevait AUCUNE.
   */
  let outDir = 'dist';
  return {
    name: 'meeshy-prerender-institutional',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle: {
      sequential: true,
      handler() {
        const dist = resolve(root, outDir);
        const r = spawnSync('bun', ['run', 'scripts/prerender-institutional.tsx', dist], {
          cwd: root,
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
  };
};

/**
 * LE SERVICE WORKER INSTITUTIONNEL N'ENTRE PAS DANS LA COQUE (#5604,
 * revue-correction).
 *
 * `sw-institutional.js` vit dans `public/`, donc Vite le RECOPIE tel quel dans
 * TOUTE construction — y compris la variante B, ou VitePWA est pourtant retire
 * et ou plus rien ne l'`importScripts`. Il partait donc dans l'APK et dans
 * l'IPA en fichier MORT, pendant que `capacitor.config.ts` et le gate
 * `check-shell-dist.mjs` affirmaient tous deux « aucun service worker ». Une
 * affirmation qu'un fichier du dist contredit n'est pas une affirmation.
 *
 * `writeBundle` et non `generateBundle` : les actifs de `public/` sont copies
 * HORS du graphe de rollup, donc invisibles du second.
 */
const dropInstitutionalServiceWorker = (): Plugin => ({
  name: 'meeshy-drop-institutional-sw',
  apply: 'build',
  writeBundle(options) {
    if (options.dir === undefined) return;
    rmSync(join(options.dir, 'sw-institutional.js'), { force: true });
  },
});

/**
 * LES SIX FABRIQUES DE FIXTURES — nommées ICI, lues par la règle d'élagage
 * (§ `build.rollupOptions.treeshake`, revue #5815).
 */
const FIXTURE_MODULE = /\/src\/lib\/api\/fixtures[\w-]*\.ts$/;

export default defineConfig({
  /**
   * LE LIEN PROFOND CASSAIT SES PROPRES ACTIFS (#5725, D-27 — corrigé en
   * revue, #5812).
   *
   * Les deux coques servent déjà `index.html` pour tout chemin sans
   * extension — Android par `html5mode` (`WebViewLocalServer.java`, VRAI par
   * défaut), iOS INCONDITIONNELLEMENT (`CapacitorRouter.route(for:)`,
   * `Router.swift`). Le commentaire historique de ce fichier (« des chemins
   * absolus casseraient ») décrivait un chargement `file://` littéral qui n'a
   * PAS cours ici : les deux coques servent une origine VIRTUELLE
   * (`https://localhost/…` Android, `capacitor://localhost/…` iOS), jamais le
   * système de fichiers brut — d'où la base RELATIVE (`./assets/…`) qu'elles
   * portaient, et le défaut qui en découlait : servi en réponse à une
   * navigation vers `/c/<id>`, le navigateur résolvait `./assets/x.js` contre
   * l'URL NAVIGUÉE (`https://localhost/c/assets/x.js`, 404) — `index.html`
   * arrivait, son script jamais.
   *
   * La base est donc la MÊME pour les deux variantes : la racine. Un chemin
   * root-absolu (`/assets/x.js`) résout contre l'ORIGINE, quel que soit le
   * chemin navigué — c'est exactement ce qui rendait la variante A immunisée.
   *
   * Une balise `<base href="/">` produirait le même effet sur les actifs et
   * a été essayée (D-27) : elle est REFUSÉE, et `check-shell-dist.mjs` la
   * refuse explicitement. `<base>` déplace la résolution de TOUTE URL
   * relative du document — les URL RÉDUITES À UN FRAGMENT comprises. Mesuré
   * sur le dist de la coque : avec `<base href="/">`, le lien d'évitement
   * `<a href="#contenu">` de `src/components/shell.tsx` résolvait vers
   * `https://localhost/#contenu` depuis `/c/<id>` — l'activer QUITTAIT le fil
   * pour la liste (`hasThreadMain: true → false`). Le premier contrôle du
   * clavier sur chaque écran, cassé dans les deux coques et nulle part
   * ailleurs.
   */
  base: '/',
  define: {
    __BENCH__: JSON.stringify(bench),
    __SHELL__: JSON.stringify(forCapacitor),
    /**
     * `__FIXTURES__` — LE JEU DE FIXTURES EST-IL LIÉ DANS CE BUNDLE ?
     * (revue #5815). Littéral, jamais une valeur d'exécution : c'est la
     * seule forme que Rollup sait replier. `apiConfig.source` reste la
     * source de vérité du COMPORTEMENT ; `__FIXTURES__` ne fait que dire à
     * la construction ce qu'elle sait déjà, pour qu'elle puisse ÉLAGUER.
     *
     * Les deux ne peuvent pas diverger dangereusement : `resolveSource`
     * (`src/lib/api/config.ts:79-81`) lit `import.meta.env.VITE_DATA_SOURCE`,
     * que Vite peuple depuis ce MÊME `process.env` — et le seul écart
     * possible (variable posée dans un `.env` que `process.env` ne voit pas)
     * rend `__FIXTURES__` VRAI, donc GARDE les fixtures dans le bundle : du
     * poids en trop, jamais une branche fixtures élaguée sous les pieds
     * d'une exécution qui l'attend.
     *
     * Sans lui, `VITE_DATA_SOURCE=gateway` embarquait quand même les ~74 Ko
     * de `src/lib/api/fixtures*.ts` (Amina Diallo, Kwame Mensah, Fatou Bâ,
     * `u-viewer` mesurés dans `use-reader-*.js`) : Rollup ne peut pas élaguer
     * un module dont un export est référencé par une branche que seule une
     * valeur d'EXÉCUTION rend morte.
     */
    __FIXTURES__: JSON.stringify(declaredDataSource !== 'gateway'),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  /**
   * LE PROXY DE DEV (#5605, staging) — DEV UNIQUEMENT, zéro octet dans `dist/`.
   *
   * La passerelle NOMME ses origines en staging (`CORS_ORIGINS` de
   * `docker-compose.staging.yml` : les deux hôtes du staging et, depuis
   * #5815, les deux origines VIRTUELLES des coques Capacitor) —
   * `http://localhost:5173`
   * n'y figure PAS, et `originIsAllowed()` (`cors-origins.ts:131-139`) refuse
   * toute origine hors liste. Un appel `fetch` direct depuis Chrome local se
   * ferait donc REFUSER par CORS avant même d'atteindre la route.
   *
   * Le proxy rend l'appel SAME-ORIGIN côté navigateur (`/api/v1/…` reste sur
   * `localhost:5173` : c'est le fetch du navigateur que le vérificateur CORS
   * du NAVIGATEUR regarde, et il ne voit qu'une requête locale). Mais le
   * navigateur pose quand même un en-tête `Origin: http://localhost:5173`
   * sur la requête sortante, et `http-proxy` la RELAIE telle quelle vers
   * `gate.staging.meeshy.me` — sans le retrait ci-dessous, la passerelle
   * recevrait exactement l'origine qu'elle refuse (`cors-origins.ts:131-139`,
   * `localhost:5173` absent de `CORS_ORIGINS`) et l'appel échouerait quand
   * même, une couche plus loin que le navigateur.
   */
  server: {
    proxy: {
      '/api/v1': {
        target: process.env.MEESHY_PROXY_TARGET ?? 'https://gate.staging.meeshy.me',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
      /**
       * LE SOCKET, MÊME DISCIPLINE QUE `/api/v1` CI-DESSUS (#5793).
       * `http://localhost:5173` n'est pas dans `CORS_ORIGINS` de la
       * passerelle (`docker-compose.staging.yml:237-238`) ; le proxy rend la
       * poignée de main SAME-ORIGIN côté navigateur — `ws: true` fait suivre
       * l'UPGRADE HTTP en WebSocket, que `http-proxy` ne relaie PAS par
       * défaut. Le retrait de l'en-tête `origin` est le MÊME motif que pour
       * `/api/v1` : sans lui, `originIsAllowed()` (`cors-origins.ts:131-139`)
       * verrait passer `localhost:5173` telle quelle et la refuserait.
       */
      '/socket.io': {
        target: process.env.MEESHY_PROXY_TARGET ?? 'https://gate.staging.meeshy.me',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  resolve: {
    alias: [
      ...(runtime === 'preact' ? aliasPreact : []),
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  plugins: [
    tailwind(),
    inlineSchemeBootstrap(),
    inlineInterfaceLanguageBootstrap(),
    prerenderInstitutionalPages(),
    ...(forCapacitor ? [dropInstitutionalServiceWorker()] : []),
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
            includeAssets: ['favicon-48.png'],
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
              /**
               * `brand/*.png` (#5606) : les DEUX actifs de marque servis par
               * les pages institutionnelles (le logo d'en-tête, le glyphe de
               * la signature de pied) — pas les icônes du manifest, dont le
               * doublon a déjà coûté ~37 Ko d'installation une fois (#5554,
               * `globIgnores` ci-dessous). ~13 Ko bruts pour les deux, contre
               * une signature affichant un glyphe CASSÉ au tout premier accès
               * hors ligne à une page institutionnelle sans ce précache — le
               * cache d'exécution `medias` (CacheFirst, plus bas) ne les
               * connaît qu'APRÈS un premier succès réseau.
               *
               * `favicon-48.png` (revue de #5606, défaut 1) : l'ancien
               * `favicon.svg` entrait dans le précache par le motif `svg`
               * générique ; sa PROJECTION dérivée d'iOS est un PNG, et un
               * favicon absent du précache redeviendrait une requête réseau à
               * la deuxième visite — exactement ce que `check-institutional.mjs`
               * (critère 3) exige à zéro.
               */
              globPatterns: ['**/*.{js,css,html,svg,woff2}', 'brand/*.png', 'favicon-48.png'],
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
       * LES SIX FABRIQUES DE FIXTURES N'ONT AUCUN EFFET DE BORD (revue #5815).
       *
       * `__FIXTURES__` (§ `define`) rend leurs exports NON RÉFÉRENCÉS sous
       * `VITE_DATA_SOURCE=gateway` — mesuré : `CONVERSATIONS` (« Voyage
       * Lisbonne ») disparaît bien du bundle. Les MODULES, eux, restaient :
       * ils bâtissent leurs jeux de données par des appels au niveau module
       * (`.map(…)`), et un bundler suppose par défaut qu'un tel appel peut
       * agir hors du module. On DÉCLARE donc le contraire, pour ces fichiers
       * NOMMÉS et eux seuls — jamais un `sideEffects: false` de
       * `package.json`, qui l'affirmerait de toute l'application (magasins,
       * amorçage du schéma, feuilles CSS importées pour leur seul effet).
       */
      treeshake: {
        moduleSideEffects: [{ test: FIXTURE_MODULE, sideEffects: false }],
      },
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
            /**
             * LE CLIENT SOCKET.IO (#5793) — ~13 Ko gzip, atteint UNIQUEMENT
             * par `lib/net/socket-io-factory.ts`, lui-même importé par
             * `lib/api/realtime.ts` (chargé en `import()` APRÈS la première
             * peinture, `main.tsx`). Le NOMMER, même motif que le
             * virtualiseur ci-dessus : sans ce nom, ces cinq paquets
             * rejoindraient `core` dès qu'un SEUL import statique les
             * atteindrait par erreur — et le gate de poids ne pourrait
             * désigner AUCUN coupable.
             */
            if (
              id.includes('socket.io-client') ||
              id.includes('engine.io-client') ||
              id.includes('socket.io-parser') ||
              id.includes('engine.io-parser') ||
              id.includes('@socket.io/component-emitter')
            ) {
              return 'socketio';
            }
            return 'core';
          }
          return undefined;
        },
      },
    },
  },
});
