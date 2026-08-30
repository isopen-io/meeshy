# Meeshy Web v3 — Document de conception (version FINALE)

> **Statut** : spécification d'exécution. C'est le document sur lequel une routine planifiée d'agents travaille sans revenir demander. Il décrit la CIBLE et les MÉCANISMES ; **l'ÉTAT vit dans les issues GitHub** (`isopen-io/meeshy`, projet #1 « Meeshy — pilotage »), jamais ici. Aucune ligne de ce fichier ne se coche.
>
> **Décisions du porteur, non négociables, qui priment sur tout ce qui suit** : (1) la v3 est une application NEUVE dans `apps/web-v3` ; `apps/web` reste vif et sert le trafic ; (2) le développement est mené par une routine planifiée + un workflow versionné dans `.claude/workflows/` ; (3) la routine POUSSE DIRECTEMENT sur `dev` sous gates obligatoires, sans PR par lot ; (4) aucune feature sans issue.
>
> **Sources de vérité lues** : `docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html` (1155 lignes), `docs/product/MeeshyWebV3Design/vues.json` (37 vues, index machine), `docs/product/MeeshyWebV3Design/capture-cibles.js` (harnais de captures, commité et fonctionnel), `docs/product/api-simplification/*.md`, `apps/web/`, `services/gateway/src/`, `packages/shared/`, `bun.lock`, `docker-compose.prod.yml`, `Makefile`, `.github/workflows/{ci,docker}.yml`.

---

## 1. La thèse

**La v3 web est le chemin PUBLIC de Meeshy, rendu par le serveur, servi depuis l'apex `meeshy.me` chemin par chemin, à côté de `apps/web` qui continue de tourner.** Un lien reçu dans WhatsApp doit s'ouvrir sur du contenu — pas sur un mur d'authentification, pas sur un spinner d'hydratation, pas sur une preview vide — et le visiteur doit pouvoir **lire intégralement** (story, reel, post, mood, conversation partagée) puis **participer en tant qu'anonyme**, sur un téléphone en 3G, sans compte et sans configuration. Tout le reste — inscription, connexion, gestion de SES conversations, messages, liens de partage, liens de tracking, posts, stories, reels, humeurs — est le rôle SECONDAIRE : même application, même palette, mêmes composants, avec le droit de coûter plus cher en octets.

**Ce que la v3 n'est PAS :**

- **Ce n'est pas un fork de `apps/web`.** C'est un package Next SÉPARÉ (`apps/web-v3`), avec son propre arbre `app/`, son propre `next.config.ts`, sa propre image Docker, son propre service Traefik. Il n'y a donc **aucune collision de routes Next** — deux packages, deux arbres, aucune résolution parallèle. Ce que la v3 « réutilise » de `apps/web`, elle le **copie explicitement** (`apps/web` n'est pas un workspace importable) ; ce qu'elle partage, elle l'importe de `@meeshy/shared`.
- **Ce n'est pas un big-bang.** La bascule se fait **une route à la fois**, en ajoutant un `PathPrefix` au routeur Traefik `frontend-v3` ; le retour arrière est le retrait de ce même préfixe. Rien n'est supprimé au moment d'une bascule. Le décommissionnement de `apps/web` est un **milestone séparé**, ouvert seulement quand le routeur legacy ne sert plus aucune route.
- **Ce n'est pas une réécriture du socle.** Next 15.5.23 / React 19.2.7 / TanStack Query / Socket.IO / `packages/shared` restent. `resolvePrismTranslation()`, `resolveSharedAccess()`, `GET /sync`, le persister IndexedDB, `use-post-room.ts`, `use-post-socket-cache-sync.ts` sont **réutilisés**, jamais réécrits.
- **Ce n'est pas une reproduction pixel de la planche.** La planche fait foi sur la **disposition, la hiérarchie, les états et les gestes**. Ses `<div onClick>` (mesuré aujourd'hui : **350 `<div>`, 0 `<header>/<nav>/<main>`, 0 `aria-hidden`** dans `MeeshyWebV3.dc.html`), sa fonte d'icônes complète et sa typographie sont explicitement écartés — écart assumé, comme la doctrine MeeshyComposer l'a établi pour iOS.

---

## 2. La stack retenue

**Règle de lecture du tableau** : une version marquée « **résolu** » a été lue dans `bun.lock` à la date de ce document. Une version marquée « **déclaré** » vient d'un `package.json` et **diverge** du lockfile — c'est un fait, pas une approximation. Un poids marqué « **mesuré** » a été produit par une commande reproductible, citée. Un poids marqué « **à établir (L-0.5)** » n'a pas de chiffre : il n'y en aura qu'après le premier `next build` de `apps/web-v3`, et **aucun agent n'a le droit d'en inventer un**.

> **Fait à traiter en L-0.5** : `bun.lock` est en retard sur les `package.json`. Mesuré : `react@19.2.7` / `react-dom@19.2.7` résolus alors que `apps/web/package.json` déclare `^19.2.8` ; `zustand@5.0.14` résolu (pas 5.0.15) ; `idb-keyval@6.3.0` résolu (pas 6.2.2) ; `@playwright/test` résolu **deux fois** — `1.61.1` à la racine (harnais `tests/playwright.config.ts`, mort : il pointe `../frontend`) et `1.62.1` pour le workspace `@meeshy/web`. Une issue L-0.5 « le lockfile et les manifestes disent la même chose » précède toute mesure de poids.

| Préoccupation | Choix | Version EXACTE | Poids gzip (client) | Pourquoi | Alternative rejetée |
|---|---|---|---|---|---|
| **Framework** | Next.js App Router, package séparé `apps/web-v3` | `next@15.5.23` (résolu) | plancher **à établir (L-0.5)** — mesuré par `check-bundle-budget.mjs` au premier build | Seul moyen d'avoir `generateMetadata`/`next/og` par contenu ET la jonction anonyme→inscrit sans changer d'origine. Même origine que le legacy ⇒ le cookie `meeshy_session` (`apps/web/middleware.ts:8`, sans `Domain=`) suit à travers la frontière de zone. | **Astro/Vite `apps/web-lite`** : duplique à vie tout composant partagé entre rôles et fragmente le déploiement. **Sous-domaine `v3.meeshy.me`** : impossible — les liens `/l/<token>` déjà partagés pointent l'apex (§ 4). |
| **Rendu — rôle premier** | Server Components par défaut sous `app/(public)/`, îlots `'use client'` nommés | `react@19.2.7` / `react-dom@19.2.7` (résolus ; `^19.2.8` déclaré) | îlots seuls | Aujourd'hui `apps/web/app/story/[postId]/page.tsx`, `app/reel/[postId]/page.tsx` et **`apps/web/app/feeds/post/[postId]/page.tsx`** (le vrai porteur de `'use client'` ; `app/post/[postId]/page.tsx` n'est qu'un ré-export de 3 lignes) sont clients en première ligne : 0 route sur 7 n'exporte `generateMetadata`. **Et le vrai mur est ailleurs** : la story deep-linkée est derrière `AuthGuard requireAuth` monté dans `components/feed/FeedProviders.tsx:22`. | **Coquille RSC déléguant au client existant** : répare l'OG pour le crawler, ne retire pas un octet pour l'humain. |
| **Rendu — `/l/:token`** | Route Handler serveur : `resolve` + clic en un appel serveur-à-serveur, réponse **302**, HTML de repli porteur des OG réels ; fingerprint en `sendBeacon` **après** | — | **0 Ko JS** | `apps/web/app/l/[token]/page.tsx` fait 550 lignes `'use client'` et enchaîne POST-clic **puis** GET-resolve avant toute redirection ; son `layout.tsx` a `title:''`, `description:''`, `images:[]`. | **Optimiser la page cliente** : paie le plancher framework de sa page hôte + un aller-retour de trop. |
| **Icônes** | Sprite SVG `<symbol>/<use>`, `packages/icons/sprite.svg`, généré depuis `@phosphor-icons/core`, **exactement les 72 glyphes** de la planche | `@phosphor-icons/core@2.1.1` (devDep) | **8,8 Ko gzip / 29,4 Ko brut — mesuré** (sprite des 72 symboles, `viewBox 0 0 256 256`) | La fonte `@phosphor-icons/web` coûte **224 Ko** (144 Ko woff2 regular + 80 Ko css) pour une graisse, soit **25×** le sprite ; les 72 icônes existent toutes dans `assets/regular/` (1512 disponibles, aucune manquante). Le `<use>` s'affiche **sans JS exécuté**. Liste extractible : `grep -o 'ph-[a-z0-9-]*' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html \| sort -u` (rend 73 jetons = 72 glyphes + `ph-fill`). | **`@phosphor-icons/react`** : bundle les 6 poids par icône. **Fonte** : 25× plus lourde, et `unpkg.com` est bloqué (403) par la politique d'egress. |
| **Styles & jetons** | Tailwind (utilitaires) + `packages/design-tokens/tokens.css` — **unique** table de custom properties, importée par `apps/web-v3/app/globals.css` | `tailwindcss@3.4.19` (résolu) | CSS purgé — **à établir (L-0.5)**, plafond 20 Ko gzip/route | Ferme les trois têtes de `apps/web` : `:root` shadcn HSL + `--gp-*` de `globals.css` + `components/v2/theme.ts` (objet JS hex dupliqué), plus 254 hex en dur dans 41 `.tsx`. `ds-shim.css` (déjà commité dans `docs/product/MeeshyWebV3Design/`) est la reconstitution des jetons de la planche : il **alimente** `tokens.css`, il ne le remplace pas. | **Tailwind v4** : gain de build réel, hors chemin critique ; chantier séparé. |
| **Thème dark/light/system sans FOUC** | **UNE** source : `darkMode: ["class"]`. `ThemeScript` inline **obligatoire dans le layout racine**, y compris `(public)` : il lit `localStorage` puis, à défaut, `matchMedia('(prefers-color-scheme: dark)')`, et pose la classe **avant le premier pixel**. `color-scheme` suit la classe. **ZÉRO `@media (prefers-color-scheme)` dans `tokens.css`.** | — | **≤ 400 o inline** (gate) | L'hybride « media pour les tokens + classe pour Tailwind » est une **jumelle divergente** : utilisateur en préférence explicite CLAIRE sur OS SOMBRE ⇒ tokens sombres, utilitaires `dark:` clairs. `prefers-color-scheme` ne gouverne donc QUE la valeur par défaut de la classe, jamais un token. | **`next-themes`** : déclaré dans `apps/web/package.json`, **0 import** — l'activer ajouterait un moteur ; il ne sera pas installé dans la v3. **Deux moteurs simultanés** (le défaut actuel de `apps/web` : `app/layout.tsx:100` + `app/(connected)/layout.tsx:24-25`, clés `meeshy-app` vs `gp-theme-mode`). |
| **État client** | Zustand, UI éphémère uniquement (ouverture de feuille, brouillon, filtre) | `zustand@5.0.14` (**résolu** ; le doc précédent disait 5.0.15) | ~0,6 Ko — **à confirmer (L-0.5)** | Convention `CLAUDE.md`. Le thème et le cache réseau en sortent. | **Redux Toolkit / Jotai** : réécriture sans capacité manquante. |
| **Cache persistant** | TanStack Query + persister IndexedDB (`idb-keyval`), `staleTime: Infinity`, `VOLATILE_ROOTS` | `@tanstack/react-query@5.101.4` (**résolu**) / `idb-keyval@6.3.0` (**résolu**) | **à établir (L-0.5)** | Sous-système déjà cache-first. Toute donnée serveur passe par `useQuery` — interdit de refaire `hooks/conversations/use-participants.ts` (188 lignes `useState`/`useEffect`, rappelé sans garde par `components/conversations/ConversationLayout.tsx:493`). | **SWR** : 2ᵉ lib de cache. |
| **Delta / rattrapage** | `GET /sync` (`services/gateway/src/routes/sync.ts` — ETag/304, cursor keyset, `hasGap`, plafond 512 Ko/page, `allowAnonymous: true` lignes 452-473) | existant | 0 Ko | **Aucun appelant `/sync` dans `apps/web`** (grep vérifié), alors que le web réimplémente deux moteurs plus pauvres. Un 304 quasi-vide remplace un JSON complet à chaque reprise. | **Garder les deux moteurs maison** : double maintenance d'une idée déjà payée. |
| **Transport temps réel — LECTURE anonyme** | **AUCUN.** Rendu serveur + revalidation au retour de focus (`visibilitychange:visible` → `router.refresh()`). | — | **0 Ko, 0 connexion tenue** | Le fan-out temps réel d'un post **existe déjà** sur le socket (`ROOMS.post` — `packages/shared/types/socketio-events.ts:113`, `POST_JOIN`/`POST_LEAVE` `:683-684`, `PostReactionHandler.handleJoinPost:471-521`) et il est **auth-gaté par décision écrite** (`PostReactionHandler.ts:470` : « anonymous sockets cannot subscribe to post rooms »). En construire un second dupliquerait `resolveConsumptionTarget`, c'est-à-dire la garde de VISIBILITÉ. | **SSE (`EventSource`)** : **ANNULÉ, pas différé**. `grep -rn "text/event-stream" services/gateway/src` = **0 occurrence** (tout est à construire) ; SSE tient une connexion par visiteur ET par contenu (il ne multiplexe pas) — l'argument de « scalabilité » se réfute lui-même ; et le lecteur anonyme est de toute façon bloqué **en amont** par deux `requiredAuth` (§ 5). |
| **Transport temps réel — PARTICIPATION** | **UN** Manager `socket.io-client`, chargé en `await import()` **au tap « Rejoindre »**, jamais à la lecture | `socket.io-client@4.8.3` (résolu) | **12 796 o gzip (ESM) / 14 626 o (UMD) — mesuré** `gzip -9` | La participation est bidirectionnelle (envoyer, frappe, accusés) : SSE y est structurellement inapte. L'anonyme est **déjà** supporté (`AuthHandler.ts:93-108` → `_authenticateAnonymousUser:320`), backoff durci (`connection.service.ts:203-206` : 1 s→30 s, jitter 0.5). **Fait serveur à écrire correctement** : `grep -rn "\.of(" services/gateway/src` = **0 occurrence** — le gateway n'a **aucun namespace** Socket.IO ; tout vit dans le namespace par défaut et la séparation se fait par **ROOMS**. Les 3 `io(...)` de `apps/web` sont 3 connexions redondantes vers le même namespace. | **WebTransport** (non supporté WebKit ⇒ mort pour les navigateurs in-app iOS). **WebSocket brut** (réimplémente backoff/ACK/multiplexage déjà durcis). |
| **File hors-ligne** | `lib/realtime/queue/offline-queue.ts`, extraite de `apps/web/services/socketio/orchestrator.service.ts` (911 l.), persistée via `idb-keyval` | — | ~1 Ko — **à confirmer** | Le patron existe et marche (`MAX_QUEUE_SIZE`, `MESSAGE_QUEUE_TIMEOUT=120000`) mais est noyé dans le transport. | **`workbox-background-sync`** : rejoue des `fetch()`, or nos mutations partent en émissions Socket.IO. |
| **i18n** | Dictionnaire clé→valeur, import dynamique par namespace (patron de `apps/web/hooks/use-i18n.ts`, LRU 80) ; `Intl.*` natif ; **`RTL_LOCALES` posant `dir="rtl"`** ; **règle neuve : `lang="xx"` sur tout nœud rendu par le Prisme dans une langue ≠ langue d'interface** | — | 0 Ko + JSON à la demande | Vérifié dans `apps/web` : `grep 'lang={'` ne remonte que 3 fichiers, et `components/v2/TranslationToggle.tsx` n'en pose dans **aucune** branche de rendu — un lecteur d'écran anglais prononce une bulle française en phonétique anglaise. Défaut de Prisme au sens du cycle 123 (« qu'est-ce qui part À CÔTÉ »). | **`next-intl`** (408 Ko, explicitement désactivé dans `apps/web/next.config.ts:2-6`). |
| **Formulaires** | `<form action={serverAction}>` natif + **Zod** partagé (`packages/shared`) exécuté serveur ; `useFormStatus`/`useActionState` ; **aucun formulaire du rôle premier ne dépend du JS pour se soumettre** | `zod@4.4.3` (résolu) | 0 Ko nouveau | Rejoindre en anonyme doit fonctionner sans hydratation. Zod est déjà la validation partagée gateway↔web. | **react-hook-form** : ~12 Ko pour 4 champs, casse la soumission sans JS. |
| **Tests unitaires** | Jest + React Testing Library + **`jest-axe`** sur tout composant `(public)` | `jest@30.4.2` (résolu) | 0 (devDep) | TDD non négociable ; `jest-axe` transforme l'a11y en cycle RED/GREEN. | **Vitest** : 2ᵉ runner. |
| **Tests visuels** | Playwright + `pixelmatch`/`pngjs`/`sharp` pour un **score par région** ; `@axe-core/playwright` pour le structurel | `@playwright/test@1.62.1` (résolu pour `@meeshy/web` ; **1.61.1 aussi résolu à la racine** — double résolution à solder en L-0.5) ; `pngjs@5.0.0`, `sharp@0.35.3` (résolus) | 0 (devDep) | `apps/web/e2e/message-composer-animations.spec.ts` prouve déjà `toHaveScreenshot` + Web Vitals dans ce dépôt ; il manque un **score chiffré** cible-vs-rendu. Chromium local : `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`). | **`toHaveScreenshot` seul** : verdict binaire, inutilisable comme gate gradué. |
| **Analyse de bundle** | `@next/bundle-analyzer` + `scripts/check-bundle-budget.mjs` lisant **`apps/web-v3/.next/app-build-manifest.json`** ; **échec CI si un plafond de route est dépassé** | — | 0 | Mesuré : **ce script n'existe pas** (`find . -name check-bundle-budget.mjs` = rien) — il est livré par L-0.5. La v3 naît **sans** `ignoreBuildErrors` : son type-check va dans le job BLOQUANT `ci.yml:142`, **jamais** dans le ratchet de dette `ci.yml:144-145` (gagé sur `apps/web`, `WEB_BASELINE=1194`). | **Mesure manuelle ponctuelle** : ne tient pas sur des dizaines d'itérations d'agents. |

