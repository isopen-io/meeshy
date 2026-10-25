import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwind from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import { INLINE_INTERFACE_LANGUAGE_BOOTSTRAP } from './src/lib/inline-interface-language-bootstrap.js';
import { INLINE_APP_SCHEME_BOOTSTRAP } from './src/lib/inline-scheme-bootstrap.js';
import { declaredBuildFlag } from './src/lib/build-flag.js';
import { loadedPreloadDeps } from './src/lib/build-preload-deps.js';
import { shellApiOrigin, withApiPreconnect } from './src/lib/net/shell-preconnect.js';
import { dropServiceWorkerScripts, meeshyPwa } from './vite/pwa.js';

/**
 * `index.html` ne porte plus le TEXTE du script d'amorçage du schéma, mais un
 * marqueur — voir son commentaire. Trois lecteurs (`index.html` via ce
 * greffon, `scripts/prerender-institutional.tsx`, `src/lib/scheme.ts`) importent
 * désormais le MÊME module plutôt que de le recopier (#5588) : la clé et le
 * script ne peuvent plus diverger entre eux. `index.html` reçoit la variante
 * qui règle aussi la barre du navigateur (#7970).
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
    return html.replace(SCHEME_BOOTSTRAP_MARKER, INLINE_APP_SCHEME_BOOTSTRAP);
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
 * La coque préconnecte sa passerelle dès le HTML (#10534) — voir
 * `src/lib/net/shell-preconnect.ts`. Le web n'en reçoit pas : son origine
 * n'est connue qu'à l'exécution (`/config.js`).
 */
