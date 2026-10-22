import { rmSync } from 'node:fs';
import { join } from 'node:path';

import type { Plugin, PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { INSTITUTIONAL_PATTERN } from '../scripts/lib/institutional-routes.mjs';
import { LANDING_LANGUAGES, LANDING_SUBPATH_PATTERN, landingFiles } from '../src/landing/landing-languages.js';
import { apiCacheIdentityPlugin } from '../src/lib/net/api-cache-identity.js';
import { API_RESPONSE_CACHE_PATTERN } from '../src/lib/net/api-runtime-cache.js';
import { EMAIL_TOKEN_NAVIGATIONS } from '../src/lib/net/email-token-navigations.js';
import { mediaCacheFreshnessPlugin } from '../src/lib/net/media-cache-freshness.js';
import { NETWORK_ONLY_NAVIGATIONS } from '../src/lib/net/network-only-navigations.js';
import { SHARE_TARGET } from '../src/lib/share-incoming/share-target.js';
import { SW_DEPLOYMENT_CONFIG_CACHE, SW_RUNTIME_CACHES } from '../src/lib/sw-caches.js';

/**
 * LE SERVICE WORKER ET LA PWA, HORS DE `vite.config.ts` (#11326).
 *
 * `vite.config.ts` dépassait le budget (1 176 lignes) : la configuration du
 * worker — ses scripts importés, son retrait de la coque, son manifeste, son
 * précache et ses seaux d'exécution — vit ici, une responsabilité par fichier.
 */
/**
 * LES SCRIPTS QUE LE SERVICE WORKER GÉNÉRÉ IMPORTE, déclarés UNE fois.
 *
 * Deux lecteurs : `importScripts` (variante A) et le retrait de la variante B
 * ci-dessous. Une liste recopiée dans chacun aurait laissé partir dans l'APK
 * le premier script ajouté d'un seul côté.
 *
 *  - `sw-institutional.js` ramène `/about/` sur `/about` (#5554) ;
 *  - `sw-legacy-purge.js` efface, à l'activation, les caches `meeshy-cache-*`
 *    que le service worker du legacy a laissés sur l'origine (#6702) ;
 *  - `sw-push.js` porte les écouteurs `push` et `notificationclick` (#7305) —
 *    le worker généré n'en avait AUCUN, pendant que la passerelle composait
 *    déjà toute la charge web (`PushNotificationService`, branche
 *    `platform === 'web'`). Une SEULE ligne l'accroche aux deux régimes :
 *    l'`importScripts` de la variante A, et son retrait de la coque ;
 *  - `sw-share-target.js` reçoit le `POST /share` du système (#8884) : une
 *    image, une vidéo ou un lien partagé depuis une autre application arrive
 *    sur la feuille d'envoi. Le `share_target` du manifeste (plus bas) l'y
 *    adresse ; la coque Android reçoit le même partage par un intent, pas par
 *    ce worker.
 */
export const SERVICE_WORKER_SCRIPTS = ['sw-institutional.js', 'sw-legacy-purge.js', 'sw-push.js', 'sw-share-target.js'] as const;

/**
 * LES SCRIPTS DU SERVICE WORKER N'ENTRENT PAS DANS LA COQUE (#5604,
 * revue-correction).
 *
 * Ils vivent dans `public/`, donc Vite les RECOPIE tels quels dans TOUTE
 * construction — y compris la variante B, ou VitePWA est pourtant retire et ou
 * plus rien ne les `importScripts`. Ils partaient donc dans l'APK et dans
 * l'IPA en fichiers MORTS, pendant que `capacitor.config.ts` et le gate
 * `check-shell-dist.mjs` affirmaient tous deux « aucun service worker ». Une
 * affirmation qu'un fichier du dist contredit n'est pas une affirmation.
 *
 * `writeBundle` et non `generateBundle` : les actifs de `public/` sont copies
 * HORS du graphe de rollup, donc invisibles du second.
 */
export const dropServiceWorkerScripts = (): Plugin => ({
  name: 'meeshy-drop-institutional-sw',
  apply: 'build',
  writeBundle(options) {
    if (options.dir === undefined) return;
    for (const name of SERVICE_WORKER_SCRIPTS) rmSync(join(options.dir, name), { force: true });
  },
});

/** LA VARIANTE A (PWA) — le worker généré, son manifeste et ses seaux. */
export function meeshyPwa(): PluginOption {
  return VitePWA({
    /**
     * `prompt`, ET NON `autoUpdate` (#6936) — LA VERSION NEUVE ATTEND
     * QU'ON LA DEMANDE.
     *
     * Sous `autoUpdate`, `vite-plugin-pwa` posait `skipWaiting: true` +
     * `clientsClaim: true` (`dist/index.js:874-877`) : un déploiement
     * activait le worker neuf EN SILENCE sous une page qui continuait
     * de faire tourner l'ancien JavaScript, et l'activation retirait du
     * précache les chunks de cette ancienne version — un écran chargé à
     * la demande pouvait alors ne plus se charger du tout. Le lecteur
     * n'apprenait jamais qu'une version existait.
     *
     * Avec `prompt`, le worker neuf reste en attente, la page l'annonce
     * (`lib/app-update/service-worker.ts` → bannière) et c'est le clic
     * qui lui envoie `SKIP_WAITING` — le comportement du legacy
     * (`apps/web/public/sw.js:233-238`).
     */
    registerType: 'prompt',
    /**
     * L'APPLICATION INSCRIT SON WORKER ELLE-MÊME, comme le legacy
     * (`ServiceWorkerInitializer`). `registerSW.js` n'inscrivait que le
     * script, sans détection ni annonce : garder les deux ferait deux
     * inscriptions du même script, dont une seule écoute. Les en-têtes
     * de `nginx.conf` suivent ce retrait.
     */
    injectRegister: false,
    includeAssets: ['favicon-48.png'],
    manifest: {
      name: 'Meeshy',
      short_name: 'Meeshy',
      description: 'Messagerie multilingue en temps réel',
      lang: 'fr',
      /* #10002 — `/` est la landing ; l'application installée
         démarre sur la liste des conversations, là où elle démarrait. */
      start_url: '/chats',
      scope: '/',
      display: 'standalone',
      /* #7877 — la PWA installée tourne comme les coques Android
         (aucun `screenOrientation`) et iOS (paysage déclaré, comme
         l'app iOS) : `portrait` y verrouillait vidéos, reels et appels. */
      orientation: 'any',
      /* #10005 — la surface de l'écran (`--ios-surface` sombre). */
      background_color: '#09090b',
      theme_color: '#09090b',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      /* #8884 — Meeshy figure dans la feuille de partage du système. */
      share_target: SHARE_TARGET,
    },
    workbox: {
      /**
       * LE WORKER NEUF PREND LA MAIN SUR LES PAGES DÉJÀ OUVERTES dès
       * qu'il s'active (#6936) — sans quoi la page qui vient de cliquer
       * « Mettre à jour » se rechargerait en restant servie par
       * l'ANCIEN worker, et la première visite ne serait contrôlée par
       * personne (`scripts/check-institutional.mjs` attend un
       * contrôleur). `skipWaiting` reste FAUX, son défaut : c'est le
       * clic qui l'appelle, par le message `SKIP_WAITING` que le
       * modèle de Workbox câble précisément quand il est faux.
       */
      clientsClaim: true,
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
       *
       * Trois SCRIPTS IMPORTÉS n'y entrent pas non plus (#6702,
       * étendu #7305, #8884) : `sw-legacy-purge.js`, `sw-push.js` et
       * `sw-share-target.js`, tous
       * chargés par `importScripts` — le navigateur garde déjà
       * les scripts importés avec le worker. Les précacher ferait
       * payer leurs octets une seconde fois, à chaque installation,
       * pour une copie que personne ne lit.
       *
       * La troisième entrée de cette liste était le worker FCM du
       * legacy (`firebase-messaging-sw.js`), SUPPRIMÉ par #7305 : rien
       * ne l'inscrivait dans la v2, et ses trois destinations
       * (`/conversations/<id>`, `/mood`, `/reel`) n'existent dans
       * aucune table de routes d'ici.
       *
       * LES POLICES DE STORY (#6951) — `globPatterns` nomme `woff2`, et
       * ce motif ne coûtait rien tant qu'aucune police n'existait. Les
       * treize familles de `src/styles/story-fonts.css` sont arrivées
       * DANS ce motif : mesuré, Workbox inscrivait les treize fichiers
       * au manifeste et chaque visiteur téléchargeait **247 Ko à
       * l'INSTALLATION** — plus de quatre fois la première peinture
       * entière — pour des polices que la plupart des lecteurs ne
       * verront jamais.
       *
       * Tout l'intérêt d'une `@font-face` est que son coût soit
       * CONDITIONNEL : le navigateur ne demande le fichier que pour
       * peindre un caractère de son `unicode-range`. Le précache le
       * rendait inconditionnel, c'est-à-dire qu'il ANNULAIT la
       * mécanique même sur laquelle le budget de ce lot repose.
       * `scripts/measure-weight.mjs` compte les `.woff2` du manifeste
       * produit et rougit au premier — la garde est sur le `sw.js` qui
       * PART, pas sur cette ligne.
       *
       * Conséquence assumée : une story ouverte HORS LIGNE et jamais
       * vue en ligne rend son texte dans la police système. C'est le
       * repli que ce lot tient partout (`story-fonts.ts`), et il est
       * préférable à 247 Ko payés par tous pour le cas rare.
       */
      globIgnores: [
        '*/index.html',
        /* LES SEPT LANDINGS (#10002) — un visiteur n'en lit qu'une, et
           un membre de la PWA aucune : les précacher ferait payer
           ~7 documents à chaque installation. `/` reste servie par la
           coquille précachée (`routes/home.tsx`), `/en`… par le réseau. */
        ...LANDING_LANGUAGES.flatMap(landingFiles).filter((file) => !file.includes('/')),
        /* LES APERÇUS D'ADRESSE (#10192) — des copies de la coquille
           pour les robots de messagerie, que nginx sert au premier
           chargement ; le précache garde la coquille nue. */
        'shell-og/**',
        /* LA CONFIGURATION DU DÉPLOIEMENT (#10208) — réécrite au
           démarrage du conteneur, donc JAMAIS précachée : son
           empreinte de build est celle du fichier par défaut, pas de
           celui que le conteneur sert. Elle a son seau (ci-dessous). */
        'config.js',
        /* L'AVATAR ET LA BANNIÈRE DE WORLD WIDE (#10204) — servis par
           adresse ABSOLUE dans la conversation et lus par le réseau
           comme n'importe quelle photo de conversation : ni leurs
           sources SVG ni leurs PNG n'ont à peser sur l'installation. */
        'brand/world-wide/**',
        'sw-legacy-purge.js',
        'sw-push.js',
        'sw-share-target.js',
        'assets/*.woff2',
        /* Le flou d'arrière-plan par segmentation (#8471) : MediaPipe
           et son chargeur WebAssembly ne se téléchargent qu'au premier
           flou que la caméra ne fait pas — jamais à l'installation. */
        'assets/video-effects-segmentation-*.js',
        'assets/vision_wasm_*',
        /* LES NOMS DE RECHERCHE DES EMOJIS (#10531) — sept langues,
           une trentaine de Ko chacune, dont un lecteur ne lit qu'une
           et seulement s'il CHERCHE un emoji : jamais à
           l'installation. La table des emojis, elle, reste précachée
           (la feuille s'ouvre hors ligne ; seule sa recherche demande
           le réseau la première fois). */
        'assets/emoji-names-*.js',
      ],
      /**
       * Chargés EN TÊTE du service worker généré, donc leurs écouteurs
       * passent avant ceux de Workbox (`SERVICE_WORKER_SCRIPTS`).
       */
      importScripts: [...SERVICE_WORKER_SCRIPTS],
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
       *
       * La SECONDE source (#6702) : les adresses que nginx redirige ou
       * sert lui-même depuis la bascule de meeshy.me — sans elles, un
       * visiteur qui revient recevrait la coquille à la place d'une
       * redirection 308 (`src/lib/net/network-only-navigations.ts`,
       * confrontée à la table des routes par son témoin).
       *
       * La TROISIÈME (#8053) : les liens d'e-mail qui portent un jeton
       * — la coquille d'une version en attente ne sait pas toujours le
       * consommer (`src/lib/net/email-token-navigations.ts`).
       */
      navigateFallbackDenylist: [
        INSTITUTIONAL_PATTERN,
        /* LES LANDINGS DE LANGUE (#10002) — `/en`, `/ar`… sont des
           documents prérendus : la coquille n'a pas de route pour eux.
           `/en` sort du précache (`en.html`), `/en/` du réseau. */
        LANDING_SUBPATH_PATTERN,
        ...NETWORK_ONLY_NAVIGATIONS,
        ...EMAIL_TOKEN_NAVIGATIONS,
      ],
      /**
       * La zone rurale est la raison d'etre de ce cache : le shell est
       * precache une fois, puis JAMAIS retelecharge tant que son hash
       * ne change pas. Les reponses d'API vont en NetworkFirst avec un
       * repli sur le cache — lecture possible hors ligne (principe
       * « Offline Graceful Degradation »).
       */
      runtimeCaching: [
        {
          /* LA CONFIGURATION DU DÉPLOIEMENT (#10208) en
             StaleWhileRevalidate : un démarrage sous service worker la
             lit dans son seau sans attendre le réseau (le script est
             bloquant), hors ligne compris, et la relit en fond — une
             origine changée au redémarrage du conteneur s'applique au
             lancement suivant. Fonction AUTONOME : Workbox la
             stringifie dans `dist/sw.js`.
             `index.html` la charge en script CLASSIQUE et bloquant
             (`<script src="/config.js">`, sans commentaire : chaque
             octet du document compte dans la première peinture) parce
             que `src/lib/api/config.ts` la lit à l'évaluation du
             module ; le défaut `public/config.js` est vide, et
             l'entrypoint du conteneur (`docker/runtime-config.sh`) le
             réécrit. */
          urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/config.js',
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: SW_DEPLOYMENT_CONFIG_CACHE,
            expiration: { maxEntries: 1 },
          },
        },
        {
          /* LES MÉDIAS D'ABORD, ET L'ORDRE EST LA MOITIÉ DU CORRECTIF
             (#6973) : le routeur de Workbox retient la PREMIÈRE route
             qui matche. Mesuré sur `dist/sw.js` du 2026-09-18, ce seau
             était enregistré EN SECOND et toute URL de média passe par
             `/api/v1/attachments/…` — avatars, scènes de fil, vignettes
             partaient donc dans le seau `api`, dont ils épuisaient le
             plafond de 200 entrées en un défilement, évinçant les
             réponses de conversations et de messages dont la lecture
             hors ligne dépend. `API_RESPONSE_CACHE_PATTERN` exclut
             désormais `/attachments/` AUSSI : la ceinture, l'ordre
             étant les bretelles — un seul des deux suffirait, et c'est
             précisément pour ça qu'on pose les deux.

             `destination === 'image'` plutôt qu'un motif d'URL : c'est
             ce qui laisse AUDIO et VIDÉO dehors par CONSTRUCTION
             (décision assumée, voir plus bas) et non par une liste
             d'extensions, qui se périmerait au premier format ajouté.
             La fonction est AUTONOME — elle ne cite aucun identifiant
             importé : Workbox stringifie ce champ dans `dist/sw.js`, où
             rien ne suit un import (#6862). */
          urlPattern: ({ request }) => request.destination === 'image',
          handler: 'CacheFirst',
          options: {
            cacheName: SW_RUNTIME_CACHES.medias,
            /* INDISSOCIABLE DE CE QUI PRÉCÈDE (#6973) : une `<img>`
               sans `crossOrigin` rend une réponse OPAQUE (status 0),
               que `CacheFirst` rejette EN SILENCE — le seau restait
               vide, et sortir les médias du seau `api` n'aurait rien
               changé. `mediaImageCrossOrigin` (api-runtime-cache.ts)
               fait demander le mode `cors` là où la passerelle rend
               `Access-Control-Allow-Origin` ; le `0` reste ici pour
               tout le reste (un CDN tiers, une `<img>` sans la règle). */
            cacheableResponse: { statuses: [0, 200] },
            /* 300 entrées, contre 120 : ce seau porte désormais les
               médias de la passerelle EN PLUS des actifs de l'origine.
               Avatars et scènes de fil y cohabitent — ils ne sont PAS
               séparables par l'URL, les deux étant composés par le site
               unique `streamSrc` (`lib/api/media-url.ts`) ; leur donner
               deux seaux demanderait un marqueur dans l'URL, donc une
               seconde clé de cache pour les mêmes octets.
               `purgeOnQuotaError` est le filet : un seau de médias est
               entièrement REGÉNÉRABLE, et il vaut mieux le vider que
               voir le navigateur refuser toute écriture. */
            expiration: {
              maxEntries: 300,
              maxAgeSeconds: 60 * 60 * 24 * 30,
              purgeOnQuotaError: true,
            },
            /* LA FRAÎCHEUR QUE LA PASSERELLE DÉCLARE (#9478) : une vue
               unique (`no-store`) ou un éphémère (`no-cache`) n'entre
               pas dans ce seau et n'en ressort pas sans réseau — le
               média ordinaire, lui, reste en Cache-First. Autonome —
               Workbox le stringifie ; `check-sw-api-cache.mjs` le fait
               décider depuis sw.js. */
            plugins: [mediaCacheFreshnessPlugin],
          },
        },
        {
          /* PAS L'ADMINISTRATION (#6862), PAS LES MÉDIAS (#6973) —
             `API_RESPONSE_CACHE_PATTERN` porte les deux règles et son
             motif : une conversation privée lue en régime souverain ne
             doit pas rester sept jours sur le disque du poste, dans un
             seau qu'`AdminAuditLog` ignore ; et les 200 entrées de ce
             seau sont RÉSERVÉES au JSON, sans quoi un défilement de fil
             chasse la lecture hors ligne.
             Une VALEUR, jamais un prédicat importé : Workbox stringifie
             ce champ dans `dist/sw.js`, où aucun import ne le suit —
             `check-sw-api-cache.mjs` fait décider l'artefact construit. */
          urlPattern: API_RESPONSE_CACHE_PATTERN,
          handler: 'NetworkFirst',
          options: {
            cacheName: SW_RUNTIME_CACHES.api,
            /* AUCUN `networkTimeoutSeconds` (#9637) : la copie ne sert
               que si le réseau ÉCHOUE. Sur un délai, un lecteur en
               ligne recevait une liste rangée qui écrasait l'aperçu
               posé par le temps réel ; l'instantané est l'affaire du
               cache persisté de TanStack. */
            expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            /* CHAQUE RÉPONSE SOUS L'IDENTITÉ QUI L'A DEMANDÉE (#8674) :
               sans lui, deux comptes du même appareil partageaient
               l'entrée d'une URL, et un réseau lent servait à B la
               réponse d'A. Autonome — Workbox le stringifie ;
               `check-sw-api-cache.mjs` le fait décider depuis sw.js. */
            plugins: [apiCacheIdentityPlugin],
          },
        },
        /* AUDIO ET VIDÉO RESTENT HORS CACHE, ET C'EST UNE DÉCISION
           (#6973 point 5) — pas un oubli, et surtout pas une règle qui
           AURAIT L'AIR de les couvrir.
           Leur `src` traverse la même route de flux que les images ;
           `API_RESPONSE_CACHE_PATTERN` l'excluant et le seau des médias
           ne matchant que `destination === 'image'`, aucune route ne les
           réclame : ils partent en réseau nu, et leur lecture
           progressive reste intacte.
           Les couvrir coûterait DEUX choses qu'on refuse. D'abord un
           `RangeRequestsPlugin` : un élément média demande d'emblée un
           `Range`, la passerelle rend `206`
           (`download.ts`, § « Supports Range requests for audio/video
           seeking »), et une `206` n'est ni stockable ni resservable
           sans lui — or le plugin sert une tranche depuis une réponse
           ENTIÈRE en cache, donc il faudrait télécharger la vidéo
           COMPLÈTE avant la première image : une régression de fluidité
           déguisée en optimisation. Ensuite le quota : une vidéo de fil
           pèse des dizaines de mégaoctets, et trois d'entre elles
           videraient par éviction le seau qu'on vient de réserver aux
           avatars et aux scènes. Le jour où un vocal doit s'écouter
           hors ligne, il lui faudra son PROPRE seau, avec son propre
           plafond et son `rangeRequests` — pas une ligne de plus ici. */
      ],
    },
  });
}