---

## 3. L'architecture

### 3.1 La règle de placement (deux phrases, parce qu'il y a deux décisions)

> **(A) ROUTE.** Une route va sous `app/(public)/` si elle rend du contenu **sans compte**, sous `app/(connected)/` si elle **exige un compte**, sous `app/(admin)/` si elle exige un **rôle ≥ MODERATOR** ; une Route Handler qui sert une **machine** (OG, `.well-known`, webhook, health) vit sous `app/api/` ou à son chemin protocolaire, hors des trois groupes.
>
> **(B) COMPOSANT.** Un composant vit **sous la surface qui le rend** ; dès qu'une **SECONDE** surface l'importe, il remonte d'un cran dans `components/<préoccupation>/` — et **jamais** dans `components/ui/`, qui ne contient que des primitives **sans domaine**.

L'ancienne règle unique partitionnait par AUDIENCE pendant que l'arborescence rangeait par PRÉOCCUPATION : deux axes qui se croisent ne décident pas. Les deux phrases ci-dessus décident, et voici leur **test opposable** sur cinq fichiers réels — verdicts publiés, comme l'exige la revue :

| Fichier réel | Question | Verdict par la règle | Destination v3 |
|---|---|---|---|
| `apps/web/components/v2/TranslationToggle.tsx` (367 l., importé par `PostCard`, `PostDetail`, `StoryViewer`, `CommentItem`, `StatusBar`) | Composant, ≥ 2 surfaces | (B) : remonte dans `components/<préoccupation>` ; sa préoccupation est le Prisme | `apps/web-v3/components/prism/TranslationToggle.tsx` — **pas** `ui/` (il porte un domaine) |
| `MessageBubble` (rendu par `/c/:key` public **et** `/chats` connecté) | Composant, 2 surfaces, 2 audiences | (B) : l'audience n'entre pas dans la décision d'un composant | `apps/web-v3/components/conversations/bubble/MessageBubble.tsx` |
| `apps/web/app/api/og/[type]/[id]/route.tsx` | Route servant une **machine** (crawler) | (A) : hors des trois groupes | `apps/web-v3/app/api/og/[type]/[id]/route.tsx` |
| `apps/web/app/.well-known/apple-app-site-association/route.ts` | Route protocolaire | (A) : hors groupes — **et interdite à la v3** tant qu'elle n'est pas portée (§ 4.5) | reste sur `apps/web` |
| `apps/web/app/admin/*` (**23 `page.tsx` mesurés**) | Routes exigeant un rôle | (A) : `(admin)` — **et hors périmètre v3** | reste sur `apps/web`, servi par le routeur legacy (§ 4.4) |

### 3.2 Trois corollaires exécutoires

1. **Aucun fichier de `app/` ou `components/` n'importe `socket.io-client` ni `idb-keyval` directement.** Le temps réel s'expose en **deux fichiers, jamais un barrel** : `lib/realtime/read.ts` (revalidation au focus, lecture de cache — **aucun transport**, importable statiquement) et `lib/realtime/participate.ts` (le socket, chargé **uniquement** par `await import()`). Gate ESLint : **import statique de `participate` depuis `app/(public)/` = erreur**. *Empêche* : les 3 `io(...)` concurrents de `apps/web` (`services/socketio/connection.service.ts:196`, `services/notification-socketio.singleton.ts:119`, `services/websocket.service.ts:107`), et le barrel qui pousserait 12,8 Ko dans le chunk `(public)` que le § 8 interdit.
2. **Aucun composant ne redéclare une couleur, un rayon ou une police** — uniquement les jetons de `packages/design-tokens/tokens.css`. *Empêche* : les 3 tables de couleurs de `apps/web` et les 254 hex en dur.
3. **Aucun composant ne réimplémente la résolution de langue** — uniquement `resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`). *Empêche* : la famille de résolveurs trouvée dans `apps/web/components/feed/ReelPlayer.tsx:54-85` (lookup rang-1 `post.translations[userLanguage]`, sans normalisation).
4. **Corollaire de zone (neuf, § 4)** : **tout lien qui sort du périmètre v3 est un `<a href>` réel, jamais un `<Link>`** — la navigation client-side de Next ne traverse pas une frontière de zone. Garanti par un lint.
5. **Corollaire de découpage (neuf)** : un dossier de composants qui dépasse **40 fichiers** se scinde par sous-surface. `apps/web/components/conversations/` en compte **190** aujourd'hui : c'est le point de rupture déjà franchi. La v3 naît scindée (`thread/`, `composer/`, `media/`, `bubble/`). **Aucun dossier `conversation/` au singulier** — `apps/web` a déjà `video-call/` ET `video-calls/`, la divergence à une lettre est un fait constaté, pas une hypothèse.

### 3.3 Arborescence

```
packages/
  design-tokens/                 # NOUVEAU — UNE table de custom properties
    tokens.css                   #   consommée par apps/web-v3/app/globals.css ET le harnais visuel
    dark.css  light.css          #   redéfinitions par schéma ; aucune valeur hors de ces 3 fichiers
    README.md                    #   dit d'où viennent les valeurs (ds-shim.css reconstitué)
  icons/                         # NOUVEAU — sprite des 72 glyphes + son générateur
    sprite.svg                   #   généré depuis @phosphor-icons/core@2.1.1, COMMITÉ
    critical.svg                 #   sous-sprite ≤ 8 glyphes, inliné dans le layout (§ 8)
    scripts/build-sprite.ts
  shared/                        # INCHANGÉ — Prisme, types, Zod, événements Socket.IO (SSOT)

apps/web-v3/                     # NOUVEAU package Next — port 3300, assetPrefix '/__v3'
  next.config.ts                 # output:'standalone', assetPrefix:'/__v3', AUCUN basePath
  Dockerfile                     # calqué sur apps/web/Dockerfile (contexte monorepo, standalone)
  app/
    layout.tsx                   # coquille SERVEUR : <html>, tokens.css, ThemeScript inline,
                                 #   sous-sprite critique. AUCUN provider client ici.
    (public)/                    # RÔLE PREMIER — jamais d'AuthGuard, RSC par défaut
      layout.tsx                 #   serveur : landmarks <header>/<main>/<nav>, skip-link, i18n statique
      l/[token]/route.ts         #   Route Handler : resolve+click+302+OG. 0 Ko JS.
      l/[token]/expired/page.tsx
      stories/[id]/page.tsx      #   + îlot progression/traduction
      posts/[id]/page.tsx        #   post + commentaires
      reels/[id]/page.tsx
      moods/[id]/page.tsx        #   Post type=STATUS
      chats/[key]/page.tsx       #   join / rights / thread — resolveSharedAccess() SERVEUR
      login/  signup/
    (connected)/                 # RÔLE SECONDAIRE — AuthGuard ICI, et nulle part ailleurs
      layout.tsx                 #   QueryProvider, PresenceProvider. PAS de CallManager (§ 8).
      page.tsx  chats/  feed/  composer/  links/  notifications/  settings/
      contacts/  communities/  calls/  search/  stories/new/
    api/og/[type]/[id]/route.tsx
  components/
    ui/                          # primitives SANS domaine : Dialog(<dialog>), Sheet, Icon(<use>),
                                 #   Field, Button — UN seul paradigme d'interaction
    prism/                       # TranslationToggle, PrismText (pose lang=), AudioTrack
    reader/                      # StoryReader, ReelReader, PostReader, CommentThread
    conversations/               # scindé dès la naissance :
      thread/  composer/  media/  bubble/
  lib/
    realtime/
      read.ts                    # revalidation au focus — AUCUN transport
      participate.ts             # le socket — await import() SEULEMENT
      lifecycle.ts               # UN site pour visibilitychange / pageshow / pagehide{persisted}
                                 #   / online / offline / storage / BroadcastChannel  (§ 6)
      queue/offline-queue.ts     # extraite d'orchestrator.service.ts
      sync/delta-client.ts       # GET /sync (ETag/304, hasGap)
      reconnect-policy.ts        # UNE politique de backoff (1s→30s, jitter .5)
    api/
      guest-session.ts           # UNIQUE détenteur du jeton invité, rangé par lien (§ 6)
      links.ts  social.ts  messaging.ts  identity.ts
    a11y/                        # lang-attr, RTL_LOCALES, focus utils
  e2e/visual/                    # machine de vérification (§ 9)
  scripts/check-bundle-budget.mjs

docs/product/MeeshyWebV3Design/  # EXISTANT ET COMMITÉ (§ 9)
  MeeshyWebV3.dc.html  capture-cibles.js  ds-shim.css  support.js
  cible/*.png (37)  vues.json  vues.md
  ordre-des-ecrans.sh            # NOUVEAU — gate d'acyclicité (§ 10)
  ordre.md                       # NOUVEAU — l'ordre PUBLIÉ, généré, jamais écrit
```

**Ce qui ne fait PAS partie du chantier v3** : les suppressions dans `apps/web` (`services/websocket.service.ts`, `components/providers/ThemeProvider.tsx`, `components/v2/theme.ts`, `services/markdown-parser-v2.2-optimized.ts` (**1054 lignes mesurées**) + `services/markdown/` (**1464 lignes**), les 7 dépendances mortes, `components/video-call*`). Ce sont des issues d'un **milestone de décommissionnement séparé**, ouvert seulement quand le routeur legacy ne sert plus aucune route (§ 4.7).

---

## 4. Le déploiement et la cohabitation

### 4.1 Le principe

**La v3 ne prend aucun nouveau domaine public.** Elle est servie depuis l'apex `meeshy.me` par un **second routeur Traefik** de priorité supérieure, dont la règle liste explicitement les chemins qu'elle sert. Le routeur legacy reste **intact** en plancher attrape-tout.

**Pourquoi l'apex et pas `v3.meeshy.me`** — deux faits durs :

1. `services/gateway/src/services/TrackingLinkService.ts:22` (`resolveFrontendBaseUrl()`, fallback `https://meeshy.me`) et `:76` (`buildTrackingUrl` → `${base}/l/${token}`) **MINTENT et PERSISTENT** les URLs `/l/<token>` dans les messages et les posts. `docker-compose.prod.yml:233` fixe `FRONTEND_URL`, `:368` `NEXT_PUBLIC_FRONTEND_URL=https://${DOMAIN}`. **Les liens déjà partagés dans WhatsApp pointent l'apex** : un sous-domaine ne les servira jamais — et c'est le rôle PREMIER.
2. `apps/web/middleware.ts:8` lit le cookie `meeshy_session`, **non marqué `Domain=`**. Sur un sous-domaine il ne suivrait pas ; sur l'apex, un visiteur qui s'inscrit sur une route v3 et retombe sur une route legacy **reste connecté**.

### 4.2 Le levier existe déjà et n'est pas utilisé

Mesuré : `docker-compose.prod.yml:401-406` — routeur `frontend`, règle ``Host(`${DOMAIN}`) || Host(`www.${DOMAIN}`)``, service port 3100, **`traefik.http.routers.frontend.priority=1`** — la priorité la plus basse. Tout routeur de priorité supérieure sur le même host le supplante **sans le toucher**.

Le patron « PathPrefix + priorité au-dessus du frontend » est **déjà pratiqué dans le dépôt** : `docker-compose.local.yml:267,271` (`translator-ip`, `/ml`, priority=15), `:350,354` (`gateway-ip`, `/api`, priority=10), `:385,389` (`static-ip`, `/static`, priority=12), tous face au même `frontend.priority=1` (`:442`). Traefik est en provider docker avec `exposedbydefault=false` et watch du socket (`docker-compose.prod.yml:28-31, 39`) : **ajouter ou retirer un PathPrefix est un `docker compose up -d`**, sans rebuild d'image, sans DNS, sans coupure du legacy.

### 4.3 La règle Traefik de la v3

```yaml
  frontend-v3:
    image: ${FRONTEND_V3_IMAGE:-isopen/meeshy-web-v3:latest}
    container_name: meeshy-frontend-v3
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend-v3.rule=(Host(`${DOMAIN}`) || Host(`www.${DOMAIN}`)) && (PathPrefix(`/__v3`))"
      - "traefik.http.routers.frontend-v3.entrypoints=websecure"
      - "traefik.http.routers.frontend-v3.tls.certresolver=letsencrypt"
      - "traefik.http.routers.frontend-v3.middlewares=compress@file"
      - "traefik.http.services.frontend-v3.loadbalancer.server.port=3300"
      - "traefik.http.routers.frontend-v3.priority=100"
```