const shellApiPreconnect = (): Plugin => ({
  name: 'meeshy-shell-api-preconnect',
  transformIndexHtml: (html) => withApiPreconnect(html, shellApiOrigin(process.env.VITE_API_BASE)),
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
 * `BrandSignature` rend « Meeshy {version} » sur les sept pages
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
 * `dist/` pour composer son manifeste de précache, les sept documents
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
 * LA LANDING DE meeshy.me EST PRÉRENDUE, une page par langue (#10002).
 *
 * Même horloge que le préchauffage institutionnel ci-dessus — `closeBundle`
 * d'un greffon ordinaire, donc AVANT que `vite-plugin-pwa` ne scelle son
 * manifeste de précache — et même processus séparé (`react-dom/server` lit des
 * `.tsx`). Variante web SEULEMENT : la coque n'a pas de landing, `/` y ouvre la
 * liste des conversations (`routes/home-shell.tsx`).
 */
const prerenderLanding = (): Plugin => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  let outDir = 'dist';
  return {
    name: 'meeshy-prerender-landing',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle: {
      sequential: true,
      handler() {
        const r = spawnSync('bun', ['run', 'scripts/prerender-landing.tsx', resolve(root, outDir)], {
          cwd: root,
          stdio: 'inherit',
        });
        if (r.status !== 0) {
          throw new Error(
            `Le prérendu de la landing a échoué (code ${r.status}). La construction s'arrête : ` +
              'sans `landing.html`, nginx ne servirait rien sur / et les robots ne liraient aucune balise.',
          );
        }
        /* LES APERÇUS DES ADRESSES DE L'APPLICATION (#10192) — même horloge,
           même variante : nginx sert ces copies de la coquille aux adresses
           de l'application, et la coque n'a pas de nginx. */
        const previews = spawnSync('bun', ['run', 'scripts/prerender-share-previews.ts', resolve(root, outDir)], {
          cwd: root,
          stdio: 'inherit',
        });
        if (previews.status !== 0) {
          throw new Error(`Le prérendu des aperçus d'adresse a échoué (code ${previews.status}). La construction s'arrête.`);
        }
      },
    },
  };
};

/**
 * LES CAPTURES DE `/download` N'ENTRENT PAS DANS LA COQUE (#8801).
 *
 * `public/store-shots/` porte ~1,9 Mo de captures d'écran que seule la page
 * `/download` du WEB affiche : dans l'APK et l'IPA, elles seraient du poids
 * mort. La page les charge depuis l'origine publique quand `__SHELL__` est
 * vrai (`routes/download.tsx`).
 */
const dropWebOnlyAssets = (): Plugin => ({
  name: 'meeshy-drop-web-only-assets',
  apply: 'build',
  writeBundle(options) {
    if (options.dir === undefined) return;
    rmSync(join(options.dir, 'store-shots'), { recursive: true, force: true });
    /* LES IMAGES D'APERÇU (#10002) — `og/` ne sert que les robots qui
       déplient un lien `https://meeshy.me/…` (sept landings, ~75 Ko chacune,
       et l'invitation de la passerelle) : la coque ne les affiche jamais. */
    rmSync(join(options.dir, 'og'), { recursive: true, force: true });
  },
});

/**
 * LES SIX FABRIQUES DE FIXTURES — nommées ICI, lues par la règle d'élagage
 * (§ `build.rollupOptions.treeshake`, revue #5815).
 */
const FIXTURE_MODULE = /\/src\/lib\/api\/fixtures[\w-]*\.ts$/;

/**
 * UN `.env` HÉRITÉ NE FAIT PLUS D'UN `vite build` UN BUILD DE DÉVELOPPEMENT
 * (#9176).
 *
 * Le legacy Next.js a laissé, non suivi, `apps/web/.env` avec
 * `NODE_ENV=development`. Pour Vite, c'est la manière DOCUMENTÉE de demander un
 * build de développement : le bundle sortait en silence avec
 * `import.meta.env.PROD` faux — sans service worker, avec `dev-harness` — et
 * faussait chaque gate local qui lit un comportement de production (#9118).
 *
 * Seul le SHELL demande désormais un build de développement
 * (`NODE_ENV=development vite build`). Un `NODE_ENV` venu d'un fichier est
 * écarté AVANT que Vite ne lise ses fichiers : `loadEnv` ne recopie
 * `NODE_ENV` dans `VITE_USER_NODE_ENV` que si cette dernière est absente, et
 * une chaîne vide n'y bascule rien. Les `VITE_*` du fichier restent lus. Puis
 * `configResolved` VÉRIFIE le résultat : si une version de Vite changeait ce
 * mécanisme, le build échouerait plutôt que de repartir en silence.
 */
const ENV_FILE_NODE_ENV = /^\s*(?:export\s+)?NODE_ENV\s*=\s*["']?([^"'\s#]*)/gm;

const declaredNodeEnv = (dir: string, name: string): string | undefined => {
  const text = (() => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return undefined;
    }
  })();
  return text === undefined ? undefined : [...text.matchAll(ENV_FILE_NODE_ENV)].at(-1)?.[1];
};

const productionBuildGuard = (): Plugin => {
  const state: { shellAsksDevelopment: boolean } = { shellAsksDevelopment: false };
  return {
    name: 'meeshy-production-build-guard',
    enforce: 'pre',
    config(userConfig, { command, mode }) {
      if (command !== 'build') return;
      state.shellAsksDevelopment = process.env.NODE_ENV === 'development';
      if (state.shellAsksDevelopment) return;
      const envDir = resolve(userConfig.root ?? process.cwd(), typeof userConfig.envDir === 'string' ? userConfig.envDir : '');
      const inherited = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].filter(
        (name) => declaredNodeEnv(envDir, name) === 'development',
      );
      if (inherited.length === 0) return;
      process.env.VITE_USER_NODE_ENV = '';
      console.warn(
        `[meeshy] NODE_ENV=development ignoré dans ${inherited.map((name) => join(envDir, name)).join(', ')} : ` +
          'ce build reste de PRODUCTION. Un build de développement se demande depuis le shell ' +
          '(NODE_ENV=development vite build) ; le fichier, hérité du legacy Next.js, peut être supprimé.',
      );
    },
    configResolved(config) {
      if (config.command !== 'build' || config.isProduction || state.shellAsksDevelopment) return;
      throw new Error(
        `vite build produirait un build de DÉVELOPPEMENT (NODE_ENV=${process.env.NODE_ENV}) sans que le shell l'ait ` +
          'demandé — un fichier .env le pose. Retirez NODE_ENV de ce fichier, ou lancez ' +
          'NODE_ENV=development vite build si c’est voulu (#9176).',
      );
    },
  };
};

/** Voir `src/lib/build-preload-deps.ts` (#10974) : capturé AVANT que Vite écrive les listes de préchargement. */
const preloadDeps = loadedPreloadDeps();
const capturePreloadBundle = (): Plugin => ({
  name: 'meeshy:capture-preload-bundle',
  apply: 'build',
  generateBundle: { order: 'pre', handler: (_options, bundle) => preloadDeps.capture(bundle) },
});

const proxyTarget = process.env.MEESHY_PROXY_TARGET ?? 'https://gate.staging.meeshy.me';

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
    /* #12654 — la révision du bundle, de la MÊME `VCS_REF` que le Dockerfile
       écrit dans `dist/build-info.json` : le contrôleur de mise à jour compare
       les deux. Absente (build local) ⇒ `null`, jamais une valeur fabriquée. */
    __BUILD_COMMIT__: JSON.stringify(process.env.VCS_REF?.trim() || null),
    /** La passerelle que le proxy de dev vise (#8287) — l'écran de connexion la
     * montre EN DÉVELOPPEMENT seulement, comme le sélecteur iOS au simulateur. */
    __API_PROXY_TARGET__: JSON.stringify(proxyTarget),
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
        target: proxyTarget,
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
        target: proxyTarget,
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
    productionBuildGuard(),
    capturePreloadBundle(),
    tailwind(),
    inlineSchemeBootstrap(),
    inlineInterfaceLanguageBootstrap(),
    prerenderInstitutionalPages(),
    ...(forCapacitor ? [] : [prerenderLanding()]),
    ...(forCapacitor ? [dropServiceWorkerScripts(), dropWebOnlyAssets(), shellApiPreconnect()] : []),
    /**
     * VARIANTE A (PWA). Desactivee sous Capacitor : la coque native gere
     * elle-meme son cycle de vie, et un service worker par-dessus ferait deux
     * caches concurrents sur le meme bundle.
     */
    ...(forCapacitor ? [] : [meeshyPwa()]),
  ],
  /**
   * LE WORKER DES EFFETS D'APPEL EST UN MODULE (#9099, #8471) — le format
   * `iife` par défaut interdit le découpage : le modèle de segmentation
   * (`video-effects-segmentation.ts`, MediaPipe) doit rester un chunk que le
   * worker ne charge qu'au premier flou.
   */
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    modulePreload: { resolveDependencies: preloadDeps.resolveDependencies },
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
       * LA DIRECTIVE « use client » D'UNE DÉPENDANCE NE DIT RIEN ICI. Elle
       * sépare les composants serveur et client d'un framework à rendu
       * serveur ; cette application ne rend que dans le navigateur, et le
       * bundler la retire en le signalant (`@tanstack/react-query`). Seul ce
       * signal-là se tait, et seulement pour `node_modules` : toute autre
       * alerte, et toute directive écrite dans nos sources, reste visible.
       */
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.id?.includes('/node_modules/')) return;
        warn(warning);
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
        /* LA LANDING (#10002) — sa feuille, inlinée par `scripts/prerender-landing.tsx`. */
        landing: fileURLToPath(new URL('./src/styles/landing.css', import.meta.url)),
      },
      output: {
        /**
         * L'EMPREINTE DES MORCEAUX À SEPT CARACTÈRES (#9706). L'entrée porte la
         * table de préchargement de TOUS les morceaux d'écran — plus de cinq
         * cents noms, payés à la première peinture de chaque lecteur, et
         * l'empreinte en est la seule partie que gzip ne comprime pas.
         * Sept caractères (42 bits) suffisent à distinguer quelques milliers
         * de fichiers et à invalider le cache ; huit n'achetaient rien de plus
         * (mesuré : 90,26 → 89,58 Ko ; rolldown refuse six).
         */
        chunkFileNames: 'assets/[name]-[hash:7].js',
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
            /**
             * LES OBSERVATEURS ET LES HOOKS DE TANSTACK (#10485) — le socle
             * ne lit que `QueryClient`, `QueryClientProvider`, `hydrate` et
             * `dehydrate` (`main.tsx`, `lib/api/query-client.ts`) ; `useQuery`,
             * `useMutation`, `useQueries`, `useInfiniteQuery` et les
             * `*Observer` de query-core ne servent qu'aux écrans, tous chargés
             * par `import()`. La règle « node_modules ⇒ core » les payait à la
             * première peinture de tous : mesuré, 89,95 → 85,85 Ko.
             */
            if (/@tanstack\/query-core\/build\/modern\/\w*Observer\.js$/.test(id)) return 'query-screens';
            if (/@tanstack\/react-query\/build\/modern\//.test(id) && !/\/(index|QueryClientProvider)\.js$/.test(id)) {
              return 'query-screens';
            }
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
            /**
             * ZOD (#6289) — la frontière du profil (`lib/api/profile.ts`,
             * `zod/mini`) est son SEUL importeur. Sans ce nom, la règle par
             * défaut le rangeait dans `core` : mesuré, la première peinture
             * passait de ~40,8 à 45,43 Ko pour un validateur qu'aucun écran
             * du socle ne lit.
             */
            if (id.includes('/node_modules/zod/') || id.includes('/zod@')) return 'zod';
            /**
             * MEDIAPIPE (#8471) — ~44 Ko gzip, atteint UNIQUEMENT par
             * `lib/calls/video-effects-segmentation.ts`, chargé au premier
             * flou d'arrière-plan que la caméra ne fait pas. Ni `core` (la
             * première peinture de tous : mesuré, 126 Ko au lieu de ~82) ni
             * un chunk NOMMÉ (que le socle importait encore) : AUCUN nom — il
             * rejoint son seul importeur (`budgets.json` ›
             * `call_video_segmentation`), hors du précache (`globIgnores`).
             */
            if (id.includes('@mediapipe/tasks-vision')) return undefined;
            /**
             * LOTTIE ET SON DÉZIPPEUR (#10638) — atteints UNIQUEMENT par les
             * `import()` de `lib/lottie/engine.ts` et `lib/lottie/decode.ts`.
             * Rangés dans `core`, ils y entraient malgré l'import dynamique :
             * mesuré, la première peinture passait de ~85 à 137 Ko.
             */
            if (id.includes('/lottie-web/') || id.includes('/fflate/')) return undefined;
            return 'core';
          }
          /**
           * LES NOMS D'ÉVÉNEMENTS SOCKET.IO (revue-correction #6171, défaut 1)
           * — `event-names.ts` (`@meeshy/shared`) est atteint à la fois par
           * `lib/api/socket.ts` (le chunk `realtime`, chargé en `import()`
           * statique depuis `lib/api/realtime.ts`) ET par
           * `lib/api/fixtures-realtime.ts`, désormais lui-même en `import()`
           * DEPUIS `realtime.ts` (§ défaut 1) — deux entrées asynchrones
           * distinctes qui partagent ce petit module. Sans ce nom, Rollup
           * range les exports dans LA PREMIÈRE des deux à les atteindre et
           * fait importer l'autre depuis elle : `fixtures-realtime` se
           * retrouvait à importer STATIQUEMENT le chunk `realtime`, ce que
           * `budgets.json › on_demand_chunks.realtime.dynamic_only` refuse —
           * à raison, ce chunk ne doit avoir qu'une seule voie d'accès, un
           * `import()`. Le nommer casse l'arête : les deux chunks importent
           * ce tiers, ni l'un ni l'autre ne s'importent entre eux.
           */
          /* Le nom NE COMMENCE PAS PAR `socketio-` : le motif du budget
           * `socketio` (`^assets/socketio-`) matcherait ce chunk EN PLUS du
           * client `socket.io-client` qu'il borne, et ferait déborder un
           * plafond que ce lot ne doit pas toucher (mesuré : 14,56 Ko contre
           * 14 avant ce renommage). */
          if (id.includes('/socketio-events/event-names')) return 'socket-event-names';
          /**
           * LES NOMS QUE LA PREMIÈRE PEINTURE LIT (#9966) — `viewing-`,
           * `session-` et `call-recording-event-names` (`@meeshy/shared`) sont
           * des PARTIES des deux cartes, qu'`event-names.ts` répand. Dans
           * l'entrée, `lib/api/conversation-viewing.ts` et
           * `lib/calls/call-recording.ts` ne lisent qu'elles. Sans nom à eux,
           * Rolldown les range dans le groupe `socket-event-names` ci-dessus,
           * dont ils sont des dépendances, et l'entrée importe alors la carte
           * ENTIÈRE. Mesuré : rendre `undefined` n'y change rien (90,09 Ko, un
           * groupe nommé entraîne ses dépendances) ; ce nom sort la carte de la
           * première peinture, 87,85 Ko au lieu de 90,09, pour 0,29 Ko.
           */
          if (/\/socketio-events\/(viewing|session|call-recording)-event-names\.[jt]s$/.test(id)) return 'event-names-first-paint';
          /**
           * LA LOI DU NIVEAU ET DE LA FRAPPE (#9706) — `levels`, `level-steps`,
           * `level-wire`, `mint` et `rarity` (`@meeshy/shared/utils/game`)
           * sont lus par les seuls écrans du jeu, et chacun pèse moins d'1 Ko.
           * Laissés à Rollup, ils faisaient CINQ morceaux, donc cinq noms dans
           * la table de préchargement que porte l'entrée — mesuré, chaque nom
           * coûte ~13 octets gzip à la première peinture de tous. Un nom pour
           * la famille : le même code, chargé par les mêmes écrans.
           * `boosts`, `personal-mission` et `photo-moments` (#9961) la rejoignent
           * pour la même raison : dev était à 90,00 Ko pile, et la seule entropie
           * des empreintes faisait basculer le gate (mesuré : 90,01 → 89,9 Ko).
           * `photo-catch-up` (#10174) aussi : l'hôte des invitations à
           * immortaliser le lit, comme les écrans du jeu, et Rolldown en faisait
           * un morceau de plus (mesuré : 92,97 → 92,96 Ko, `treasury` qu'il lit
           * rejoignant la famille avec lui).
           */
          /**
           * LES LOIS PURES DU TRANSPORT MÉDIA (`lib/view/media-transport.ts`) —
           * temps, vitesses, recherche : lues par le fil, ses visionneuses, le
           * mini-lecteur, les accusés et le composant de barre de lecture.
           * Quand Rollup les sort en morceau partagé (2026-10-11, après que la
           * fiche de profil a monté la visionneuse, #10092), il le nommait
           * d'après le fichier, `media-transport-…` : le motif du budget
           * `media_transport` (`^assets/media-transport-`), réservé au
           * COMPOSANT chargé par `import()`, le comptait alors, et ses importeurs
           * statiques — légitimes, ce sont des fonctions pures — faisaient
           * rougir `dynamic_only`. Un nom qui ne commence pas par ce préfixe.
           */
          /**
           * L'IDENTITÉ DE WORLD WIDE ET LES FAMILLES D'UN INVITÉ (#10038) —
           * `world-identity` et `guest-attachment-kind-rules` (`@meeshy/shared`),
           * des constantes et deux fonctions pures, sans Zod. Elles remplacent
           * les jumelles que le web en tenait ; laissées à Rolldown, elles
           * faisaient deux morceaux là où la jumelle n'en faisait qu'un, soit
           * un nom de plus dans la table de préchargement de l'entrée. Un nom
           * pour les deux : lues par les mêmes écrans (liste, fil, jonction).
           */
          /**
           * LA TABLE DES RÔLES PRIVILÉGIÉS (#11217) — `platform-privilege`
           * (`@meeshy/shared`), lue par la loi d'actions (`message-action-policy`,
           * chargée au geste) et par `participant-helpers`, que l'entrée lit pour
           * `resolveParticipantAvatar`. Laissée à Rolldown, ce module partagé
           * réorganisait les morceaux communs : `message-effect-flags`, jusque-là
           * dans l'entrée, en sortait en morceau à part, et la première peinture
           * passait le plafond (mesuré sur dev + le lot : 92,99 Ko, 93,01 en CI,
           * contre 92,87 sur dev). Un nom à elle la laisse aux écrans qui la
           * lisent : 92,91 Ko, la table des drapeaux revient dans l'entrée.
           */
          if (/\/utils\/platform-privilege\.[jt]s$/.test(id)) return 'role-law';
          if (/\/types\/(world-identity|guest-attachment-kind-rules)\.[jt]s$/.test(id)) return 'guest-world-law';
          if (id.endsWith('/src/lib/view/media-transport.ts')) return 'media-time';
          if (/\/utils\/game\/(levels|level-steps|level-wire|mint|rarity|boosts|personal-mission|photo-moments|photo-catch-up)\.[jt]s$/.test(id)) return 'game-law';
          return undefined;
        },
      },
    },
  },
});