**Migrer une route = ajouter un `PathPrefix` à cette ligne. Revenir en arrière = l'enlever.** Rien d'autre ne bouge.

### 4.4 La collision `/_next/*` — défaut neuf, non relevé par la revue

Mesuré : `grep -n "assetPrefix\|basePath" apps/web/next.config.ts apps/web/next.config.security.js` = **0 occurrence** ; `apps/web/next.config.ts:22` pose seulement `output: 'standalone'`. Les deux applications serviraient donc leurs chunks à `/_next/static/...`. Dès que Traefik envoie `/l` à la v3 en laissant `/` au legacy, une page v3 demande `/_next/static/chunks/*.js` qui retombe sur le routeur attrape-tout ⇒ **404 de chunk ⇒ page blanche**. Invisible en CI, visible au premier déploiement.

**Correctif obligatoire, à écrire en L-0.5** : `apps/web-v3/next.config.ts` pose **`assetPrefix: '/__v3'`** (Next sert alors `${assetPrefix}/_next/...`, `/_next/image` suit) et `PathPrefix('/__v3')` figure **en permanence** dans la règle du routeur v3. **Aucun `basePath`** : il changerait les URLs publiques, or `/l/:token` et `/stories/:id` doivent rester à l'identique. C'est le patron Multi-Zones de Next, Traefik jouant le routeur de zone.

**Corollaire** : `tout chemin absent de la règle` **`frontend-v3`** `est servi par apps/web`. Les 23 routes `app/admin/*` et les 12 routes d'authentification existantes (`auth/magic-link`, `auth/magic-link/validate`, `auth/verify-2fa`, `auth/verify-email`, `auth/verify-phone`, `forgot-password`, `forgot-password/check-email`, `reset-password`, `signup/affiliate/[token]`, `account/deletion`, `settings/verify-email-change`, `auth-status`) restent donc servies **par défaut, sans action**. La matrice du § 10 est **honnêtement incomplète**, pas faussement exhaustive.

### 4.5 L'interdit des liens universels iOS

`apps/web/app/.well-known/apple-app-site-association/route.ts:8-24` déclare `/l/*`, `/chat/*`, `/c/*`, `/story/*`, `/s/*`, `/post/*`, `/p/*`, `/u/*` pour `D72UK7R5RE.me.meeshy.app`, servi depuis l'apex.

> **La v3 ne sert JAMAIS `/.well-known/*`** tant que cette route n'est pas portée. Le chemin reste au routeur attrape-tout. Sinon les liens universels iOS meurent **en silence** sur exactement les chemins que la v3 revendique.

### 4.6 Dev

- **Port 3300.** Vérifié libre : `grep -rn "3300" Makefile docker-compose*.yml apps/web/package.json` = **0 occurrence**. Pris : 3000 gateway, 3001 mongo-ui, 3100 web, 3200 agent, 5555/5558 ZMQ, 6379, 7843, 8000, 27017.
- **Nettoyage préalable obligatoire (L-0.5)** : le `Makefile` référence un précédent **mort et en conflit** — `WEB_V2_DIR := apps/web_v2` (ligne 88), `WEB_V2_PID` (:102), fenêtres tmux `web_v2` (:1213-1214 et :1534-1535) — or `apps/` ne contient que `android`, `docs`, `ios`, `web` : **`apps/web_v2` n'existe pas**, et cette fenêtre morte est assignée au **port 3200, déjà celui de l'agent**. Laisser ce précédent cassé garantit qu'un agent le copiera.
- Fenêtre tmux `web_v3` sur 3300 dans `_dev-tmux-domain` (Makefile:1198) et `_dev-tmux-network` (Makefile:1529).
- **CORS** : en dev les deux zones sont sur des **ports différents** (donc cross-origin) alors qu'en prod elles sont same-origin. Ajouter l'origine `:3300` à `CORS_ORIGINS`/`ALLOWED_ORIGINS` — `docker-compose.dev.yml:229-230`, `Makefile:333-334`, `:1134`, `:1455`.

### 4.7 CI/CD — la v3 ne se construit pas aujourd'hui

Mesuré :
- `.github/workflows/docker.yml:24` filtre `paths: 'apps/web/**'` — le glob **ne couvre pas** `apps/web-v3/`.
- Le détecteur `:145` teste `[[ "$CHANGED" == *"apps/web/"* ]]` — la chaîne `apps/web-v3/` **ne contient pas** `apps/web/`.
- `ci.yml:172-181` (matrice de tests : shared, web, gateway, agent) n'a **pas** d'entrée v3.

**À livrer en L-0.5** : entrée `paths: 'apps/web-v3/**'`, détecteur `*"apps/web-v3/"*`, entrée de matrice d'image `meeshy-web-v3`, entrée dans la matrice de tests, et **type-check dans le job BLOQUANT `ci.yml:142`, jamais dans le ratchet `ci.yml:144-145`** (gagé sur `apps/web`) — la v3 naît à zéro erreur.

> **Piège de nommage** : le dispatch `docker.yml:133` teste `*"web"*`. Un service nommé `web-v3` déclencherait **aussi** le build du legacy. Nommer la clé de service et le filtre de façon **disjointe**.

### 4.8 Prod — comment ça arrive sur la machine

`scripts/meeshy-deploy.sh:125` copie le compose vers `deploy_dir/docker-compose.yml`, `:202-205` le `scp` vers `/opt/meeshy/`, `:324-327` `docker-compose pull`. Le `CLAUDE.md` racine rappelle que **le compose de production DIFFÈRE du dépôt** : le service `frontend-v3` et ses labels doivent être appliqués sur `/opt/meeshy/production/docker-compose.yml`, pas seulement commités.

### 4.9 L'ordre de bascule

| Étape | `PathPrefix` ajoutés | Ce que ça bascule | Retour arrière |
|---|---|---|---|
| 1 | `/__v3` | rien (v3 en ligne, **zéro trafic**) | — |
| 2 | `/l` | **le rôle premier**, une seule route | retirer `/l` |
| 3 | `/stories`, `/reels`, `/posts`, `/moods` | la lecture partagée | idem |
| 4 | `/chats` | la participation anonyme | idem |
| 5 | `/login`, `/signup` | l'entrée dans le compte | idem |
| 6 | `/feed`, `/composer`, `/links`, `/notifications`, `/settings`, `/contacts`, `/search` | le rôle secondaire | idem |
| 7 | `/` | **vide le routeur legacy** | idem |

**C'est SEULEMENT à l'étape 7 que le décommissionnement de `apps/web` devient un lot légitime.**

**Point de vigilance** : entre les étapes 2 et 4, `/l` est en v3 et `/chats` encore en legacy — un utilisateur franchit une frontière de zone. Même origine ⇒ cookie et `localStorage` suivent ; mais la navigation client-side de Next **ne traverse pas** une zone. D'où le corollaire 4 du § 3.2 : **tout lien sortant du périmètre v3 est un `<a>` réel**, testable par un lint.

### 4.10 Le bac de répétition

**Fait mesuré à traiter** : il n'existe **aucun `docker-compose.staging.yml`** dans ce checkout (`ls docker-compose*.yml` → `dev`, `local-https`, `local`, `monorepo`, `prod`, et le `docker-compose.yml` de base). Le bac de répétition est donc **à créer en L-0.5**, avec deux exigences : un host complet `v3.staging.meeshy.me` en `robots: noindex` pour tester la v3 isolément, et un routeur `frontend-staging` portant **explicitement `priority=1`** pour que la répétition de la bascule par `PathPrefix` soit fidèle à la prod.

---

## 5. Le contrat de données

Le chantier `docs/product/api-simplification/` décrit une surface CIBLE dont **aucun préfixe n'est monté aujourd'hui** (`/identity/*`, `/social/*`, `/media/*`, `/l/{token}` unifié, `/links/:key/members`, `/guest-sessions/me`). La v3 code contre l'**actuel**, derrière `apps/web-v3/lib/api/<domaine>.ts` — un module par domaine, **seul endroit à changer le jour de la bascule**.

### 5.1 La table

| Besoin | Endpoint cible | Endpoint actuel | Écart | Adaptation v3 |
|---|---|---|---|---|
| Résoudre un lien tracé | `GET /l/{token}` (302 ou JSON selon `Accept`) | `GET /api/v1/tracking-links/:token/resolve` + `POST /api/v1/tracking-links/:token/click` | 🆕 fusion | Route Handler serveur appelle les deux **en parallèle**, répond 302 ; `lib/api/links.ts` isole les 2 appels |
| Lien tracé pointant une conversation | `targetType: CONVERSATION` → **clé du LIEN** | `TrackingLinkService.resolveTarget` (`services/gateway/src/services/TrackingLinkService.ts:198`) renvoie `conversationId` → `/conversations/<id>`, route bloquée aux anonymes | ⚠️ **casse le rôle premier** | **Régime 4** : issue gateway bloquante. En attendant, mapping client `CONVERSATION → /chats/<linkKey>` |
| Prévisualiser un lien de conversation | `GET /links/:key?view=preview` | `GET /links/:identifier` **ou** `GET /anonymous/link/:identifier` — sert **l'identité complète du créateur** | 🆕 + ⚠️ fuite | **Régime 4, reclassé** : filtrer chez le consommateur n'est pas corriger — la charge traverse le réseau, entre dans le cache HTTP **et** dans la charge Flight sérialisée du RSC, donc lisible dans le HTML. Issue gateway « l'aperçu d'un lien ne sert que le strict nécessaire » ; jusqu'à sa livraison, l'appel se fait **serveur-à-serveur avec projection explicite des champs**, jamais depuis le navigateur, et l'identité n'est ni affichée ni transportée |
| Rejoindre en anonyme | `POST /links/:key/members` | `POST /anonymous/join/:linkId` (police complète) | 🆕 chemin | Utiliser `/anonymous/join` ; **jamais** `POST /conversations/join/:linkId` (ignore `maxUses`, `maxConcurrentUsers`, `allowedCountries`, `requireAccount`) |
| Maintenir la place invitée | `PATCH /guest-sessions/me` | `POST /anonymous/refresh` (`routes/anonymous.ts:611-615` : écrit `lastActiveAt` + `isOnline`, re-valide le LIEN, 410 si désactivé/expiré) | 🆕 | **Ce n'est PAS un renouvellement de jeton** (le jeton n'a aucun TTL, § 6) : c'est la **preuve de présence d'un BAIL**. Battement 5 min, suspendu à `hidden`, porté par **un seul** onglet |
| Quitter la place invitée | `DELETE /guest-sessions/me` (idempotent) | `POST /anonymous/leave` — **non idempotent** (`routes/anonymous.ts:700-718` : décrément inconditionnel, sans plancher) | ⚠️ verrou permanent | **Le navigateur ne l'appelle JAMAIS** (§ 6). Un bouton « Quitter la conversation » reste possible — acte délibéré. La place est libérée **côté serveur** par le bail (régime 4, bloque L2) |
| Lire un post / story / reel / mood | `GET /social/posts/:postId` | `GET /posts/:postId` — `preValidation: [requiredAuth]` (`services/gateway/src/routes/posts/core.ts:672-673` ; le middleware est construit dans `routes/posts/index.ts:23-44` et passé en `:36`) | ⚠️ **le rôle premier est FERMÉ** | **Régime 4 bloquant** : bascule vers `optionalAuth` + filtre `visibility=PUBLIC` (patron déjà utilisé par `registerFeedRoutes` dans le même fichier) |
| **Lire les commentaires d'un contenu partagé** | `GET /social/comments?postId=` | `GET /posts/:postId/comments` — `preValidation: [requiredAuth]` (`routes/posts/comments.ts:61-62`, monté en `index.ts:39`) | ⚠️ **sœur de la précédente** | **Régime 4 bloquant, MÊME LOT.** Sans elle l'écran `comments` reste mort. Les deux basculent ensemble ou aucune |
| Story expirée / restreinte | 404 **indistinguable** | — | ⚠️ oracle d'énumération | **Jamais de 403** (il confirmerait l'existence). Le patron existe : `resolveConsumptionTarget` rend `null` sans distinguer absent / supprimé / invisible (`PostReactionHandler.ts:511-516`) — le **réutiliser**, pas le réécrire. **Le même verdict s'applique à `api/og/*`**, qui vit sous `app/api/` donc hors du filtre de route |
| Télémétrie de vue anonyme | `POST /social/events` | `POST /posts/:postId/anonymous-view` (déjà public) | ✅ | Utilisé tel quel, en `sendBeacon` |
| Lire le fil de messages | `GET /conversations/:id/messages?view=timeline\|pinned\|thread` | base ✅ ; `pinned`/`search` séparés ; **`view=thread` inexistant** | ✅ base / 🆕 vues | **Régime 3** : la v3 n'expose **aucun contrôle** de fil de réponses tant que la vue n'existe pas |
| Envoyer un message (invité ou membre) | `POST /conversations/:id/messages` | idem, `jwt-or-session` | ✅ | Tel quel ; **pas** `POST /links/:identifier/messages` (vouée à disparaître) |
| Réagir | `POST /messages/:id/reactions` | `POST /reactions` + `DELETE /reactions/:messageId/:emoji` | 🏷️ chemin | Forme cible déjà portée ; adapter le chemin le jour J |
| Accusés de lecture | `POST /conversations/:id/receipts` | `POST /conversations/:id/mark-as-read` + `GET .../read-statuses` | 🆕 | Isolés dans `lib/api/messaging.ts` |
| Rattrapage delta | `GET /sync` | **aucun appelant web** | ✅ à brancher | `lib/realtime/sync/delta-client.ts`. `allowAnonymous: true` (`routes/sync.ts:452-473`) : rien à construire côté serveur pour l'invité |
| Inscription / connexion | `POST /identity/accounts` / `/identity/sessions` | `POST /auth/register` / `POST /auth/login` (+ `/login/2fa`, `/magic-link/validate`) | 🏷️ renommage | `lib/api/identity.ts` |
| Disponibilité pseudo | `GET /identity/availability?username=&email=&phone=` | `GET /auth/check-availability` | 🆕 | **Un seul appel groupé** pour les 3 critères |
| Médias distants | inchangé — `fileUrl` servi tel quel | `GET /attachments/file/*` | ✅ | **Ne jamais reconstruire l'URL côté client** (signature `?exp=&sig=` à venir dans la même valeur) |
| Liens tracés — création | — | `POST /api/v1/tracking-links` monté en `authOptional`, cinq routes de gestion **échouent ouvertes** quand `trackingLink.createdBy` est nul | ⚠️ faille | La v3 **exige un compte côté UI** ; le durcissement serveur est une issue compagnon (§ 11) |

### 5.2 Les quatre régimes de dégradation

Déclarés dans le module `lib/api/` concerné, **jamais improvisés dans un composant** :

1. **Renommage pur** → constante de chemin dans le module ; bascule = un diff d'une ligne.
2. **Fusion de routes** → le module fait N appels et rend **la forme cible** ; le jour J, N devient 1 sans que l'appelant change.
3. **Capacité absente côté serveur** → la fonctionnalité n'est **pas exposée dans l'UI**. Pas de contrôle inerte (loi « un contrôle existe s'il a un effet »). Une issue `décision-produit` porte l'attente.
4. **Blocage full-stack** → le lot web est **bloqué** par l'issue gateway compagnon ; **un patch web-only est interdit** (il rendrait la page puis échouerait en 401 — pire qu'aujourd'hui). Les blocages de régime 4 apparaissent dans la matrice (§ 10) sous des nœuds préfixés `gw:`, dans leur **propre colonne**, hors du graphe des écrans.

### 5.3 Les événements Socket.IO consommés

Source de vérité : `packages/shared/types/socketio-events.ts` (121 `SERVER_EVENTS`, 58 `CLIENT_EVENTS`).

> **Fait serveur à ne pas déformer** : `grep -rn "\.of(" services/gateway/src --include=*.ts` (hors tests) = **0 occurrence**. Le gateway **ne déclare aucun namespace** ; tout vit dans le namespace **par défaut** et la séparation se fait par **ROOMS**. La v3 ouvre donc **UNE** connexion, pas trois — et les « 3 namespaces » de l'ancienne spec étaient trois connexions redondantes vers le même endroit.

**Reçus (participation)** : `message:new`, `message:edited`, `message:deleted`, `message:translation`, `message:hidden-for-me`, `message:restored-for-me`, `message:pinned`, `message:unpinned`, `message:attachment-updated`, `message:pending-delivered`, `reaction:added`, `reaction:removed`, `attachment:reaction-added`, `attachment:reaction-removed`, `audio:transcription-ready`, `audio:translation-ready`, `audio:translations-progressive`, `audio:translations-completed`, `translation:failed`, `conversation:joined`, `conversation:left`, `conversation:join-error`, `conversation:updated`, `conversation:closed`, `conversation:unread-updated`, `conversation:participant-joined`, `conversation:participant-left`.
**Reçus (présence)** : `typing:start`, `typing:stop`, `user:status`, `presence:snapshot`.
**Reçus (notifications, rôle secondaire seulement)** : `notification:new`, `notification:read`, `notification:read-bulk`, `notification:counts`, `auth:token-expired`, `auth:session-revoked`.
**Émis** : `conversation:join`, `conversation:leave`, `message:send`, `message:send-with-attachments`, `message:edit`, `message:delete`, `typing:start`, `typing:stop`, `reaction:add`, `reaction:remove`, `reaction:request-sync`, `translation:request`, `presence:app-state`.
**Rooms de post (`post:join`/`post:leave`, `ROOMS.post`)** : consommées **uniquement** par un lecteur CONNECTÉ qui s'engage, via `use-post-room.ts` + `use-post-socket-cache-sync.ts` **réutilisés tels quels**. Un lecteur anonyme n'y entre pas (décision écrite `PostReactionHandler.ts:470` — voir § 11).
**Hors périmètre v3 (P2)** : les 25 événements `call:*`.

### 5.4 Le Prisme Linguistique appliqué à TOUT contenu servi — **y compris vers une MACHINE**

Le Prisme a **deux faces** (cycle 125) : le CONTENU (quelle traduction servir) et le CADRAGE (dans quelle langue on ADRESSE un lecteur). **Un résolveur de Prisme n'est pas nécessairement dans un client** : dès qu'un contenu part vers un destinataire NOMMÉ — ou vers une MACHINE qui le rediffusera — c'est le serveur qui descend son prisme.

La v3 introduit **trois surfaces qui servent du texte sans lecteur identifiable**, et la revue a raison : aucune n'avait de résolveur.

| Surface v3 | Destinataire | Langue servie | Pourquoi |
|---|---|---|---|
| `generateMetadata` (`title`, `description`) de `/stories/:id`, `/posts/:id`, `/reels/:id`, `/moods/:id` | crawler (WhatsApp, Facebook, Slack, iMessage) | **la langue d'ORIGINE du contenu** (`Post.originalLanguage`), jamais une traduction | Les plateformes **mettent l'aperçu en cache PAR URL** : une seule langue est servie à tous les destinataires du lien. Aucun prisme utilisateur n'existe pour un crawler ; le seul signal serait `Accept-Language`, **absent** chez WhatsApp et Facebook. Servir la langue de l'auteur est le seul choix stable et honnête |
| `app/api/og/[type]/[id]/route.tsx` (texte **gravé** dans l'image) | crawler | idem — langue d'origine | Même cache par URL, et l'image n'est pas re-négociable |
| HTML de repli de `/l/:token` (sans JS) | crawler **et** humain | idem — langue d'origine ; l'humain est immédiatement redirigé (302) | Le repli n'est vu que par une machine ou par un navigateur sans JS |
| **Variante de partage délibéré** | humain qui choisit | `?lang=xx` en query, honoré par `generateMetadata` **et** par `api/og` | Permet de partager délibérément une traduction — l'URL diffère, donc le cache plateforme aussi |

**Règles opposables** :
- La descente est **UNE** fonction : `resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`), qui rend `{ language, text } | null` — `null` ⇒ servir l'original. **Aucun consommateur v3 ne réécrit la boucle.**
- Pour tout contenu affiché à un lecteur IDENTIFIÉ (bulle, commentaire, transcription, aperçu de liste), la v3 descend le prisme **ordonné** (`systemLanguage` → `regionalLanguage` → `customDestinationLanguage` → `deviceLocale` → `fr`), **jamais** le rang 1 seul.
- **Un hôte qui monte `TranslationToggle` en `showContent={false}` DOIT brancher `onDisplayedChange`** et rendre lui-même ce que le résolveur annonce. Sans ce relais, la surface **AFFIRME une langue qu'elle ne sert pas** — le défaut trouvé sur `StoryViewer` et `PostCard` au cycle 123. Gate ESLint : `showContent={false}` sans `onDisplayedChange` = erreur.
- **`preferredLanguages` est un tableau** : son identité change à chaque rendu chez tout hôte qui le construit en ligne. L'effet du résolveur dépend des **trois primitives servies**, jamais de l'objet qui les porte — sinon la boucle est infinie.
- **`lang="xx"` est obligatoire** sur tout nœud dont le texte a été résolu dans une langue ≠ `<html lang>` ; c'est ce qui « part À CÔTÉ » du texte (cycle 123), et c'est testé par le gate B (§ 9).
- **Quatrième question (cycle 124), appliquée ici** : le texte servi a-t-il le **droit** d'être là ? Un contenu **expiré** ou **restreint** ne produit ni `generateMetadata`, ni image OG, ni HTML de repli — il produit un **404 indistinguable**. `apps/web/app/story/layout.tsx:14-18` pose déjà `robots: { index: false, follow: false }` avec sa raison écrite : stories éphémères 24 h et restreignables (FRIENDS/EXCEPT/ONLY/PRIVATE), « un extrait indexé périmé survivrait à la story ». **La v3 conserve `noindex` sur les stories** ; l'aperçu OG reste servi (il n'est pas de l'indexation), mais **il applique le même filtre de visibilité que la route**, et un test le prouve — sans quoi la réparation du rôle premier **fuit exactement ce que `story/layout.tsx` protégeait**.

---

## 6. Le cycle de vie de la session anonyme

### 6.1 Le contrat réel, mesuré

1. **Le jeton invité n'a AUCUNE expiration temporelle.** Sa seule condition de validité est `Participant.isActive === true`, sur les **trois** portes : `services/gateway/src/middleware/auth.ts:399-402`, `services/gateway/src/socketio/handlers/AuthHandler.ts:325-330`, `services/gateway/src/routes/links/messages.ts:269-276`. Aucun `expiresAt`, aucun TTL, aucune signature horodatée (`generateSessionToken`, `routes/anonymous.ts:41-47`, n'est qu'un aléatoire opaque). **Un invité qui revient après 10 minutes n'a donc rien perdu d'autre que sa pastille verte.**
2. **`leave` est une porte à SENS UNIQUE.** `routes/anonymous.ts:700-708` pose `isActive:false` + `leftAt` ; `routes/anonymous.ts:583-584` fait répondre **401** à `/anonymous/refresh` pour tout participant inactif, **sans jamais le réactiver**. Une bascule d'application qui déclencherait le beacon ne « déconnecte » pas l'invité : elle **détruit définitivement son identité**.
3. **Le seul retour est un re-join, et il coûte cher.** `routes/anonymous.ts:379-419` crée une **NOUVELLE** ligne `Participant` ; `:424-430` incrémente `currentUses` +1, `currentConcurrentUsers` +1, `currentUniqueSessions` +1 ; `findFreeAnonymousUsername` (`:98-119`) **suffixe le pseudo**. Conséquences : paternité des messages perdue, changement de nom sous les yeux des autres, et refus possibles — 410 `LINK_MAX_USES` (`:276`), 429 `MAX_CONCURRENT_USERS` (`:280`).
4. **`leave` n'est pas idempotent** : le décrément est inconditionnel (`:712-718`), sans garde ni plancher. Deux beacons ⇒ −2, et le compteur peut passer **négatif** — or c'est LUI qui garde l'admission (`:280`).
5. **Dérive symétrique** : le balayage journalier **SUPPRIME** (`deleteMany`) les participants anonymes inactifs depuis 24 h (`services/gateway/src/services/MaintenanceService.ts:660-666`, planifié `:141-148`) **sans jamais décrémenter** `currentConcurrentUsers`. Le verrou est réel sur **deux** chemins. Et c'est un hard-delete d'une ligne qui est le `senderId` de messages existants.
6. **Deux horloges de 24 h qui ne mesurent pas la même chose** : client = 24 h **absolues** depuis le join (`apps/web/hooks/use-auth.ts:207` → `services/auth-manager.service.ts:164-193`) ; serveur = 24 h d'**inactivité**, par suppression.
7. **Deux onglets partagent UNE clé** : `AUTH_STORAGE_KEYS.ANONYMOUS_SESSION` est unique, **non indexée par lien** — rejoindre un second lien **écrase** le jeton du premier onglet.
8. **Le 401 invité n'est traité nulle part** : `apps/web/services/api.service.ts:223-228` renvoie **tout** 401 vers `refreshAuthToken()` → `authService.refreshToken()`, qui exige un JWT + un refreshToken. Un invité n'en a aucun ⇒ `ApiServiceError('Session expirée')` jeté.

### 6.2 La décision

> **Le navigateur n'appelle JAMAIS `leave`.** La place occupée est un **BAIL SERVEUR** : le battement `/anonymous/refresh` en est la preuve de présence, et un balayage la libère. `visibilitychange:hidden` **ne mute rien**. La reprise se fait sur `visible` / `pageshow{persisted}` / `online`. **Un 401 invité n'autorise jamais un re-join automatique** — il affiche un **bouton**.

**Événements DOM retenus, et pourquoi chacun** (site unique : `apps/web-v3/lib/realtime/lifecycle.ts`) :

| Événement | Ce qu'on fait | Pourquoi |
|---|---|---|
| `visibilitychange → hidden` | **SUSPENDRE** le battement et les requêtes de fond. **Rien d'autre, jamais une mutation.** | Il se déclenche à chaque bascule d'application, verrouillage d'écran, tirage de notification, changement d'onglet — c'est **le geste même du rôle premier** |
| `visibilitychange → visible` | **REPRENDRE** : `reconnectAttempts = 0`, `connect()`, `refresh`, `GET /sync` | Seul signal fiable de retour, les timers étant étranglés (~1/min) ou gelés. Le patron **existe déjà** : `apps/web/services/socketio/connection.service.ts:53-110`, à réutiliser, pas à réécrire |
| `pageshow` avec `persisted === true` | traité **exactement** comme `visible` | Retour de bfcache : **aucun effet React ne se remonte**, alors que le socket a bien été coupé. Sans lui, l'onglet revient muet |
| `pagehide` avec `persisted === true` | **NE RIEN FAIRE** | Gel bfcache — la page va revivre |
| `pagehide` avec `persisted === false` | un **unique** `navigator.sendBeacon` de **télémétrie** (`POST /posts/:id/anonymous-view`, accusés). **Aucun `leave`** | Destruction réelle du document |
| `offline` / `online` | bascule de la bannière, relance de la connexion | `navigator.onLine` ne fait qu'**avancer** la tentative ; la vérité reste l'état du socket |
| `storage` | un onglet apprend qu'un autre a remplacé ou effacé le jeton | Au lieu de le découvrir par un 401 |
| `BroadcastChannel('meeshy-guest')` | élection d'**UN seul** porteur de battement pour N onglets | Sinon N écritures `lastActiveAt` toutes les 5 min pour une seule personne — contraire à « très faible consommation de données » |
| ~~`beforeunload`~~, ~~`unload`~~ | **NON RETENUS** | Bloquent le bfcache, ne se déclenchent pas sur mobile, ignorés par WebKit |

### 6.3 État par état

**A. PREMIÈRE ARRIVÉE** (`/l/:token` → `/chats/:key`, visiteur non joint)
*Fait* : aucun jeton, aucun socket, aucun battement. `resolveSharedAccess()` s'exécute en RSC ; l'aperçu du lien est lu **serveur-à-serveur** avec projection explicite des champs (§ 5.1).
*Affiche* : l'aperçu + le CTA « Rejoindre » ; si `requireAccount`, connexion/inscription avec `?next=` conservé.
*Appelle au tap* : `POST /anonymous/join/:linkId` → 201 `{ sessionToken, participant, id }`. Puis, **dans cet ordre** : écriture du jeton dans `meeshy.guest.<linkKey>`, `await import('socket.io-client')`, ouverture de la connexion, démarrage du battement (si cet onglet est le porteur élu).
*Refus à peindre, tous déjà servis par la route* : 403 `REQUIRES_ACCOUNT`, 403 pays/IP/langue, 410 `LINK_INACTIVE` / `CONVERSATION_CLOSED` / `LINK_EXPIRED` / `LINK_MAX_USES`, 429 `MAX_CONCURRENT_USERS`, 400 email/date/pseudo requis, **409 `USERNAME_TAKEN_IN_CONVERSATION` avec `suggestedNickname` à pré-remplir**.

**B. RECHARGEMENT (F5) AVEC JETON EN MAIN**
*Fait* : rend d'abord le **CACHE** (Cache-First : jamais de spinner sur un cache non vide), puis **UNE** `POST /anonymous/refresh` de re-validation **au montage** — pas au bout de 5 min.
*Affiche* : la conversation, immédiatement. Les droits (`canSendMessages`, `canSendFiles`, `canSendImages`) sont **re-lus de la réponse** : l'hôte a pu les changer.
*Appelle* : `refresh` (200 ⇒ nominal ; 401 ⇒ état F ; 410 ⇒ état G) puis `GET /sync` depuis le curseur retenu.
*N'appelle JAMAIS `join`.* Le jeton n'a pas de TTL : il est bon tant qu'il est bon.

**C. RETOUR D'ARRIÈRE-PLAN APRÈS 10 MIN**
*Fait mesuré* : **rien n'a expiré**. `isActive` est toujours vrai ; `updateOfflineUsers` (`MaintenanceService.ts:169-270`) ne touche que `isOnline`.
*Fait* : sur `visible` (ou `pageshow{persisted:true}`), dans cet ordre — (1) reconnexion immédiate du socket avec `reconnectAttempts = 0`, (2) `POST /anonymous/refresh`, (3) `GET /sync` depuis le curseur.
*Affiche* : la conversation **telle qu'elle était**, sans clignotement ; un indicateur discret « mise à jour » ; si `hasGap`, un **séparateur « des messages manquent ici »** avec chargement de la page suivante au tap. **JAMAIS un écran de re-jonction, JAMAIS une modale.**

**D. RÉSEAU COUPÉ PUIS REVENU** → § 7.

**E. DEUX ONGLETS SUR LE MÊME LIEN**
*Fait* : stockage **`meeshy.guest.<linkKey>`** — une entrée **par lien**, jamais une clé globale ; deux liens différents cohabitent (impossible aujourd'hui). Un seul porteur de battement, élu par `BroadcastChannel` (le dernier onglet passé `visible` gagne). `storage` réaligne un onglet sans requête.
*Fermer un onglet n'appelle **RIEN**.* Il n'y a plus de `leave` côté client, donc l'onglet A ne peut plus tuer l'onglet B. **C'est la seule façon de fermer ce cas** — un `leave` correctement conditionné resterait faux dès que deux onglets partagent une place.

**F. JETON INVALIDE (401 sur n'importe quel appel invité)**
*Cause réelle* : `isActive:false` — départ explicite, bannissement, ou purge des 24 h. **Jamais une expiration temporelle.**
*Fait*, en **UN seul site** (`lib/api/guest-session.ts`), sans retry aveugle : (1) une `POST /anonymous/refresh` de **contrôle** ; 200 ⇒ le 401 venait d'AUTRE CHOSE (droit refusé sur cet appel précis), on ne touche pas au jeton et on peint le refus ; (2) 401 ⇒ le jeton est mort, on efface **l'entrée du lien**.
*Affiche* : la conversation **LUE reste à l'écran** (dégradation en lecture — on ne vide pas l'écran de quelqu'un), le composeur se ferme, un bandeau « votre place a été fermée — reprendre » porte un **BOUTON**.
*INTERDIT* : **re-join silencieux**. Mesure à l'appui (§ 6.1 point 3) : nouvelle identité, pseudo suffixé, paternité perdue, +1 sur trois compteurs, risque de 410/429, et une boucle épuiserait le `maxUses` du lien du créateur. Le bouton refait le join (état A) avec le pseudo précédent pré-rempli.

**G. LIEN RÉVOQUÉ OU EXPIRÉ PENDANT LA LECTURE (410)**
*Sources* : `refresh` → 410 `LINK_DEACTIVATED` / `LINK_EXPIRED` ; `POST /links/:id/messages` → 410 (`routes/links/messages.ts:309-315`) ; socket fermé.
*Affiche* : ce qui est déjà lu **reste lu** ; le composeur se ferme **avec sa raison** (« ce lien a été fermé par son auteur » / « ce lien a expiré » / « cette conversation est terminée » pour `CONVERSATION_CLOSED`, **état distinct**) ; les envois en file sont **annulés et rendus VISIBLES** comme non envoyés, jamais perdus en silence.
*Appelle* : rien. **Aucune redirection automatique** — un lecteur au milieu d'un message ne doit pas voir son écran changer sous lui.

**H. FERMETURE RÉELLE DE L'ONGLET**
`pagehide{persisted:false}` : un `sendBeacon` de télémétrie. **Rien qui mute la session.** La place est libérée par le **SERVEUR**. Raison de fond : **aucun événement navigateur ne se déclenche à l'arrêt forcé de l'application, au crash de l'onglet, à la coupure de tunnel ni à l'extinction du téléphone** ; un signal qui se déclenche quand il ne faut pas ET se tait quand il faudrait ne peut pas tenir un compteur d'admission.

### 6.4 Le bail serveur (issue gateway, régime 4, **bloque L2**)

- Le battement existant (`/anonymous/refresh` → `lastActiveAt`) devient la **preuve de présence**.
- **Balayage** : pour tout `Participant` anonyme `isActive:true` dont `lastActiveAt < now − N min` (N = **10** par défaut, soit deux battements manqués), une transition **compare-and-set** — `updateMany({ where: { id, isActive: true }, data: { isActive: false, leftAt: now } })` — et le décrément **uniquement si le compte rendu vaut 1**.
- La **même forme** rend `POST /anonymous/leave` idempotent : le suivi « idempotence manquante » est soldé **par construction**.
- **Plancher** : le décrément ne descend jamais sous 0.
- La **purge des 24 h** (`MaintenanceService.ts:660-666`) passe par la **MÊME transition avant toute suppression**, et **cesse de hard-deleter** une ligne qui est le `senderId` de messages.
- **N est une DÉCISION PRODUIT** (issue `décision-produit`, § 11).

### 6.5 La recette (chaque ligne est tombable)

| Cas | Assertion |
|---|---|
| C | basculer d'application 10 min puis revenir ⇒ conversation ouverte, **aucune modale**, **aucun re-join**, et le premier message reçu pendant l'absence apparaît |
| D | couper le réseau 5 min, envoyer 2 messages hors-ligne, revenir ⇒ les 2 partent **dans l'ordre**, `hasGap` peint son séparateur, **le jeton est le même** |
| E | deux onglets sur le même lien, fermer l'un ⇒ l'autre continue d'émettre et de recevoir ; **une seule** requête de battement observée sur 10 min |
| F | forcer `isActive:false` en base ⇒ bandeau + bouton, la lecture reste, **AUCUN `POST /anonymous/join` observé sans clic** |
| G | désactiver le lien pendant la lecture ⇒ composeur fermé avec sa raison, contenu lu conservé, file annulée et **visible** |
| H | fermer l'onglet ⇒ **zéro `POST /anonymous/leave` observé** ; la place se libère après N minutes |
| **Anti-régression** | `visibilitychange:hidden` seul ⇒ **ZÉRO requête mutante** (assertion sur le journal réseau) |

---

## 7. Le comportement en réseau dégradé

Site unique : `lib/realtime/lifecycle.ts` + `lib/realtime/reconnect-policy.ts` (UNE politique : 1 s → 30 s, `randomizationFactor: 0.5`, reprise du patron mesuré `apps/web/services/socketio/connection.service.ts:203-206`).

| État | Ce qui se passe techniquement | **Ce que l'utilisateur VOIT** |
|---|---|---|
| **Socket tombée < 30 s** | Backoff seul. Aucun `/sync`. Le cache sert la lecture. | Un point d'état discret passe de plein à creux dans l'en-tête. **Rien d'autre.** Pas de bannière, pas de spinner, pas de perte de position de scroll |
| **Socket tombée 30 s – 5 min** | Backoff continue ; au retour : `reconnectAttempts = 0`, `connect()`, puis **`GET /sync` depuis le curseur** (le socket ne rejoue pas ce qui s'est dit pendant l'absence) | Le point d'état revient plein ; un liseré « mise à jour » de 400 ms ; les messages manqués s'insèrent **sans faire sauter le scroll**. Si `hasGap` : un **séparateur « des messages manquent ici »**, cliquable, qui charge la page suivante |
| **Retour d'arrière-plan** (`visible` / `pageshow{persisted}`) | Battement repris ; reconnexion **immédiate** (court-circuit du backoff) ; `refresh` ; `GET /sync` | La conversation est **déjà là** (cache), à sa position. Le contenu se complète par le haut. **Jamais de modale, jamais de re-jonction** |
| **Hors-ligne total** (`offline`) | Lecture servie par le cache TanStack + `public/sw.js` ; envois poussés dans `offline-queue` (persistée `idb-keyval`) ; **aucun appel**, **aucune destruction de jeton** | Bannière sobre « hors ligne » en haut. Les messages envoyés s'affichent en **optimiste, grisés, avec une horloge**. Le composeur reste **actif** |
| **Retour en ligne** (`online`) | `reconnectAttempts = 0`, `connect()`, `refresh`, `GET /sync`, **puis** vidage **FIFO** de la file | La bannière disparaît. Les messages grisés passent en envoyés **dans l'ordre d'écriture**. Ceux refusés (410) passent en **« non envoyé »** avec leur raison et un bouton « réessayer » — **jamais perdus en silence** |
| **Erreur réseau ≠ 401** | **Règle qui manque aujourd'hui** : un `TypeError: Failed to fetch` **n'est pas** un 401. **Un jeton ne s'efface JAMAIS sur une erreur réseau** — c'est le chemin par lequel une coupure de tunnel effacerait une session valide | Rien ne change à l'écran : c'est une coupure, pas un refus |
| **Onglet caché** | **ZÉRO requête** (gate mesuré, § 8) | — |

---

## 8. Le budget

### 8.1 Ce qui est MESURÉ et ce qui est À ÉTABLIR

> **La revue reproche à juste titre des chiffres non reproductibles.** Ce document ne les répète pas. Trois poids seulement sont **mesurés et reproductibles** ; tous les autres plafonds sont des **cibles à établir au premier build**, par un script **commité**.

**Mesurés (commande citée, résultat reproductible)** :

| Objet | Valeur | Commande |
|---|---|---|
| Sprite des 72 glyphes Phosphor | **29 404 o brut / 8,8 Ko gzip** | génération depuis `@phosphor-icons/core@2.1.1` puis `gzip -9` |
| Fonte `@phosphor-icons/web` (regular seul) | **224 Ko** (144 Ko woff2 + 80 Ko css) ; 279 124 o de woff2 pour deux graisses | `du -b` sur le tarball extrait |
| `socket.io-client@4.8.3` | **12 796 o gzip (ESM)** / **14 626 o gzip (UMD)** | `gzip -9 socket.io.esm.min.js` |

**À établir au premier lot (L-0.5), par `apps/web-v3/scripts/check-bundle-budget.mjs`** : plancher Next, TanStack Query, `idb-keyval`, Zustand, CSS purgé, et **la ligne de base « AVANT »**.

### 8.2 Comment on MESURE (c'est le livrable, pas le chiffre)

```bash
# 1. Poids de bundle par route — source: le manifeste de build de la v3
cd apps/web-v3 && bun run build
node scripts/check-bundle-budget.mjs           # lit apps/web-v3/.next/app-build-manifest.json
                                               # échoue si un plafond de budgets.json est dépassé
# 2. Octets réellement transférés + Web Vitals — source: CDP
bunx playwright test e2e/visual/v3-network-vitals.spec.ts
                                               # encodedDataLength par type de ressource, FCP/LCP/CLS
# 3. LIGNE DE BASE « AVANT » — sur apps/web EN PRODUCTION, une fois, commitée
node apps/web-v3/scripts/baseline.mjs https://meeshy.me/l/<token> /story/<id> /reel/<id> /post/<id>
                                               # → apps/web-v3/e2e/visual/baseline.json (commité, daté)
```

**Deux manifestes, deux plafonds.** Le socle `(connected)` de la v3 **n'est pas comparable** à celui du legacy : les plafonds v3 sont absolus, et le progrès se démontre contre `baseline.json`, jamais contre une intuition.

### 8.3 Les plafonds par écran

**Statut** : `GATE` = plafond ferme, casse la CI. `CIBLE` = valeur à confirmer par la première mesure de L-0.5 ; jusque-là le gate enregistre la valeur mesurée et interdit toute **régression** (ratchet strictement décroissant).

| Écran | JS gzip | Requêtes avant 1ᵉʳ pixel utile | Premier pixel utile (3G Fast simulé, p75) | Notes |
|---|---|---|---|---|
| `/l/:token` — redirection | **0 Ko — GATE** (aucun `<script>` **sauf** le ThemeScript inline, ≤ 400 o) | **1 — GATE** | ≤ 600 ms (TTFB→302) — CIBLE | Route Handler ; le beacon part **après**. **HTML ≤ 4 Ko gzip, hors sprite** (la redirection ne rend aucune icône) |
| `/l/:token/expired` | ≤ 10 Ko — CIBLE | 2 (HTML + CSS) — GATE | ≤ 900 ms — CIBLE | RSC pur + ThemeScript |
| **Lecture partagée** (`/stories/:id`, `/posts/:id`, `/reels/:id`, `/moods/:id`) | **≤ 95 Ko — CIBLE** | **≤ 3 (HTML + CSS + sprite externe) — GATE** | LCP ≤ 2,0 s — CIBLE | **Interdits sur cette route** (GATE ESLint + gate de bundle) : `socket.io-client`, `framer-motion`, `lucide-react`, TanStack Query. **GATE neuf : 0 connexion serveur tenue après le premier pixel** (assertion CDP : aucune requête `pending`) |
| **Aperçu de lien** (`/chats/:key`, non rejoint) | ≤ 105 Ko — CIBLE | ≤ 4 — GATE | ≤ 2,2 s — CIBLE | `resolveSharedAccess()` **serveur** ; l'historique servi (si `allowViewHistory`) est dans le HTML |
| **Conversation anonyme** (après « Rejoindre ») | ≤ 165 Ko cumulé — CIBLE | ≤ 6 — GATE | ≤ 2,8 s après le tap — CIBLE | Dont **12 796 o mesurés** de `socket.io-client` chargés **au tap**, jamais avant. Prefetch autorisé au `pointerdown` du CTA |
| **Accueil connecté / chats** | **socle `(connected)` ≤ 150 Ko** + **code d'écran ≤ 80 Ko** — CIBLES, **rendues séparément dans le rapport** | ≤ 8 — GATE | ≤ 3,0 s — CIBLE | Deux termes, pour qu'un dépassement **désigne un coupable**. `CallManager` **n'est PAS dans le layout** (voir ci-dessous) |
| **Composer / réglages** | socle ≤ 150 Ko + écran ≤ 130 Ko — CIBLES | ≤ 10 — GATE | ≤ 3,5 s — CIBLE | Plafond haut assumé ; c'est du confort |

> **`CallManager` sort du layout connecté.** `apps/web/components/video-call/CallManager.tsx` fait **1350 lignes, 18 imports** et embarque la pile WebRTC. Le monter dans `(connected)/layout.tsx` mettrait un composant **P2, hors énoncé de mission**, sur le chemin critique de `/chats` — un composant P2 gouvernant un gate P1. Dans la v3 il se monte **uniquement à la réception d'un `call:incoming`**, en `next/dynamic`.

### 8.4 Le budget CUMULATIF par groupe de routes

Le rapport de `check-bundle-budget.mjs` rend **trois lignes par groupe**, pas une :

```
(public)     socle: <x> Ko   |  écran le plus lourd: <y> Ko  |  cumul p95: <z> Ko
(connected)  socle: <x> Ko   |  écran le plus lourd: <y> Ko  |  cumul p95: <z> Ko
```

C'est ce rapport que la passe Opus lit pour répondre à sa question (d) — sinon la question ne peut recevoir qu'une réponse d'opinion.

### 8.5 Gates transverses

- **CLS ≤ 0,05** sur toute route `(public)` ⇒ `width`/`height` obligatoires sur chaque `next/image`. *(État de `apps/web`, mesuré : **8 fichiers** importent `next/image` — 9 si l'on compte la mention dans `middleware.ts` — sur ~1240 fichiers `.ts/.tsx` hors tests.)*
- **Aucune police web** sur `(public)` (pile système). Inter autorisé sur `(connected)` via `next/font`, non bloquant.
- **CSS ≤ 20 Ko gzip** par route.
- **Sprite d'icônes** : **EXTERNE**, servi depuis la **même origine** (`/__v3/sprite.svg`), avec `<link rel="preload" as="image" type="image/svg+xml">`, cache immuable, **≤ 12 Ko gzip**. Un **sous-sprite critique de ≤ 8 glyphes** au-dessus de la ligne de flottaison est inliné dans le layout. *Le sprite n'est donc compté qu'une fois : « HTML ≤ 4 Ko **hors sprite** ; sprite externe ≤ 12 Ko, **1 requête**, cache immuable ».* Le gate CI échoue si une classe `ph-*` référencée n'a pas son `<symbol>`.
- **Assertion anti-panne cross-origin** : sur l'écran le plus dense, **les N `<use>` rendent N symboles visibles** — seul test qui attrape la défaillance silencieuse d'un sprite servi depuis un autre host.
- **0 erreur `axe` `serious`/`critical`** sur toute route `(public)`.
- **0 requête pendant que l'onglet est `hidden`** ; **1 seule** requête de battement pour N onglets sur 10 min (§ 6).

---

## 9. La machine de vérification

### 9.1 Ce qui EXISTE et tourne déjà (commité)

C'était le principal « manque » de la revue de conception. **Il est comblé.**

```
docs/product/MeeshyWebV3Design/
  MeeshyWebV3.dc.html     la planche — entrée au dépôt, source de vérité du design
  capture-cibles.js       le harnais
  ds-shim.css             jetons du DS externe, reconstitués
  support.js
  cible/*.png             37 captures cibles (~4,5 Mo), COMMITÉES
  vues.json  vues.md      index machine + index lisible, avec la ROUTE web de chaque vue
```

```bash
node docs/product/MeeshyWebV3Design/capture-cibles.js          # régénère les 37 PNG + vues.json + vues.md
node docs/product/MeeshyWebV3Design/capture-cibles.js <dir>    # sortie ailleurs
```

**Propriétés vérifiées** :
- Il rend **37 vues** : les 30 écrans du navigateur de la planche + les **7 fiches de réglages** (l'écran `detail` a sept contenus).
- Il tourne **HORS-LIGNE** : `unpkg` est bloqué par le proxy sortant, donc `react`/`react-dom`/`babel`/`phosphor`/`Inter` viennent d'un cache npm **créé à la demande** dans `.cache/dc-vendor` (gitignoré) ; Google Fonts est intercepté et remplacé par Inter local.
- Chromium : `/opt/pw-browsers/chromium` (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, ou `CHROMIUM_PATH`).
- Les identifiants de vue viennent de la source de la planche (`const MAP`), et **le script ÉCHOUE si la planche et son navigateur cessent de s'accorder**.
- `vues.json`/`vues.md` sont **régénérés**, jamais édités à la main — aucune capture ne peut dériver en silence.

**Trois planches larges ne sont pas des écrans** mais des critères de recette, comme pour MeeshyComposer.

### 9.2 Ce qu'il reste à construire (livré par **L-0.5**, avant tout écran)

| Livrable | Chemin | Rôle |
|---|---|---|
| Croisement matrice ↔ planche | ajout dans `capture-cibles.js` | **tout ID de la matrice existe dans `const MAP`**, et **tout ID de `MAP` a une ligne de matrice**. Une vue qui entre dans la planche sans entrer dans l'ordre est une vue que personne n'implémente |
| Gate d'ordre | `docs/product/MeeshyWebV3Design/ordre-des-ecrans.sh` | rc=0 DAG · **rc=1 CYCLE (nommé)** · **rc=2 référence inconnue**. Écrit, exécuté, **trois cas mesurés** (§ 10.2) |
| Ordre publié | `docs/product/MeeshyWebV3Design/ordre.md` | **généré**, jamais écrit |
| Diff par région | `apps/web-v3/e2e/visual/lib/pixel-diff.ts` | `pixelmatch@?` + `pngjs@5.0.0` + `sharp@0.35.3` |
| Conformité visuelle | `apps/web-v3/e2e/visual/v3-visual.spec.ts` | rendu réel vs `cible/<id>.png` |
| Accessibilité | `apps/web-v3/e2e/visual/v3-a11y.spec.ts` | `@axe-core/playwright` |
| Poids réseau | `apps/web-v3/e2e/visual/v3-network-vitals.spec.ts` | CDP, `encodedDataLength`, FCP/LCP/CLS |
| Budget | `apps/web-v3/scripts/check-bundle-budget.mjs` + `budgets.json` | lit `apps/web-v3/.next/app-build-manifest.json` |
| Ligne de base | `apps/web-v3/e2e/visual/baseline.json` | mesurée **sur la prod actuelle**, commitée, datée |
| Jetons & icônes | `packages/design-tokens/`, `packages/icons/` + `scripts/build-sprite.ts` | mesuré : `packages/` ne contient aujourd'hui que `MeeshySDK` et `shared` |

### 9.3 Préparation (une fois)

```bash
cd /home/user/meeshy
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
bun install --ignore-scripts          # le postinstall de grpc-tools échoue derrière le proxy (CLAUDE.md)
node packages/icons/scripts/build-sprite.ts
node docs/product/MeeshyWebV3Design/capture-cibles.js
```

### 9.4 Gate A — les cibles

Déjà décrit en 9.1. Les 37 PNG sont **committés et régénérables d'une commande**.

### 9.5 Gate B — structure et accessibilité (bloquant, binaire)

```bash
cd apps/web-v3
bun run lint                                   # eslint-plugin-jsx-a11y strict + les lints de zone (§3)
bun run test -- --testPathPattern='(public)'   # jest + jest-axe sur chaque composant du rôle premier
bunx playwright test e2e/visual/v3-a11y.spec.ts
```

`v3-a11y.spec.ts` assère, **par route `(public)`** : 0 violation `axe` `serious`/`critical` ; présence de `<main id="main-content">`, `<header>`, `<nav>` ; ordre de tabulation atteignant **tous** les contrôles ; **`lang="xx"` sur chaque nœud dont le texte a été résolu par le Prisme dans une langue ≠ `<html lang>`** ; `dir="rtl"` quand la locale est `ar`.

### 9.6 Gate C — conformité visuelle (**un score, pas un verdict**)

```bash
bunx playwright test e2e/visual/v3-visual.spec.ts
# rendu   : apps/web-v3/e2e/visual/rendu/<id>-{light,dark,explicit-light-on-dark,explicit-dark-on-light}.png
# diff    : apps/web-v3/e2e/visual/diff/<id>.png
# rapport : apps/web-v3/e2e/visual/report/index.html   (cible | rendu | diff, côte à côte, score chiffré)
```

Capture : `viewport 390×844`, `deviceScaleFactor: 3` — **le même cadre que `capture-cibles.js`**.

| Région | Ce qui est comparé | Seuil |
|---|---|---|
| **Disposition** | carte de contours (Sobel) en niveaux de gris, zones d'icône et de texte masquées | **≤ 8 %** de pixels divergents |
| **Hiérarchie** | boîtes englobantes des blocs de niveau 1 et 2 (IoU) | **≥ 0,92** |
| **Iconographie** | présence/position des `<use>` attendus (**assertion DOM**, pas de diff pixel) | **100 %** des icônes attendues présentes et rendues |

**Quatre colonnes de thème, pas deux** — c'est le trou signalé par la revue :

| Colonne | Comment | Ce qu'elle attrape |
|---|---|---|
| `system-light` | `page.emulateMedia({ colorScheme: 'light' })`, `localStorage` vide | le défaut |
| `system-dark` | `page.emulateMedia({ colorScheme: 'dark' })`, `localStorage` vide | le défaut |
| **`explicit-light-on-dark`** | `localStorage` = `light`, OS en `dark` | **le cas mixte** — la seule colonne qui attrape une jumelle media/classe |
| **`explicit-dark-on-light`** | `localStorage` = `dark`, OS en `light` | idem, symétrique |

**Plus** : une assertion **bfcache** (`page.goBack()` puis `pageshow{persisted}`) — le thème et le socket doivent revenir corrects.

**Couleurs et typographie ne sont pas comparées** : la planche référence un bundle `_ds/nocturne-…` absent du dépôt (reconstitué en `ds-shim.css`) et sa police n'est pas celle du design system — **écart assumé**, comme pour MeeshyComposer.

**Desktop** : il n'existe **aucune** planche cible (la maquette ne dessine qu'un cadre 390×844). Le gate desktop est une **régression app-vs-app** (`toHaveScreenshot`, `maxDiffPixels: 120`), et le rapport le libelle **explicitement comme tel** — jamais comme une preuve de conformité au design.

### 9.7 Gate D — budget et cycle de vie

```bash
cd apps/web-v3 && bun run build && node scripts/check-bundle-budget.mjs
bunx playwright test e2e/visual/v3-network-vitals.spec.ts
bunx playwright test e2e/visual/v3-lifecycle.spec.ts
```

`v3-lifecycle.spec.ts` **teste un cycle de vie, pas des pixels** (§ 6.5) : deux `page` dans un **même `context`** (cas E), `Network.emulateNetworkConditions` via CDP (cas D), `page.goBack()` pour le bfcache (cas C), mutation directe de `isActive` en base (cas F), et l'anti-régression **« `visibilitychange:hidden` seul ⇒ zéro requête mutante »**.

---

## 10. La routine

### 10.1 La matrice des écrans — **une seule source, un ordre CALCULÉ**

**Règles de la table, opposables en revue :**

- La colonne **« # »** est **CALCULÉE** — c'est le rang dans l'ordre topologique. **Personne ne la tape.** Elle vaut `—` dans ce document ; l'ordre publié vit dans `ordre.md`, généré.
- Une dépendance se réfère à l'**ID de vue** (`join`, `storyCreate`), **jamais** à un numéro positionnel : un numéro se décale dès qu'on insère une ligne et pourrit en silence toutes les cellules qui le citent — c'était **la moitié du défaut bloquant n°2**.
- **DÉPENDANCE = PRODUCTION D'ÉTAT, PAS NAVIGATION.** Le graphe de NAVIGATION de la planche est **cyclique par construction** (`login ↔ signup`, `callAudio ↔ callVideo`, `profileEdit ↔ password`, `story → comments → story`) : en dériver les dépendances **garantit** des cycles. Les deux graphes restent distincts ; seul celui de production d'état est acyclique.
- **Test d'admission d'une cellule** : *« si cet écran n'existait pas, le CONTENU rendu par celui-ci changerait-il ? »* Un écran de confirmation ne dépend que de ce qui **PRODUIT** l'état qu'il confirme, **jamais** de ce qu'il déverrouille ensuite — cette arête-là est **inverse**, et l'écrire est exactement ce qui fabrique un cycle. *(Application : `rights` ne dépend que de `join`. Ni de `composer`, ni de `storyCreate` — le bloc `isRights` de `MeeshyWebV3.dc.html:239-250` rend le littéral `rights` (`:1103-1108`), **la même liste** que l'accordéon de `join` (`:223` et `:246`), plus le pseudo saisi dans `join` (`:232`). Les trois entrées vers `rights` — `join` (`:765`), `login` (`:773`), `signup` (`:774`) — sont des lignes de **RECETTE**, pas des dépendances : `login`/`signup` **mènent** à `rights` sans en produire le contenu, et les inscrire ferait attendre une confirmation anonyme P0 derrière des écrans d'authentification.)*
- Les blocages **hors web** vivent dans leur **propre colonne**, avec des nœuds préfixés `gw:`, acycliques par construction.
- **Tout chemin absent de la règle `frontend-v3` est servi par `apps/web`** : les 23 routes `admin/*` et les 12 routes d'authentification ne sont pas un trou de la matrice, elles sont **hors périmètre par défaut**.

**Priorités** : **P0** = rôle premier (mission littérale). **P1** = rôle secondaire (mission littérale). **P2** = confort, hors énoncé de mission.

| # | id | Écran | Prio | Route publique v3 | `PathPrefix` de bascule | Dépendances (écrans) | Bloqué par (hors web) | Gate de recette |
|---|---|---|---|---|---|---|---|---|
| — | `linkRedirect` | Ouverture du lien | **P0** | `/l/:token` | `/l` | — | `gw:resolveTarget-linkKey` | 302 en 1 hop, 0 `<script>` hors ThemeScript, OG réels sur le repli, beacon **après** |
| — | `linkExpired` | Lien expiré | **P0** | `/l/:token` (état expiré) | `/l` | `linkRedirect` | — | RSC pur, 2 CTA câblés |
| — | `join` | Rejoindre | **P0** | `/chats/:lien` | `/chats` | `linkRedirect` | — | **Formulaire soumissible SANS JS** ; langue pré-remplie depuis `Accept-Language` (aujourd'hui `'fr'` en dur dans `apps/web/hooks/use-join-flow.ts:24,55`) ; accordéon des droits en `<details>/<summary>` natif ; **les 7 refus du § 6.3.A peints** |
| — | `rights` | Droits du lien / bienvenue | **P0** | `/chats/:lien` | `/chats` | `join` | — | 4 droits rendus depuis la **MÊME source** que l'accordéon de `join` ; recette : atteint depuis `join`, `login` **et** `signup` |
| — | `thread` | Conversation | **P0** | `/chats/:identifiant` | `/chats` | `join` | `gw:bail-anonyme` | Socket chargé **au tap**, jamais avant ; `lang=` sur chaque bulle traduite ; envoi optimiste + file hors-ligne ; **les 6 cas C→H du § 6.5** |
| — | `rich` | Types de messages | **P0** | `/chats/:id` | `/chats` | `thread` | — | 6 variantes rendues par **UN** composant dérivant du TYPE ; transcription vocale via `resolvePrismTranslation()` |
| — | `media` | Médias partagés | **P0** | `/chats/:id/medias` | `/chats` | `thread` | — | Tuiles **cliquables** (inertes aujourd'hui) ; téléchargement à la demande **avec poids affiché** ; audio + transcription au Prisme |
| — | `sheet:lang` *(hors planche)* | Feuille sélecteur de langue | **P0** | overlay, toute route | — | — | — | `<dialog>` natif ; **changer la langue CHANGE le texte lu** (loi « un contrôle a un effet ») |
| — | `story` | Story plein écran | **P0** | `/stories/:id` | `/stories` | — | `gw:optionalAuth-post` | RSC ; `TranslationToggle` avec **`onDisplayedChange` câblé** ; tap gauche/droit + appui long ; `noindex` conservé |
| — | `storyFail` | Story indisponible | **P0** | `/stories/:id` (404 métier) | `/stories` | `story` | `gw:404-indistinguable` | **Écran serveur**, pas un état client ; **jamais de 403** |
| — | `comments` | Post + commentaires | **P0** | `/post/:id` | `/posts` | `story` | `gw:optionalAuth-post`, `gw:optionalAuth-comments` | 3 sources (post/reel/story) ; commentaires descendus par le **Prisme ordonné**, pas rang-1 |
| — | `reelShared` *(hors planche)* | Réel partagé | **P0** | `/reels/:id` | `/reels` | `story` | `gw:optionalAuth-post` | **Réécriture de la logique de `apps/web/components/feed/ReelPlayer.tsx:54-85`** : `preferredLanguages`, `resolvePrismTranslation()`, `TranslationToggle` monté, sortie (chevron) présente |
| — | `moods` *(hors planche)* | Humeur partagée | **P0** | `/moods/:id` | `/moods` | `story` | `gw:optionalAuth-post` | `Post.type=STATUS` rendu par **le même lecteur** ; OG dédié |
| — | `login` | Se connecter | **P1** | `/login?next=/l/:token` | `/login` | — | — | `?next=` restauré après succès ; bandeau « lien gardé de côté » **conditionnel** (aujourd'hui `pending:true` en dur) |
| — | `signup` | Créer un compte | **P1** | `/signup?next=/l/:token` | `/signup` | `login` | — | Disponibilité pseudo/e-mail/téléphone en **UN SEUL** appel |
| — | `home` | Accueil connecté | **P1** | `/` | `/` **(dernier)** | `login` | — | **Cache-first** : aucun spinner si le cache a des données |
| — | `chats` | Liste des conversations | **P1** | `/chats` | `/chats` | `thread`, `login` | — | Delta via `GET /sync` (304), **pas** de refetch complet au focus |
| — | `feed` | Fil | **P1** | `/feed` | `/feed` | `comments`, `reelShared` | — | Rail de stories scrollable **au clavier** ; like/repost **câblés** (sans `onClick` aujourd'hui) |
| — | `reels` | Réels (fil connecté) | **P1** | `/feed/reels` | `/feed` | `feed` | — | Même lecteur que `reelShared` |
| — | `composer` | Composer | **P1** | `/composer` | `/composer` | `home` | — | Brouillon persisté ; publication optimiste + file hors-ligne ; compteur d'humeur **réel** ; choisir « Story » mène à `storyCreate` |
| — | `storyCreate` | Nouvelle story | **P1** | `/stories/new` | `/stories` | `composer` | — | **Audience et Expiration câblées** (statiques aujourd'hui) ; état « publication en cours » |
| — | `links` | Mes liens | **P1** | `/links` | `/links` | `home` | — | Création **exige un compte côté UI** malgré `authOptional` serveur (§ 11) |
| — | `sheet:link` *(hors planche)* | Feuille lien de partage | **P1** | overlay | — | `links` | — | QR, expiration, anonymes autorisés — **chaque champ a un effet** |
| — | `sheet:conv` *(hors planche)* | Feuille nouvelle conversation | **P1** | overlay | — | `chats` | — | — |
| — | `sheet:attach` *(hors planche)* | Feuille pièce jointe | **P1** | overlay | — | `thread` | — | Limite 10 Mo appliquée **et annoncée** |
| — | `sheet:member` *(hors planche)* | Feuille espace membre | **P1** | overlay | — | `home` | — | Remplace la barre d'onglets absente de la planche (§ 11) |
| — | `notifs` | Notifications | **P1** | `/notifications` | `/notifications` | `home` | — | Action « Tout lire » **câblée** |
| — | `notifPrefs` | Préférences de notification | **P1** | `/notifications/preferences` | `/notifications` | `notifs` | — | **11 toggles réellement mutants** (purement visuels aujourd'hui) |
| — | `contacts` | Contacts | **P1** | `/contacts` | `/contacts` | `chats` | — | Canal unique ; **présence conforme à la directive 2026-08-25** (rien hors amitié acceptée) |
| — | `search` | Recherche | **P1** | `/search` | `/search` | `chats`, `feed` | — | Résultats groupés par type |
| — | `settings` | Paramètres (hub) | **P1** | `/settings` | `/settings` | `home` | — | 7 rangées vers les 7 fiches |
| — | `detail-profile` | Réglages — Profil | **P1** | `/settings/profile` | `/settings` | `settings` | — | **Les 3 rangs du Prisme éditables** (lecture seule aujourd'hui) |
| — | `detail-privacy` | Réglages — Confidentialité | **P1** | `/settings/privacy` | `/settings` | `settings` | — | Toggles mutants ; visibilité de présence conforme |
| — | `detail-security` | Réglages — Sécurité | **P1** | `/settings/security` | `/settings` | `settings` | — | 4 niveaux de chiffrement = **vrai groupe de sélection** |
| — | `detail-media` | Réglages — Médias | **P1** | `/settings/media` | `/settings` | `settings` | — | **Stub dans la planche** → contenu à arbitrer (§ 11) |
| — | `detail-message` | Réglages — Messages | **P1** | `/settings/message` | `/settings` | `settings` | — | **« À DÉFINIR » dans la planche** → issue `décision-produit` |
| — | `detail-notification` | Réglages — Notifications | **P1** | `/settings/notification` | `/settings` | `notifPrefs` | — | 6 groupes, dont plage « Ne pas déranger » 22:00-08:00 |
| — | `detail-application` | Réglages — Application | **P1** | `/settings/application` | `/settings` | `settings` | — | **Sélecteur clair / sombre / système réel** (absent de la planche) + langue d'interface |
| — | `profileEdit` | Modifier le profil | **P1** | `/settings/profile/edit` | `/settings` | `detail-profile` | — | Upload bannière/avatar réel ; compteur bio |
| — | `password` | Mot de passe | **P1** | `/settings/security/password` | `/settings` | `detail-security` | — | Règles **réactives à la saisie** (pré-cochées en dur aujourd'hui) |
| — | `communities` | Communautés | **P2** | `/communities` | `/communities` | `home` | — | Hors énoncé de mission — après tous les P1 |
| — | `calls` | Appels (historique) | **P2** | `/calls` | `/calls` | `home` | — | Hors énoncé de mission |
| — | `callAudio` | Appel audio | **P2** | `/calls/:id` | `/calls` | `calls` | — | `next/dynamic` **exclusivement** ; `CallManager` monté sur `call:incoming`, jamais dans le layout |
| — | `callVideo` | Appel vidéo | **P2** | `/calls/:id?video` | `/calls` | `callAudio` | — | idem |

**44 lignes** : les 37 vues de `vues.json` + 7 surfaces hors planche (`sheet:lang`, `sheet:link`, `sheet:conv`, `sheet:attach`, `sheet:member`, `reelShared`, `moods`). **Restent au legacy, sans action** : les 23 routes `admin/*` et les 12 routes d'authentification listées au § 4.4.

### 10.2 Le gate d'ordre — `docs/product/MeeshyWebV3Design/ordre-des-ecrans.js`

> **Le gate est LIVRÉ, et il est en JavaScript, pas en `awk | tsort`.** L'esquisse shell
> ci-dessous a servi à établir le besoin ; l'implémentation retenue lit `matrice.json`
> (donnée structurée) au lieu d'analyser un tableau Markdown, ce qui lui permet de vérifier
> **quatre** choses au lieu de deux, chacune avec son code de sortie **éprouvé sur une
> matrice volontairement fausse** : `rc=1` cycle (nommé), `rc=2` dépendance pendante,
> `rc=3` vue de la planche absente — ou ligne hors planche non déclarée, `rc=4` écran P0
> qui attend un écran de priorité inférieure. La matrice porte **44 lignes** : les 37 vues
> de `vues.json` plus 7 surfaces exigées par la mission que la planche ne dessine pas,
> chacune marquée `hors_planche: true` — le gate impose la **couverture** de la planche,
> il n'interdit pas d'aller au-delà, mais il refuse qu'on y aille en silence.
> `ordre.md` est sa sortie, et n'est jamais écrit à la main.

<details><summary>Esquisse shell d'origine (conservée pour mémoire, non utilisée)</summary>


```bash
#!/usr/bin/env bash
# rc=0 : DAG, stdout = ordre topologique | rc=1 : CYCLE (tsort le nomme) | rc=2 : référence inconnue
set -o pipefail
awk -F'|' '
  !H && /pendances/ { for(i=1;i<=NF;i++){ h=$i; gsub(/^[ \t]+|[ \t]+$/,"",h)
        if(h ~ /pendances/) DEP=i; if(h=="#") NUM=i; if(h ~ /^id/) ID=i }
      if(DEP&&NUM&&ID) H=1; next }
  H && /^\| *[0-9]+ *\|/ { n=$NUM; id=$ID; gsub(/[^0-9]/,"",n); gsub(/[ `*]/,"",id)
        NAME[n]=id; ORDER[++c]=n; DEPS[n]=$DEP }
  END{ if(!H){ print "En-tete (# / id / Dependances) introuvable" > "/dev/stderr"; exit 2 }
       for(i=1;i<=c;i++){ n=ORDER[i]; k=split(DEPS[n],a,","); e=0
         for(j=1;j<=k;j++){ x=a[j]; gsub(/[^0-9]/,"",x)
           if(x!=""){ if(!(x in NAME)){ printf "REF INCONNUE: #%s cite #%s\n",n,x > "/dev/stderr"; exit 2 }
                      printf "%s %s\n", NAME[x], NAME[n]; e=1 } }
         if(!e) printf "%s %s\n", NAME[n], NAME[n] } }
' "$1" | tsort
```

**Trois exécutions, résultats mesurés** :
- matrice portant `| 5 | rights | ... | #3, #22, #23 |` ⇒ **rc=1**, stderr : `tsort: -: input contains a loop: composer / storyCreate / rights`. **Le gate NOMME le cycle.**
- cellule ramenée à `#3` ⇒ **rc=0**.
- cellule pointant `#99` (ligne inexistante) ⇒ **rc=2**, `REF INCONNUE: #5 cite #99` — le cas qu'un tri topologique seul **ne voit pas**.

</details>

**Notes d'implémentation opposables** :
- L'en-tête est **LU** (colonnes repérées par leur libellé, pas par leur index) : ajouter une colonne ne casse pas le gate. Une matrice sans en-tête `#` / `id` / `Dépendances` sort en rc=2 — **la table doit rester lisible par la machine**, contrainte assumée.
- Chaque ligne sans dépendance émet la paire `x x` : GNU `tsort` la traite comme un nœud isolé, donc **les racines apparaissent** au lieu d'être muettes.
- **`tsort` ÉMET une sortie même sur cycle** : le gate se lit sur le **CODE DE SORTIE**, jamais sur `stdout`.
- La matrice ci-dessus étant **nommée** (IDs, pas numéros), la même commande fonctionne en retirant les deux `gsub(/[^0-9]/,"",…)` : le graphe est nommé de bout en bout et le **rang calculé** remplace la colonne « # ».
- **`tsort` est l'ACCEPTATION (acyclicité), pas le PRODUCTEUR de l'ordre** : sa sortie est arbitraire entre nœuds indépendants (mesuré : sur la fixture corrigée, `composer` P1 sort avant `linkRedirect` P0). L'ordre **publié** dans `ordre.md` vient d'un **Kahn déterministe départagé par Prio (P0 < P1 < P2), puis par l'ordre de `const MAP`**. Sans ce départage, « l'ordre officiel » changerait à chaque exécution.

### 10.3 Le découpage en lots (= milestones GitHub)

| Lot | Milestone (nommé par le RÉSULTAT) | Contenu | Bloque |
|---|---|---|---|
| **L-0.5** | « La v3 est joignable et sa conformité se mesure » | `apps/web-v3` (package Next, port 3300, `assetPrefix:'/__v3'`, `output:'standalone'`, **aucun `basePath`**) ; sa `Dockerfile` calquée sur `apps/web/Dockerfile` ; l'entrée dans `.github/workflows/docker.yml` (`paths: apps/web-v3/**`, détecteur `*"apps/web-v3/"*`, image `meeshy-web-v3`, **nommage disjoint de `web`**) ; l'entrée dans `ci.yml` (matrice de tests + **type-check BLOQUANT, jamais le ratchet**) ; le service `frontend-v3` dans `docker-compose.dev.yml` et `docker-compose.prod.yml` avec `priority=100` et une règle **réduite à `PathPrefix('/__v3')`** ; la fenêtre tmux `web_v3` ; le **nettoyage du `Makefile`** (`WEB_V2_DIR:88`, `WEB_V2_PID:102`, fenêtres `:1213-1214` et `:1534-1535` pointant `apps/web_v2` inexistant sur le port 3200 déjà pris) ; l'origine `:3300` dans `CORS_ORIGINS`/`ALLOWED_ORIGINS` ; le compose de **staging** (absent du dépôt) avec `frontend-staging.priority=1` ; l'**alignement du lockfile** ; **et toute la machine du § 9.2, ligne de base comprise** | tout |
| **L0** | « Le socle ne peut plus diverger » | `packages/design-tokens`, `packages/icons` + sprite commité, moteur de thème **unique** + `ThemeScript`, layout racine serveur, `lib/realtime/{read,participate,lifecycle}.ts`, `lib/api/guest-session.ts`, les lints de zone et de placement | tout écran |
| **L1** | « Un lien partagé s'ouvre en un aller-retour » | `linkRedirect`, `linkExpired`, `next/og`, Route Handler, beacon. **Bascule `/l`.** | L2 |
| **L2** | « On entre dans une conversation sans compte » | `join`, `rights`, `thread`, `rich`, `media`, `sheet:lang`, file hors-ligne, socket différé. **Bloqué par `gw:bail-anonyme`.** Bascule `/chats` | L4 |
| **L3** | « Un contenu partagé se lit intégralement sans compte » | `story`, `storyFail`, `comments`, `reelShared`, `moods`. **Bloqué par `gw:optionalAuth-post` ET `gw:optionalAuth-comments`** (les deux ensemble, sinon `comments` reste mort). Bascule `/stories`, `/posts`, `/reels`, `/moods` | — |
| **L4** | « On garde son identité sans perdre son lien » | `login`, `signup`. Bascule `/login`, `/signup` | L5 |
| **L5** | « Je gère mes conversations et mes contenus » | `home`, `chats`, `feed`, `reels`, `composer`, `storyCreate`, `links`, `contacts`, `search`, les 5 feuilles | L6 |
| **L6** | « Je règle mon compte » | `notifs`, `notifPrefs`, `settings`, les 7 fiches, `profileEdit`, `password`. **Bascule `/` en dernier** | — |
| **L7** | « Confort » | `communities`, `calls`, `callAudio`, `callVideo` | — |
| **L8** | « `apps/web` ne sert plus rien » | **milestone SÉPARÉ**, ouvert **seulement** quand le routeur legacy ne sert plus aucune route : suppressions dans `apps/web` (§ 3.3), retrait du service `frontend` | — |

**La v3 est livrée quand L-0.5 → L6 sont fermés. L7 n'est pas une condition de livraison. L8 est postérieur à la livraison.**

### 10.4 Ce que fait UNE itération (un agent, une issue)

1. `gh issue view <n>` puis `gh project item-edit … --field Status --value "In Progress"` (scope `project` requis : `gh auth refresh -s project,read:project`).
2. Ouvrir `docs/product/MeeshyWebV3Design/cible/<id>.png` et la section correspondante de `MeeshyWebV3.dc.html`.
3. **RED** — écrire le test de comportement qui **échoue** (`__tests__/` + `jest-axe`), jamais l'inverse.
4. **GREEN** — écrire le minimum. **Interdit** : ajouter à un fichier déjà hors budget 800-1100 lignes (on **extrait d'abord**).
5. **REFACTOR** — vérifier les cinq corollaires du § 3.2.
6. **Gates, dans cet ordre, arrêt au premier rouge** :
   `ordre-des-ecrans.sh` (**rc=1 cycle / rc=2 référence inconnue cassent la CI**) → `tsc --noEmit` (zéro erreur, pas de ratchet) → `bun run lint` → `bun run test` → **Gate B** → **Gate C** → **Gate D**.
7. Poser la capture rendue **à côté de sa cible** dans le commentaire de l'issue, avec les **trois scores** et les **quatre colonnes de thème**.
8. Commit `feat(web-v3): <résultat attendu>` + `Closes #n`. **Poussé directement sur `dev`** (décision du porteur), donc **jamais sans les gates verts**. Commentaire de clôture listant les dimensions mûres et **ouvrant une issue par dimension non mûre — dans le milestone SUIVANT, jamais le courant** (§ 10.6).
9. Si l'issue bascule une route : **ajouter le `PathPrefix`** au routeur `frontend-v3` (dépôt **ET** `/opt/meeshy/production/docker-compose.yml`), et **rejouer une fois le retrait en staging** — preuve du retour arrière.

### 10.5 La revue croisée

**Passe Sonnet — après CHAQUE issue.** Cinq questions, réponse écrite dans le commentaire :
1. La règle de placement (A) et (B) est-elle respectée ? (test des cinq fichiers, § 3.1)
2. Un `any` a-t-il été introduit ? Un fichier dépasse-t-il 1100 lignes ?
3. Un contrôle est-il **inerte** (rendu sans effet) ? *(le défaut de `PostCard` variante `block` : cliquer une traduction ne changeait rien)*
4. Un `lang=` manque-t-il sur un texte résolu par le Prisme ?
5. Un `<Link>` traverse-t-il la frontière de zone (§ 4.9) ?
Rejet ⇒ retour à l'étape 4.

**Passe Opus — à la fermeture d'un LOT, jamais par issue.** Quatre questions **nommées**, chacune répondue **par écrit** dans le commentaire de clôture du milestone :
- **(a)** *Leçon 261* — cette règle gouverne-t-elle un **AUTRE type de contenu** que ceux énumérés, et **qui le résout** ? *(une énumération de sites porte deux affirmations, dont la seconde n'est presque jamais vérifiée)*
- **(b)** *Cycle 122* — **qui AFFICHE** ce que ce lot élit ? Un correctif dont la valeur n'atteint aucun lecteur n'a corrigé personne.
- **(c)** *Cycles 123/125* — **que transporte ce lot À CÔTÉ** de ce qu'il affiche ? Lire l'objet remis **ligne à ligne**.
- **(d)** Le lot a-t-il créé une **jumelle** (second résolveur, second transport, seconde table de couleurs, second dossier à une lettre près) ? Et le budget du § 8 tient-il **CUMULATIVEMENT** — la réponse se lit dans le rapport à trois lignes par groupe (§ 8.4), pas dans une opinion.

### 10.6 La condition d'arrêt — **observable et monotone**

Trois amendements qui la rendent atteignable :

1. **Le lot GÈLE son ensemble d'issues à son ouverture.** Toute issue née d'une fermeture va au milestone **SUIVANT**, par construction, jamais au courant. Sans cela, la condition porte sur un ensemble que la routine **agrandit en le vidant**.
2. **« La passe Opus n'a ouvert aucune issue bloquante » est remplacé** par : **les quatre réponses (a)–(d) sont consignées par écrit** dans le commentaire de clôture. La condition observable est « les quatre réponses sont là », pas « le juge est content ».
3. **Plafond : DEUX passes Opus par lot.** À la troisième, l'arbitrage remonte au porteur.

**Un lot est terminé quand, et seulement quand** :
- son ensemble **gelé** d'issues est fermé, chacune avec sa preuve (commit, gate, mesure) ;
- les **quatre gates** sont verts sur `dev` ;
- `apps/web-v3/e2e/visual/report/index.html` montre les écrans du lot **sous seuil dans les quatre colonnes de thème** ;
- les **quatre réponses (a)–(d)** sont consignées ;
- **et** le `PathPrefix` de chacune de ses routes est **actif en production**, avec un **retrait rejoué au moins une fois en staging**. *Sans cette dernière clause, « incrémental » reste une intention.*

### 10.7 Quand un lot échoue **deux fois de suite**

Un lot « échoue » quand la passe Opus rend un verdict bloquant, ou quand un gate reste rouge après deux itérations de correction sur la même issue.

| Occurrence | Ce qui se passe |
|---|---|
| **1ʳᵉ** | La routine corrige et rejoue. L'issue reste ouverte, `Status = In Progress`. |
| **2ᵉ** | **La routine S'ARRÊTE sur ce lot.** Elle : (1) pose `Status = Blocked` sur les issues restantes ; (2) ouvre **une issue `décision-produit` assignée au porteur**, dont le corps est le **diff des deux tentatives** et la question précise à trancher ; (3) **retire le `PathPrefix`** de toute route du lot déjà basculée — le legacy reprend le trafic, sans coupure ; (4) passe au **lot suivant non bloqué** de `ordre.md`, s'il en existe un ; sinon elle s'arrête. |
| **3ᵉ (jamais atteinte)** | Interdite : le plafond de deux passes Opus (§ 10.6) et l'arrêt ci-dessus la rendent inaccessible. |

**Rien n'est jamais forcé sur `dev` sous un gate rouge**, et aucune route ne reste basculée sous un lot bloqué.

---

## 11. Les questions ouvertes (à trancher par le porteur)

Ce qui a été **TRANCHÉ et sort de la liste** : le domaine de la v3 (apex `meeshy.me`, bascule par `PathPrefix`, aucun nouveau domaine public) ; le transport de la lecture anonyme (**SSE annulé**, pas différé) ; le `leave` invité (le navigateur ne l'appelle jamais) ; l'ordre d'implémentation (calculé, jamais écrit).

| # | Question | Pourquoi elle bloque | Ce qu'on fait sans réponse |
|---|---|---|---|
| 1 | **Lecture anonyme d'un post — confirmer l'ouverture.** `GET /posts/:postId` (`routes/posts/core.ts:672-673`) **et** `GET /posts/:postId/comments` (`routes/posts/comments.ts:61-62`) sont `requiredAuth` — **et `allowAnonymous:false` est aussi la CIBLE documentée** (`docs/product/api-simplification/social.md:32,253`). Confirmer `optionalAuth` + filtre `visibility=PUBLIC`, **sur les deux ensemble**. | **Le rôle premier n'est pas dégradé, il est FERMÉ.** Sans cette réponse, L3 entier est bloqué. | Rien. L3 ne démarre pas. |
| 2 | **N minutes du bail invité.** Combien de temps la place d'un invité parti reste-t-elle tenue ? Arbitrage : « ne pas perdre sa place en répondant dans WhatsApp » **contre** « ne pas bloquer un lien à 5 places ». | Gouverne le balayage serveur (§ 6.4) et donc L2. | Défaut **N = 10 min** (deux battements manqués), réversible par configuration. |
| 3 | **Un lecteur anonyme peut-il s'abonner à la room d'un post ?** Aujourd'hui **NON**, par décision écrite (`PostReactionHandler.ts:470`). L'ouvrir signifie **étendre `resolveConsumptionTarget` à un acteur sans identité**. | Détermine si la lecture partagée reste statique ou gagne du temps réel. | **NON** — la lecture partagée reste statique + revalidation au focus (§ 2). |
| 4 | **Iconographie — cohabitation.** La planche impose Phosphor ; **424 fichiers de `apps/web` importent `lucide-react`** (mesuré). Proposition : Phosphor (sprite) partout dans `apps/web-v3`, `lucide-react` **jamais** dans la v3, gelé dans `apps/web` jusqu'à extinction (lot L8). | Sinon un agent réintroduira `lucide-react` dans la v3 « pour aller vite ». | Phosphor seul dans `apps/web-v3` ; gate CI qui refuse tout import de `lucide-react`. |
| 5 | **Jetons de la planche.** `MeeshyWebV3.dc.html:10` référence `_ds/nocturne-beda26e6-…/styles.css`, **absent du dépôt** ; `ds-shim.css` en est la **reconstitution**, déjà commitée et fonctionnelle. Fournir le bundle réel, ou **valider la reconstitution** que nous graverons dans `packages/design-tokens/` ? | Détermine si les couleurs de la v3 sont fidèles ou approximées. | La reconstitution `ds-shim.css` est adoptée telle quelle ; l'écart typographique/chromatique reste **assumé** (Gate C ne compare ni couleur ni typo). |
| 6 | **Pas de barre d'onglets.** La planche n'a **aucune** navigation persistante ; son rôle est repris par deux FAB + la feuille « Espace membre ». Assumé pour la v3 mobile, ou faut-il une barre d'onglets sur `(connected)` ? | Change la disposition de tous les écrans P1. | Assumé — `sheet:member` remplit le rôle. |
| 7 | **7 langues et RTL.** Locales réellement peuplées : `en`, `es`, `fr`, `pt` ; `de`/`it` déclarées avec repli anglais ; **`ar` inexistante, aucun RTL dans le dépôt**. `ar` fait-il partie de la v3 (donc RTL dès L0), ou est-ce un lot ultérieur ? | RTL dans le socle coûte peu ; RTL après coup coûte cher. | `RTL_LOCALES` et `dir="rtl"` sont **posés dès L0** (coût nul sans locale `ar`), mais `ar` n'est **pas peuplée**. |
| 8 | **Appels dans le périmètre ?** `communities`, `calls`, `callAudio`, `callVideo` sont **absents de l'énoncé de mission** mais présents dans la planche, et pèsent 25 événements `call:*` + les 1350 lignes de `CallManager`. P2 confirmé, ou hors v3 ? | Détermine si L7 existe. | **P2** — après tous les P1, hors condition de livraison. |
| 9 | **Faille des liens tracés.** `POST /api/v1/tracking-links` est monté en `authOptional` et cinq routes de gestion **échouent ouvertes** quand `trackingLink.createdBy` est nul — « un changement de produit, pas seulement de sécurité » (`docs/product/api-simplification/platform.md:305`). La v3 exige un compte côté UI ; **confirmer le durcissement serveur en parallèle ?** | La v3 seule ne ferme pas le trou (l'API reste ouverte). | UI fermée côté v3 ; issue gateway compagnon ouverte, non bloquante pour L5. |
| 10 | **Réglages « Médias » et « Messages ».** `detail-media` est un **stub** dans la planche ; `detail-message` porte littéralement **« À DÉFINIR »**. Quel contenu ? | Deux écrans P1 sans spécification. | Deux issues `décision-produit` ; les écrans rendent un état vide **dessiné**, jamais un écran blanc. |
| 11 | **`view=thread` (fil de réponses).** La capacité n'existe pas côté serveur (`?replyToId=` ignoré). Attendre, ou l'ouvrir ? | Régime 3 : **aucun contrôle n'est exposé** tant que la capacité manque. | Non exposé. Issue `décision-produit`. |

---

> **Dernier mot, méthodologique.** Ce document a été réécrit après deux revues qui ont attrapé, chacune à sa manière, la même famille de défaut : *un mécanisme choisi pour un contenu que personne n'a le droit de recevoir* (SSE devant deux `requiredAuth`), *une garde posée à côté de ce qu'elle prétend garder* (le filtre d'aperçu de lien chez le consommateur), *un ordre écrit deux fois donc divergent deux fois* (la prose du § 8 contre la colonne Dépendances), *un signal qui se déclenche quand il ne faut pas et se tait quand il faudrait* (`visibilitychange:hidden` pour `leave`). La question à poser à tout mécanisme de ce document n'est donc pas « fonctionne-t-il ? » mais : **la charge a-t-elle le droit de partir, qui l'affiche, et qu'est-ce qui part À CÔTÉ ?**
---

## Annexe — les mesures, et la commande qui les rend

Un chiffre de ce document sans commande est un chiffre qui dérivera. Les
suivants ont été mesurés le 2026-08-30 depuis la racine du dépôt ; chacun se
rejoue en une ligne. **Un agent qui trouve un écart met à jour la valeur ET la
date — il n'ajoute pas une seconde valeur ailleurs.**

| Mesure | Valeur | Commande |
|---|---:|---|
| Glyphes Phosphor distincts dans la planche | **72** | `grep -o 'ph-[a-z0-9-]*' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html \| grep -v '^ph-fill$' \| sort -u \| wc -l` |
| Occurrences de classes d'icône dans la planche | **76** | `grep -o 'ph ph-[a-z0-9-]*\|ph-fill ph-[a-z0-9-]*' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html \| wc -l` |
| Sprite des 72 glyphes — brut / gzip | **29,4 Ko / 8,8 Ko** | voir `packages/icons/scripts/build-sprite.ts` (lot L0) ; méthode : concaténation des `assets/regular/<nom>.svg` de `@phosphor-icons/core@2.1.1` en `<symbol viewBox="0 0 256 256">`, puis `gzip -9` |
| Fonte `@phosphor-icons/web` regular | **144 Ko woff2 + 80 Ko css** | `du -h node_modules/@phosphor-icons/web/src/regular/Phosphor.woff2 …/style.css` |
| `<div>` dans la planche | **350** | `grep -o '<div' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html \| wc -l` |
| `<header>`/`<nav>`/`<main>`/`aria-hidden` dans la planche | **0** | `grep -c 'aria-hidden' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html` |
| Routes `apps/web/app/admin/*` | **23** | `find apps/web/app/admin -name page.tsx \| wc -l` |
| Fichiers de `apps/web` mentionnant `lucide-react` | **424** (dont **392** avec un `import … from`) | `grep -rl lucide-react apps/web --include=*.tsx --include=*.ts \| grep -vc node_modules` |
| Appels `io(...)` concurrents dans `apps/web` | **3** | `connection.service.ts:196`, `notification-socketio.singleton.ts:119`, `websocket.service.ts:107` |
| Fichiers dans `apps/web/components/conversations/` | **204** | `find apps/web/components/conversations -type f \| wc -l` |
| Jumelles à une lettre | `components/video-call` **et** `components/video-calls` | `ls -d apps/web/components/video-call*` |
| Couleurs hexadécimales en dur dans `apps/web` | **304** | `grep -roE '#[0-9a-fA-F]{6}\b' apps/web/components apps/web/app \| wc -l` |
| Routes de `apps/web` exportant `generateMetadata` | **16 sur ~120** — et **0** des 4 routes du rôle premier | `grep -rl generateMetadata apps/web/app \| wc -l` |
| OG du lien partagé | `title:''`, `description:''`, `images:[]` | `apps/web/app/l/[token]/layout.tsx:4-10` |
| Page du lien partagé | **550 lignes `'use client'`** | `wc -l 'apps/web/app/l/[token]/page.tsx'` |
| Mur d'authentification sur une story deep-linkée | `<AuthGuard requireAuth>` | `apps/web/components/feed/FeedProviders.tsx:22` |
| `app/post/[postId]/page.tsx` | **4 lignes** (ré-export ; le vrai client est `app/feeds/post/[postId]/page.tsx`) | `wc -l 'apps/web/app/post/[postId]/page.tsx'` |
| Appelants web de `GET /sync` (moteur delta, 1035 lignes) | **0** | `grep -rn '/sync' apps/web --include=*.ts --include=*.tsx` — seul `lib/sync/sync-seq-state.ts` existe, et il ne fait que suivre des séquences |

**Ce que ce tableau dit, en une phrase** : aujourd'hui un lien Meeshy partagé
dans une messagerie rend une carte de preview **vide**, son contenu exige une
hydratation complète avant le premier pixel, et une story deep-linkée bute sur
un mur d'authentification — c'est-à-dire que les trois gestes du rôle premier
sont cassés, chacun pour une raison différente et mesurée.
