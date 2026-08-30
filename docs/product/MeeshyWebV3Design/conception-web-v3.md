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
- **Ce n'est pas une réécriture du socle.** Next 15.5.23 / React 19.2.8 / TanStack Query / Socket.IO / `packages/shared` restent. *(Cette ligne disait `19.2.7` : c'était la version **résolue** à la date du document, pas une décision. L-0.5 l'a alignée sur ce que `apps/web/package.json` déclarait déjà — `^19.2.8` — en montant l'épingle `overrides` de la racine ; direction tranchée et gate rejoué en § 2 ci-dessous.)* `resolvePrismTranslation()`, `resolveSharedAccess()`, `GET /sync`, le persister IndexedDB, `use-post-room.ts`, `use-post-socket-cache-sync.ts` sont **réutilisés**, jamais réécrits.
- **Ce n'est pas une reproduction pixel de la planche.** La planche fait foi sur la **disposition, la hiérarchie, les états et les gestes**. Ses `<div onClick>` (mesuré aujourd'hui : **350 `<div>`, 0 `<header>/<nav>/<main>`, 0 `aria-hidden`** dans `MeeshyWebV3.dc.html`), sa fonte d'icônes complète et sa typographie sont explicitement écartés — écart assumé, comme la doctrine MeeshyComposer l'a établi pour iOS.

---

## 2. La stack retenue

**Règle de lecture du tableau** : une version marquée « **résolu** » a été lue dans `bun.lock` à la date de ce document. Une version marquée « **déclaré** » vient d'un `package.json` et **diverge** du lockfile — c'est un fait, pas une approximation. Un poids marqué « **mesuré** » a été produit par une commande reproductible, citée. Un poids marqué « **à établir (L-0.5)** » n'a pas de chiffre : il n'y en aura qu'après le premier `next build` de `apps/web-v3`, et **aucun agent n'a le droit d'en inventer un**.

> **Fait relevé en L-0.5, et la DIRECTION qui a été prise.** Le constat d'origine : `bun.lock` était en retard sur les `package.json` — `react@19.2.7` / `react-dom@19.2.7` résolus alors que `apps/web/package.json` déclare `^19.2.8` ; `idb-keyval@6.3.0` résolu quand le manifeste déclarait `^6.2.2` ; `@playwright/test` résolu **deux fois** (`1.61.1` à la racine, `1.62.1` pour `@meeshy/web`) ; `zustand@5.0.14` résolu et déclaré `^5.0.14` (le doc précédent disait 5.0.15 — c'est LUI qui avait tort).
>
> Deux directions rendaient lock et manifestes concordants, et elles ne coûtent pas la même chose. **Direction retenue : le LOCK monte vers les manifestes** — c'est ce que le critère de fin nomme, et c'est la seule qui reste possible ici, `apps/web-v3/package.json` épinglant `react`/`react-dom` à `19.2.8` **exact**. Concrètement, l'épingle `overrides` de la racine passe de `19.2.7` à `19.2.8`. **C'est un bump de dépendance de `apps/web`, l'app qui sert le trafic, pas un simple ré-encodage de lock** : il est assumé comme tel, et il a son gate — suite complète de `apps/web` rejouée sur les paquets réellement installés (`apps/web/node_modules/react/package.json` = `19.2.8`), **818 suites / 14 975 tests verts, 21 ignorés, 154 s**.
>
> Ce que cette direction ne règle PAS, et qu'il ne faut pas lire comme réglé : trois épingles d'`overrides` restent posées SOUS une portée qu'un workspace déclare — `dompurify` `3.4.11` (contre `^3.4.12` web, `^3.4.13` gateway), `postcss` `8.5.13` (contre `^8.5.26` web), `uuid` `11.1.1` (contre `^14.0.2` gateway, écart **majeur**). Les monter change ce qui est installé pour des consommateurs transitifs de `apps/web` ET du gateway : trois bumps avec leurs propres gates, chacun son issue — ouverte : **#4417**. La dette est **déclarée et gardée dans les deux sens** par `scripts/check-lockfile-alignment.mjs` (`OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS`), qui rougit aussi bien sur une quatrième épingle non déclarée que sur une entrée de la liste qui aurait cessé de retarder.
>
> Enfin, `tests/package.json` **n'appartient pas au graphe de workspaces** (`workspaces: ["apps/*","services/*","packages/*"]` ne le matche pas, `bun.lock` n'a aucune entrée `tests`, `tests/node_modules` n'existe pas) : rien de ce qu'il déclare n'est installé, et il ne compte donc dans aucun alignement — un bump écrit là est **inerte**, et le garde de racine ne le lit pas. Ce que l'issue prescrivait pour `tests/`, c'est le **réalignement de `tests/playwright.config.ts`** (il lançait `cd ../frontend` et `cd ../gateway`, deux répertoires inexistants ; il lance désormais `../apps/web` et `../services/gateway`) : c'est fait, et c'est une réparation de chemins, pas un alignement de lock. Le harnais reste **non installé** tant que `tests` n'entre pas dans `workspaces` — décision d'infrastructure à part entière, ouverte en **#4418** (« il est installé et exécutable, ou il disparaît »).
>
> Rejeu de tout ce qui précède : `node scripts/check-lockfile-alignment.mjs --self-test && node scripts/check-lockfile-alignment.mjs`.

| Préoccupation | Choix | Version EXACTE | Poids gzip (client) | Pourquoi | Alternative rejetée |
|---|---|---|---|---|---|
| **Framework** | Next.js App Router, package séparé `apps/web-v3` | `next@15.5.23` (résolu) | plancher **à établir (L-0.5)** — mesuré par `check-bundle-budget.mjs` au premier build | Seul moyen d'avoir `generateMetadata`/`next/og` par contenu ET la jonction anonyme→inscrit sans changer d'origine. Même origine que le legacy ⇒ le cookie `meeshy_session` (`apps/web/middleware.ts:8`, sans `Domain=`) suit à travers la frontière de zone. | **Astro/Vite `apps/web-lite`** : duplique à vie tout composant partagé entre rôles et fragmente le déploiement. **Sous-domaine `v3.meeshy.me`** : impossible — les liens `/l/<token>` déjà partagés pointent l'apex (§ 4). |
| **Rendu — rôle premier** | Server Components par défaut sous `app/(public)/`, îlots `'use client'` nommés | `react@19.2.8` / `react-dom@19.2.8` (**résolus après L-0.5** ; `^19.2.8` déclaré par `apps/web`, `19.2.8` exact par `apps/web-v3`, `19.2.8` épinglé dans les `overrides` de la racine — une seule résolution, gardée) | îlots seuls | Aujourd'hui `apps/web/app/story/[postId]/page.tsx`, `app/reel/[postId]/page.tsx` et **`apps/web/app/feeds/post/[postId]/page.tsx`** (le vrai porteur de `'use client'` ; `app/post/[postId]/page.tsx` n'est qu'un ré-export de 3 lignes) sont clients en première ligne : 0 route sur 7 n'exporte `generateMetadata`. **Et le vrai mur est ailleurs** : la story deep-linkée est derrière `AuthGuard requireAuth` monté dans `components/feed/FeedProviders.tsx:22`. | **Coquille RSC déléguant au client existant** : répare l'OG pour le crawler, ne retire pas un octet pour l'humain. |
| **Rendu — `/l/:token`** | Route Handler serveur : `resolve` + clic en un appel serveur-à-serveur, réponse **302**, HTML de repli porteur des OG réels ; fingerprint en `sendBeacon` **après** | — | **0 Ko JS** | `apps/web/app/l/[token]/page.tsx` fait 550 lignes `'use client'` et enchaîne POST-clic **puis** GET-resolve avant toute redirection ; son `layout.tsx` a `title:''`, `description:''`, `images:[]`. | **Optimiser la page cliente** : paie le plancher framework de sa page hôte + un aller-retour de trop. |
| **Icônes** | Sprite SVG `<symbol>/<use>`, `packages/icons/sprite.svg`, généré depuis `@phosphor-icons/core`, **exactement les 72 glyphes** de la planche | `@phosphor-icons/core@2.1.1` (devDep de la RACINE) | **8 911 o gzip / 31 682 o brut — mesuré le 2026-08-30 sur l'actif COMMITÉ** (sprite des 72 symboles, `viewBox 0 0 256 256`) | La fonte `@phosphor-icons/web` coûte **224 Ko** (144 Ko woff2 regular + 80 Ko css) pour une graisse, soit **25×** le sprite ; les icônes existent toutes dans la source (1512 fichiers, aucune manquante). Le `<use>` s'affiche **sans JS exécuté**. La planche rend **73 jetons** `ph-*`, qui font **72 symboles** : 71 glyphes nus pris dans `assets/regular/`, plus **un COUPLE graisse+glyphe**. `ph-fill` n'est pas du bruit à jeter — c'est le qualifiant du bouton LECTURE, écrit `class="ph-fill ph-play"` sur les quatre surfaces qui le portent (cercle de reel 68 px, lecteur audio 44 px, story 56 px, bulle vocale 38 px). Le couple se résout en `<symbol id="ph-fill-play">` pris dans `assets/fill/play-fill.svg` ; `ph-play` nu n'étant réclamé nulle part, le triangle CREUX n'est pas servi du tout. Servir le creux à sa place serait un écart de **disposition**, hors de l'écart typographique que la v3 assume. Vérification : `grep -c '<symbol' packages/icons/sprite.svg` → 72. | **`@phosphor-icons/react`** : bundle les 6 poids par icône. **Fonte** : 25× plus lourde, et `unpkg.com` est bloqué (403) par la politique d'egress. |
| **Styles & jetons** | Tailwind (utilitaires) + `packages/design-tokens/tokens.css` — **unique** table de custom properties, importée par `apps/web-v3/app/globals.css` | `tailwindcss@3.4.19` (résolu) | CSS purgé — **à établir (L-0.5)**, plafond 20 Ko gzip/route | Ferme les trois têtes de `apps/web` : `:root` shadcn HSL + `--gp-*` de `globals.css` + `components/v2/theme.ts` (objet JS hex dupliqué), plus 254 hex en dur dans 41 `.tsx`. `ds-shim.css` (déjà commité dans `docs/product/MeeshyWebV3Design/`) est la reconstitution des jetons de la planche : il **alimente** `tokens.css`, il ne le remplace pas. | **Tailwind v4** : gain de build réel, hors chemin critique ; chantier séparé. |
| **Thème dark/light/system sans FOUC** | **UNE** source : `darkMode: ["class"]`. `ThemeScript` inline **obligatoire dans le layout racine**, y compris `(public)` : il lit `localStorage` puis, à défaut, `matchMedia('(prefers-color-scheme: dark)')`, et pose la classe **avant le premier pixel**. `color-scheme` suit la classe. **ZÉRO `@media (prefers-color-scheme)` dans `tokens.css`.** | — | **≤ 400 o inline** (gate) | **Le cas SANS JavaScript n'est pas tranché par cette ligne** [revue #4413] : la coquille rend `<html class="dark">` avant de rien savoir du lecteur, donc un lecteur sans JS reçoit du SOMBRE quelle que soit la préférence de son appareil, et n'a aucun contrôle pour en changer. Trois portes (assumer le sombre ; un `@media` qualifié par `:not(.dark):not(.light)`, qui n'est PAS la jumelle ci-dessous ; la classe rendue côté serveur d'après `Sec-CH-Prefers-Color-Scheme`) sont posées dans `packages/design-tokens/README.md` § « Pourquoi le schéma sombre est porté par `:root` ». Tant qu'elles ne sont pas arbitrées, le gate reste strict. L'hybride « media pour les tokens + classe pour Tailwind » est une **jumelle divergente** : utilisateur en préférence explicite CLAIRE sur OS SOMBRE ⇒ tokens sombres, utilitaires `dark:` clairs. `prefers-color-scheme` ne gouverne donc QUE la valeur par défaut de la classe, jamais un token. | **`next-themes`** : déclaré dans `apps/web/package.json`, **0 import** — l'activer ajouterait un moteur ; il ne sera pas installé dans la v3. **Deux moteurs simultanés** (le défaut actuel de `apps/web` : `app/layout.tsx:100` + `app/(connected)/layout.tsx:24-25`, clés `meeshy-app` vs `gp-theme-mode`). |
| **État client** | Zustand, UI éphémère uniquement (ouverture de feuille, brouillon, filtre) | `zustand@5.0.14` (**résolu** ; le doc précédent disait 5.0.15) | ~0,6 Ko — **à confirmer (L-0.5)** | Convention `CLAUDE.md`. Le thème et le cache réseau en sortent. | **Redux Toolkit / Jotai** : réécriture sans capacité manquante. |
| **Cache persistant** | TanStack Query + persister IndexedDB (`idb-keyval`), `staleTime: Infinity`, `VOLATILE_ROOTS` | `@tanstack/react-query@5.101.4` (**résolu**) / `idb-keyval@6.3.0` (**résolu**) | **à établir (L-0.5)** | Sous-système déjà cache-first. Toute donnée serveur passe par `useQuery` — interdit de refaire `hooks/conversations/use-participants.ts` (188 lignes `useState`/`useEffect`, rappelé sans garde par `components/conversations/ConversationLayout.tsx:493`). | **SWR** : 2ᵉ lib de cache. |
| **Delta / rattrapage** | `GET /sync` (`services/gateway/src/routes/sync.ts` — ETag/304, cursor keyset, `hasGap`, plafond 512 Ko/page, `allowAnonymous: true` lignes 452-473) | existant | 0 Ko | **Aucun appelant `/sync` dans `apps/web`** (grep vérifié), alors que le web réimplémente deux moteurs plus pauvres. Un 304 quasi-vide remplace un JSON complet à chaque reprise. | **Garder les deux moteurs maison** : double maintenance d'une idée déjà payée. |
| **Transport temps réel — LECTURE anonyme** | **AUCUN.** Rendu serveur + revalidation au retour de focus (`visibilitychange:visible` → `router.refresh()`). | — | **0 Ko, 0 connexion tenue** | Le fan-out temps réel d'un post **existe déjà** sur le socket (`ROOMS.post` — `packages/shared/types/socketio-events.ts:113`, `POST_JOIN`/`POST_LEAVE` `:683-684`, `PostReactionHandler.handleJoinPost:471-521`) et il est **auth-gaté par décision écrite** (`PostReactionHandler.ts:470` : « anonymous sockets cannot subscribe to post rooms »). En construire un second dupliquerait `resolveConsumptionTarget`, c'est-à-dire la garde de VISIBILITÉ. | **SSE (`EventSource`)** : **ANNULÉ, pas différé**. `grep -rn "text/event-stream" services/gateway/src` = **0 occurrence** (tout est à construire) ; SSE tient une connexion par visiteur ET par contenu (il ne multiplexe pas) — l'argument de « scalabilité » se réfute lui-même ; et le lecteur anonyme est de toute façon bloqué **en amont** par deux `requiredAuth` (§ 5). |
| **Transport temps réel — PARTICIPATION** | **UN** Manager `socket.io-client`, chargé en `await import()` **au tap « Rejoindre »**, jamais à la lecture | `socket.io-client@4.8.3` (résolu) | **12 796 o gzip (ESM) / 14 626 o (UMD) — mesuré** `gzip -9` | La participation est bidirectionnelle (envoyer, frappe, accusés) : SSE y est structurellement inapte. L'anonyme est **déjà** supporté (`AuthHandler.ts:93-108` → `_authenticateAnonymousUser:320`), backoff durci (`connection.service.ts:203-206` : 1 s→30 s, jitter 0.5). **Fait serveur à écrire correctement** : `grep -rn "\.of(" services/gateway/src` = **0 occurrence** — le gateway n'a **aucun namespace** Socket.IO ; tout vit dans le namespace par défaut et la séparation se fait par **ROOMS**. Les 3 `io(...)` de `apps/web` sont 3 connexions redondantes vers le même namespace. | **WebTransport** (non supporté WebKit ⇒ mort pour les navigateurs in-app iOS). **WebSocket brut** (réimplémente backoff/ACK/multiplexage déjà durcis). |
| **File hors-ligne** | `lib/realtime/queue/offline-queue.ts`, extraite de `apps/web/services/socketio/orchestrator.service.ts` (911 l.), persistée via `idb-keyval` | — | ~1 Ko — **à confirmer** | Le patron existe et marche (`MAX_QUEUE_SIZE`, `MESSAGE_QUEUE_TIMEOUT=120000`) mais est noyé dans le transport. | **`workbox-background-sync`** : rejoue des `fetch()`, or nos mutations partent en émissions Socket.IO. |
| **i18n** | Dictionnaire clé→valeur, import dynamique par namespace (patron de `apps/web/hooks/use-i18n.ts`, LRU 80) ; `Intl.*` natif ; **`RTL_LOCALES` posant `dir="rtl"`** ; **règle neuve : `lang="xx"` sur tout nœud rendu par le Prisme dans une langue ≠ langue d'interface** | — | 0 Ko + JSON à la demande | Vérifié dans `apps/web` : `grep 'lang={'` ne remonte que 3 fichiers, et `components/v2/TranslationToggle.tsx` n'en pose dans **aucune** branche de rendu — un lecteur d'écran anglais prononce une bulle française en phonétique anglaise. Défaut de Prisme au sens du cycle 123 (« qu'est-ce qui part À CÔTÉ »). | **`next-intl`** (408 Ko, explicitement désactivé dans `apps/web/next.config.ts:2-6`). |
| **Formulaires** | `<form action={serverAction}>` natif + **Zod** partagé (`packages/shared`) exécuté serveur ; `useFormStatus`/`useActionState` ; **aucun formulaire du rôle premier ne dépend du JS pour se soumettre** | `zod@4.4.3` (résolu) | 0 Ko nouveau | Rejoindre en anonyme doit fonctionner sans hydratation. Zod est déjà la validation partagée gateway↔web. | **react-hook-form** : ~12 Ko pour 4 champs, casse la soumission sans JS. |
| **Tests unitaires** | Jest + React Testing Library + **`jest-axe`** sur tout composant `(public)` | `jest@30.4.2` (résolu) | 0 (devDep) | TDD non négociable ; `jest-axe` transforme l'a11y en cycle RED/GREEN. | **Vitest** : 2ᵉ runner. |
| **Tests visuels** | Playwright + `pixelmatch`/`pngjs`/`sharp` pour un **score par région** ; `@axe-core/playwright` pour le structurel | `@playwright/test@1.62.1` (**résolution unique après L-0.5** : la racine déclarait `^1.59.1` et résolvait `1.61.1` à côté du `1.62.1` de `@meeshy/web` ; la racine est un workspace, elle déclare désormais `^1.62.1` et l'unicité est gardée) ; `pngjs@5.0.0`, `sharp@0.35.3` (résolus) | 0 (devDep) | `apps/web/e2e/message-composer-animations.spec.ts` prouve déjà `toHaveScreenshot` + Web Vitals dans ce dépôt ; il manque un **score chiffré** cible-vs-rendu. Chromium local : `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`). | **`toHaveScreenshot` seul** : verdict binaire, inutilisable comme gate gradué. |
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
    package.json                 #   `@meeshy/design-tokens` : un franchissement de frontière de
                                 #   paquet se DÉCLARE. globals.css l'importe par SPÉCIFICATEUR ;
                                 #   un chemin relatif ne survit pas à l'image (le builder ne copie
                                 #   que apps/web-v3/). Gardé par scripts/check-v3-pipeline.mjs.
    tokens.css                   #   consommée par apps/web-v3/app/globals.css ET le harnais visuel
    dark.css  light.css          #   redéfinitions par schéma ; aucune valeur hors de ces 3 fichiers
                                 #   `color-scheme` y est déclaré : il suit la CLASSE, sans JS
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
    baseline.json                #   ligne de base « AVANT », mesurée sur la prod, commitée, datée
  budgets.json                   # les plafonds du § 8.3, avec le statut GATE / CIBLE / À ÉTABLIR de chacun
  scripts/check-bundle-budget.mjs
  scripts/mesure-reseau.mjs      # poids réseau + Web Vitals par CDP — LA mesure, appelée par le gate ET par la ligne de base
  scripts/baseline.mjs           # la même mesure, pointée sur apps/web en production

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
      - "traefik.http.routers.frontend-v3.rule=(Host(`${DOMAIN}`) || Host(`www.${DOMAIN}`)) && (PathPrefix(`/__v3/_next`))"
      - "traefik.http.routers.frontend-v3.entrypoints=websecure"
      - "traefik.http.routers.frontend-v3.tls.certresolver=letsencrypt"
      - "traefik.http.routers.frontend-v3.middlewares=compress@file"
      - "traefik.http.services.frontend-v3.loadbalancer.server.port=3300"
      - "traefik.http.routers.frontend-v3.priority=100"
```

**Revenir en arrière = enlever le `PathPrefix`. Rien d'autre ne bouge** — la propriété tient intégralement dans ce sens-là, et c'est le sens qui compte en incident (§ 4.4 bis, « la liste est monotone croissante »).

**Migrer une route, en revanche, se fait en DEUX temps**, parce qu'un SECOND aiguilleur existe côté client et qu'il ne se déploie pas au même rythme : le préfixe entre d'abord dans `V3_ZONE_PREFIXES` (`apps/web/public/sw.js`) par un commit **antérieur**, déployé et propagé ; le `PathPrefix` vient **ensuite**. Voir le § 4.4 bis — la règle, son coût, et pourquoi l'inverse ouvre la fenêtre #4416 sur la route qu'on vient de basculer.

### 4.4 La collision `/_next/*` — défaut neuf, non relevé par la revue

Mesuré : `grep -n "assetPrefix\|basePath" apps/web/next.config.ts apps/web/next.config.security.js` = **0 occurrence** ; `apps/web/next.config.ts:22` pose seulement `output: 'standalone'`. Les deux applications serviraient donc leurs chunks à `/_next/static/...`. Dès que Traefik envoie `/l` à la v3 en laissant `/` au legacy, une page v3 demande `/_next/static/chunks/*.js` qui retombe sur le routeur attrape-tout ⇒ **404 de chunk ⇒ page blanche**. Invisible en CI, visible au premier déploiement.

**Correctif obligatoire, à écrire en L-0.5** : `apps/web-v3/next.config.ts` pose **`assetPrefix: '/__v3'`** (Next sert alors `${assetPrefix}/_next/...`, `/_next/image` suit) et `PathPrefix('/__v3/_next')` figure **en permanence** dans la règle du routeur v3. **Aucun `basePath`** : il changerait les URLs publiques, or `/l/:token` et `/stories/:id` doivent rester à l'identique. C'est le patron Multi-Zones de Next, Traefik jouant le routeur de zone.

#### Où s'arrête `assetPrefix` — mesuré en L-0.5, la première rédaction disait `/__v3` et c'était trop large

`assetPrefix` préfixe les URL que Next **fabrique** pour ses propres bundles, **et rien d'autre**. Mesuré sur le serveur standalone que l'image lance (`node .next/standalone/apps/web-v3/server.js`, `.next/static` et `public/` assemblés comme le fait le `Dockerfile`) :

| ce qui est demandé | à la racine | sous `/__v3` |
|---|---|---|
| `_next/static/chunks/main-<hash>.js` | **200** | **200** |
| `probe.txt` déposé dans `public/` | **200** | **404** |
| `robots.txt` déposé en `app/robots.txt` | **200** | **404** |
| `icon.svg` déposé en `app/icon.svg` | **200** | **404** |

Donc **un fichier de `public/` et un fichier de métadonnées de l'App Router** (`favicon.ico`, `icon.*`, `apple-icon.*`, `opengraph-image.*`, `twitter-image.*`, `robots.*`, `sitemap.*`, `manifest.*`) **sont servis à la RACINE de l'URL** : derrière Traefik ils tombent sur le routeur attrape-tout et **c'est `apps/web` qui les sert**. Deux conséquences qui touchent le rôle PREMIER : le **sprite Phosphor** (§ 8.5) et les **images OG** de `/l`, `/story`, `/reel`, `/post` sont exactement de cette classe.

**Décision** : la zone ne sert **aucun actif à la racine**. Un actif de la v3 passe par le **pipeline webpack** (import de module ⇒ émis sous `/__v3/_next/static/media/…`, donc dans la zone, cache immuable) ; à défaut, son chemin s'ajoute **nommément** à la règle du routeur — et il est alors **volé au legacy**, à énumérer et à garder un par un. Le § 8.5 est aligné : le sprite n'est plus annoncé à `/__v3/sprite.svg` (une URL que `public/` ne peut pas produire).

**Et la règle ne porte pas `/__v3` nu.** `next build` n'émet aujourd'hui **aucune page** d'App Router (mesuré : `.next/app-path-routes-manifest.json` = `{"/healthz/route": "/healthz"}`), donc la limite `/_not-found` n'existe pas et `/__v3/quoi-que-ce-soit` répond le **404 anglais du routeur Pages** — sans `<html lang>`, sans le script anti-flash de thème, hors design system. Publier ce chemin **avec priority=100** reviendrait à faire servir par la v3, à un anonyme, une page d'erreur que rien n'a dessinée. La règle se limite donc à `PathPrefix('/__v3/_next')`, et s'élargit au chemin d'une page **dans le commit qui livre cette page**.

**Gardé, dans les deux sens, par `scripts/check-v3-pipeline.mjs`** (invariants 19 à 21, chacun sondé par une mutation) : (a) aucun actif servi à la racine — `public/**`, fichiers de métadonnées — n'échappe à la règle ; (b) la règle ne réclame aucun chemin que la zone ne sert pas ; et (c) l'étage runner du `Dockerfile` copie `public/` **si et seulement si** `apps/web-v3/public/` existe (`output: 'standalone'` ne le recopie pas — mesuré : `.next/standalone/apps/web-v3/` ne contient que `node_modules`, `package.json`, `server.js`).

**Corollaire** : `tout chemin absent de la règle` **`frontend-v3`** `est servi par apps/web`. **Il vaut pour les ACTIFS autant que pour les ROUTES** — c'est cette moitié-là qui manquait à la première rédaction. Les 23 routes `app/admin/*` et les 12 routes d'authentification existantes (`auth/magic-link`, `auth/magic-link/validate`, `auth/verify-2fa`, `auth/verify-email`, `auth/verify-phone`, `forgot-password`, `forgot-password/check-email`, `reset-password`, `signup/affiliate/[token]`, `account/deletion`, `settings/verify-email-change`, `auth-status`) restent donc servies **par défaut, sans action**. La matrice du § 10 est **honnêtement incomplète**, pas faussement exhaustive.

### 4.4 bis Le SECOND intercepteur — le Service Worker du legacy (issue #4416)

Le § 4.4 a posé la bonne question à **un** intercepteur same-origin (Traefik) et ne l'a pas posée au second. Mesuré le 2026-08-30 sur `dev` :

| Fait | Site |
|---|---|
| enregistré sur la portée de l'origine ENTIÈRE — **deux** sites, même script, même portée | `apps/web/utils/service-worker.ts:28-31` (monté sans condition par `apps/web/app/layout.tsx:93` → `ServiceWorkerInitializer`) et `apps/web/utils/service-worker-registration.ts:95-97` (chemin FCM) — les deux `register('/sw.js', { scope: '/' })` |
| cache-first jusque sur les NAVIGATIONS | `apps/web/public/sw.js`, branche 3 — `request.mode === 'navigate' \|\| destination === 'script' \| 'style' \| 'font' \| 'image'`, puis `return cachedResponse \|\| fetchPromise` |
| purge de cache à l'échelle de l'ORIGINE | `apps/web/public/sw.js`, `activate` — `caches.keys()` puis suppression de **tout** nom ≠ `CACHE_NAME` ; même geste depuis la page dans `apps/web/utils/service-worker.ts` (`performFullAppInvalidationAndReload`) |

Trois conséquences, toutes sur le rôle PREMIER. (1) **La bascule n'a pas lieu pour un visiteur revenant** : qui a déjà ouvert `/l/`, `/stories/:id` ou `/posts/:id` sur le legacy est resservi depuis le cache legacy ; seuls les navigateurs neufs basculent. (2) **Des actifs de la v3 entrent dans le cache du legacy** — nuance mesurée : `/__v3/_next/static/*` était laissé passer **par accident** (la garde « 1bis » `pathname.includes('/static/')`, écrite pour les pièces jointes), tandis que `/__v3/_next/image?…` était bel et bien intercepté ; une protection obtenue par coïncidence n'en est pas une. (3) **Le retour arrière est INERTE**, et c'est le plus grave : retirer un `PathPrefix` ne vide aucun Cache Storage, et le cache survit exactement à l'opération dont il fausse le résultat.

**Ce que `CACHE_NAME` suit vraiment — corrigé le 2026-08-30, la première rédaction disait « qu'au rebuild d'image » et c'était faux.** `APP_BUILD_VERSION` n'est pas stampé au build : `apps/web/docker-entrypoint.sh:57-60` calcule `BUILD_$(date +%Y%m%d_%H%M%S)` **au démarrage du conteneur** puis substitue le marqueur dans `sw.js` par `sed`. La substitution étant destructive (le marqueur disparaît du système de fichiers du conteneur), la valeur est posée à la **PREMIÈRE mise en route d'une instance de conteneur** : un `restart` la conserve, un **recreate** en pose une neuve, et le build d'image n'en pose aucune. La **conclusion** du § 4.3 tient — un `up -d` qui ne touche qu'aux labels de `frontend-v3` ne recrée que `frontend-v3`, donc `CACHE_NAME` ne bouge pas — mais elle tient pour cette raison-là, pas pour celle qui était écrite.

> **Et recréer `frontend` n'est PAS un filet de retour arrière immédiat.** La tentation est réelle (nouveau `CACHE_NAME` ⇒ purge), et elle est fausse : la purge vit dans l'`activate`, donc elle ne s'exécute qu'à l'**activation** du nouveau worker — la fenêtre de propagation ci-dessous, exactement la même que celle du correctif qu'on voudrait court-circuiter. Un recreate de `frontend` avance la file d'attente d'un worker ; il ne vide le cache de personne aujourd'hui.

#### La juridiction a TROIS canaux, pas un

L'issue #4416 dit « n'intercepte jamais la zone v3 » : c'est une question de **juridiction**, et le listener `fetch` n'en est qu'un tiers. Les deux autres ne composent aucune requête — c'est pourquoi une recherche partant de « qui répond à cette URL ? » ne pouvait pas les rendre.

| # | Canal | Ce qui le ferme |
|---|---|---|
| 1 | le listener `fetch` | `V3_ZONE_PREFIXES` + `belongsToV3Zone(pathname)`, **sortie en tête du listener, AVANT le test de méthode** — livré |
| 2 | la **REGISTRATION** de portée `/` | une décision de déploiement, tranchée ci-dessous — **rien à écrire dans `sw.js`** |
| 3 | le **Cache Storage**, qui est à l'échelle de l'ORIGINE et non du worker | le namespace `meeshy-cache-` : un worker ne détruit que ce qu'il a écrit — livré, aux **deux** sites (`sw.js` `activate`, et `performFullAppInvalidationAndReload` côté page) |

Pour le canal 1 : **`apps/web/public/sw.js` est explicitement AUTORISÉ à la modification** (exception nommée à la règle « on ne touche pas au legacy »). Ne rien intercepter, c'est laisser le navigateur parler au routeur : Traefik redevient la seule autorité. La garde passe avant le filtre de méthode parce qu'elle n'est pas une règle d'aiguillage parmi d'autres — c'est une absence de juridiction.

Pour le canal 3 : `caches.keys()` rend les noms de **tous** les scripts de l'origine. Un `filter((name) => name !== CACHE_NAME)` sans préfixe détruit donc le cache d'un worker qui n'est pas celui-ci — or le § 7 planifie précisément un worker pour la v3, « servi à la RACINE de l'URL par nécessité de portée ». Chaque worker de l'origine possède désormais son préfixe et ne sort pas de sa propriété.

#### Canal 2 — qui détient `scope: '/'` pendant les étapes 2 à 6

Une registration est clé par **PORTÉE** : deux scripts enregistrés sur `/` ne coexistent pas, la seconde `register()` remplace la première, et chaque page qui charge sa coquille réenregistrerait la sienne. Sur une origine où les deux zones sont vivantes (§ 4.9, étapes 2 à 6), chaque franchissement de frontière produirait un battement — réenregistrement, activation, `controllerchange` → `window.location.reload()`.

**Décision : le legacy garde `scope: '/'` jusqu'à l'étape 7 ; le worker de la v3 s'enregistre en portées ÉTROITES, une par préfixe que la zone détient.** Des portées imbriquées coexistent (la plus spécifique contrôle son sous-arbre), donc aucune ne remplace `/`. La frontière devient symétrique : le legacy **exclut** les préfixes de la zone, la v3 **revendique** exactement ceux-là. À l'étape 7, quand `/` bascule, la v3 prend `scope: '/'` et la registration legacy est retirée par le lot **L8**.

> **Piège à ne pas rejouer** : une portée de Service Worker est une comparaison de **chaîne**, pas de segments — `scope: '/l'` attraperait `/links`. `belongsToV3Zone`, elle, est segment-aware (`pathname === prefix || pathname.startsWith(prefix + '/')`). Les deux listes ne s'écrivent donc pas de la même façon, et une route nue (`/chats`) demande sa propre registration.

Porté par l'issue **#4472 — « Un seul worker détient la portée de l'origine pendant la migration »**.

#### La fenêtre de propagation — ce que la garde couvre, et ce qu'elle ne couvre pas

`sw.js` **n'appelle pas `self.skipWaiting()` à l'`install`** : il ne le fait que sur réception d'un message `SKIP_WAITING` (`apps/web/public/sw.js`, listener `message`), dont l'unique émetteur est `performFullAppInvalidationAndReload` (`apps/web/utils/service-worker.ts`), lui-même déclenché par le **clic** de l'utilisateur sur la bannière de mise à jour (`apps/web/components/common/SystemStatusBanner.tsx`, `handleUpdate`) — que `handleDismiss` permet de refuser. Un worker neuf s'installe donc en état `waiting`, et il n'active que dans **deux** cas : tous les onglets de l'origine fermés, ou ce clic.

**Conséquence, à écrire plutôt qu'à masquer : la garde couvre les navigateurs NEUFS et ceux qui ont accepté la mise à jour ; un visiteur revenant tourne sous son worker précédent, avec son cache, jusqu'à l'un de ces deux événements.** Le défaut #4416 est donc **rétréci**, pas fermé, pendant cette fenêtre.

**`self.skipWaiting()` à l'`install` est REFUSÉ** : couplé au `controllerchange → window.location.reload()` déjà en place, il rechargerait de force tous les onglets ouverts à chaque déploiement du legacy — sur une messagerie, au milieu d'une saisie. La bannière et son bouton « plus tard » sont un choix de produit délibéré du legacy ; le lot v3 ne le renverse pas pour son propre confort. Le prix est donc payé en **ordre de déploiement** (ci-dessous), pas en rechargement forcé.

Portée de risque, mesurée : `Cache.match()` est clé par **URL entière** (`ignoreSearch` vaut `false` par défaut). Un visiteur revenant n'est resservi depuis le cache legacy que sur une URL qu'il a **déjà visitée** — `/l/<token>` d'un lien neuf est un défaut de cache et part au réseau. Le risque se concentre sur la coquille, `/` et les routes sans paramètre.

#### L'ordre, dans UN sens seulement — la liste est monotone croissante

`V3_ZONE_PREFIXES` est un **JUMEAU tenu à la main**, et la règle qui le tient est **unique** (la première rédaction en portait deux, contradictoires : « dans le même commit » au § 10.4 étape 9, « avant » au § 4.9 ; la seconde a été retenue, la première était la consigne dangereuse) :

> **Un préfixe ENTRE dans `V3_ZONE_PREFIXES` par un commit ANTÉRIEUR à celui qui l'ajoute au routeur `frontend-v3` — déployé, et laissé se propager. Il n'en SORT jamais.**

Les deux moitiés n'ont pas le même coût de déploiement, et c'est toute la raison de l'ordre : ajouter un label Traefik est un `docker compose up -d` sans rebuild (§ 4.2, effet en secondes), alors que modifier `sw.js` exige un rebuild de l'image `apps/web`, son redéploiement, **puis** la propagation ET l'activation du worker chez chaque visiteur (fenêtre ci-dessus, mesurée en sessions de navigateur). Les faire dans le même commit ouvrirait la fenêtre #4416 sur la route qu'on vient précisément de basculer.

La liste ne se **vide** jamais, et c'est ce qui garde vraie la propriété du § 4.3 dans le sens du **retour arrière** : retirer un `PathPrefix` ne demande aucune contrepartie côté client — ne pas intercepter n'est jamais faux, seulement moins mis en cache (§ 4.4). L'en retirer, au contraire, réarmerait le cache périmé pendant une propagation entière. La liste peut donc être plus LARGE que la règle Traefik (aujourd'hui `/__v3` face à `PathPrefix('/__v3/_next')`) ; elle ne peut **jamais** être plus ÉTROITE.

**Ce qu'on paie, et qu'il faut dire** : entre le commit antérieur et la bascule, le legacy perd son cache SWR sur la route concernée alors qu'il la sert encore. C'est pourquoi la pré-déclaration se fait **route par route, juste avant sa bascule** — et non en pré-déclarant d'un coup toute l'échelle du § 4.9, ce qui retirerait dès aujourd'hui le cache client de `/l` (P0) et de toutes les routes vives, pour une durée non bornée.

Gardé par `apps/web/__tests__/public/sw.v3-zone.test.ts` : 13 témoins, dont le 9ᵉ **lit la règle réelle de `docker-compose.prod.yml`** et exige `règle Traefik ⊆ V3_ZONE_PREFIXES` — un commit qui ajoute un `PathPrefix` sans que le préfixe soit déjà dans le worker passe au ROUGE. Les 4 derniers gardent le canal 3 (namespace de la purge), avec le témoin de jumeau `sw.js` ⇄ `utils/service-worker.ts` ; `apps/web/__tests__/utils/service-worker-cache-namespace.test.ts` (3 témoins) garde le même canal côté page.

#### Ce que cette garde COÛTE à la zone, et qui n'est pas encore dessiné

Retirer la juridiction du worker legacy sur la zone laisse la zone **sans aucun cache client** : ni précache, ni SWR, ni lecture hors-ligne. Dès l'étape 2, `/l` — route du rôle PREMIER, lue sur un téléphone en 3G — paie plein réseau à chaque visite. C'est un écart aux principes non négociables « Cache-First, Network-Second » et « Offline Graceful Degradation », **assumé le temps d'un lot** et porté par l'issue **#4473 — « La zone v3 a son propre cache client, et le rôle premier ne paie plus plein réseau en 3G »**, à livrer dans le même milestone que la bascule de `/l`.

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
| 1 | `/__v3/_next` | rien (v3 en ligne, **zéro trafic humain** : seuls ses bundles sont joignables) | — |
| 2 | `/l` | **le rôle premier**, une seule route | retirer `/l` |
| 3 | `/stories`, `/reels`, `/posts`, `/moods` | la lecture partagée | idem |
| 4 | `/chats` | la participation anonyme | idem |
| 5 | `/login`, `/signup` | l'entrée dans le compte | idem |
| 6 | `/feed`, `/composer`, `/links`, `/notifications`, `/settings`, `/contacts`, `/search` | le rôle secondaire | idem |
| 7 | `/` | **vide le routeur legacy** | idem |

**Prérequis de l'étape 2, en deux temps** (§ 4.4 bis) :

1. `/l` entre dans `V3_ZONE_PREFIXES` (`apps/web/public/sw.js`) par un commit **antérieur** à celui du `PathPrefix`, et l'image `apps/web` est **redéployée**. Sans ce commit, l'étape 2 ne bascule que les navigateurs neufs et son retour arrière est inerte.
2. Le `PathPrefix` n'est ajouté qu'**après**, et la ligne 2 du **Gate E** (§ 9.8) est rejouée dans le bac du § 4.10 **sur un navigateur qui a visité l'origine AVANT le redéploiement** — le seul cas qui prouve quelque chose.

> **La propagation n'est pas instantanée et ne se décrète pas.** Le worker neuf s'installe en `waiting` et n'active qu'à la fermeture de TOUS les onglets de l'origine ou au clic de l'utilisateur sur la bannière de mise à jour (§ 4.4 bis, « fenêtre de propagation »). Tant que la ligne 2 du Gate E n'a pas été jouée sur un revenant, l'étape 2 est annoncée pour ce qu'elle est : elle couvre les navigateurs neufs et ceux qui ont accepté la mise à jour. **Aucun délai chiffré n'est écrit ici : il n'a pas été mesuré** — c'est la recette du § 4.10 qui doit le rendre, sur des clients réels.

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
| `BroadcastChannel('meeshy-guest.<linkKey>')` | élection d'**UN seul** porteur de battement pour N onglets **DU MÊME LIEN**. Le canal est indexé par le lien, **comme le stockage** (état E), et l'élection se **départage** (priorité, puis identifiant d'onglet) au lieu de céder inconditionnellement | Sinon N écritures `lastActiveAt` toutes les 5 min pour une seule personne — contraire à « très faible consommation de données ». Un canal **global** rejouerait le défaut mesuré au § 6.1 point 7 une couche plus haut : l'onglet du lien B ferait taire celui du lien A, dont le bail (§ 6.4) ne serait plus renouvelé. Et une cession **inconditionnelle** rend ZÉRO porteur quand deux revendications se croisent — `postMessage` est asynchrone —, ce qui est **pire** que la dégradation assumée « sans canal, chaque onglet bat » |
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

> **`<linkKey>` = le `linkId` que le SERVEUR rend**, jamais le segment d'URL `/chats/:lien`, jamais l'ObjectId, jamais l'`identifier`. La passerelle accepte les **trois** formes pour le même lien physique et les normalise (`resolveShareLinkId`, `services/gateway/src/routes/anonymous.ts:67-84` ; la note de dépréciation :193-194 : « les deux acceptent linkId/identifier/id ») ; le client, lui, ne le peut pas — deux arrivées par deux formes rangeraient **deux entrées pour une seule place**, `lireSession` rendrait `null`, l'écran referait un `join`, et le § 6.1 point 3 se paierait en entier. Les deux — et seules — portes d'arrivée servent `linkId` : le 201 du join (`anonymous.ts:254`) et l'aperçu `GET /anonymous/link/:identifier` (`anonymous.ts:683`, projeté par `anonymousLinkPreviewSelect` :537-539). Porté par le type marqué `CleDeLien`, que `cleDeLien()` seule produit (`apps/web-v3/lib/api/guest-session.ts`).
>
> **Et l'appartenance d'une clé à un lien est une ÉGALITÉ**, jamais une relation de préfixe : `cleDuLien` ne produit aucune sous-clé, et rien n'interdit qu'un `identifier` choisi par un hôte soit le préfixe d'un autre (`schema.prisma:577-579`, `mshy_support` / `mshy_support-link`). Site unique : `estLaCleDu()`.

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
| **Hors-ligne total** (`offline`) | Lecture servie par le cache TanStack + un service worker (dont le chemin, servi à la RACINE de l'URL par nécessité de portée, est l'**exception** au § 4.4 : il s'ajoute nommément à la règle du routeur et il est alors volé au legacy). **Sa PORTÉE et son NAMESPACE de cache ne sont pas libres** : portées étroites tant que l'étape 7 du § 4.9 n'est pas franchie (#4472), namespace distinct de `meeshy-cache-` (§ 4.4 bis, canal 3). Livré par #4473 ; envois poussés dans `offline-queue` (persistée `idb-keyval`) ; **aucun appel**, **aucune destruction de jeton** | Bannière sobre « hors ligne » en haut. Les messages envoyés s'affichent en **optimiste, grisés, avec une horloge**. Le composeur reste **actif** |
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
| Sprite des 72 glyphes Phosphor | **31 682 o brut / 8 911 o gzip** (8,7 Ko) | `node packages/icons/scripts/build-sprite.ts` ; valeur écrite dans `apps/web-v3/budgets-mesures.json` → `sprite_phosphor` |
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
node apps/web-v3/scripts/baseline.mjs https://meeshy.me/ https://meeshy.me/l/<token> \
  https://meeshy.me/story/<id> https://meeshy.me/reel/<id> https://meeshy.me/post/<id> \
  https://meeshy.me/mood/<id>                  # URL COMPLÈTES : toute autre origine est refusée
                                               # profil 3G Fast + p75 lus dans budgets.json (~20 min)
                                               # → apps/web-v3/e2e/visual/baseline.json (commité, daté)
                                               # sans egress vers meeshy.me : .github/workflows/v3-baseline.yml
```

**Deux manifestes, deux plafonds.** Le socle `(connected)` de la v3 **n'est pas comparable** à celui du legacy : les plafonds v3 sont absolus, et le progrès se démontre contre `baseline.json`, jamais contre une intuition.

### 8.3 Les plafonds par écran

**Statut** : `GATE` = plafond ferme, casse la CI. `CIBLE` = valeur à confirmer par la première mesure de L-0.5 ; jusque-là le gate enregistre la valeur mesurée et interdit toute **régression**.

> **Où vivent ces plafonds, et ce que le ratchet interdit exactement.** Les chiffres de cette table ne sont opposables que s'ils sont dans un fichier de DONNÉES : `apps/web-v3/budgets.json` les porte tous — les plafonds de JS par groupe de routes (`groupes`), ceux attachés à une **route nommée** (`routes` : `/l/:token` = **0 Ko GATE**, que le plafond de 95 Ko du groupe `(public)` laisserait passer), et ceux qui ne se lisent dans aucun manifeste de build (`reseau` : requêtes avant le premier pixel **1/2/3/4/8/10 GATE**, « 0 connexion tenue » **GATE**, CLS ≤ 0,05, CSS ≤ 20 Ko, LCP), comparés par `mesure-reseau.mjs`. Les valeurs **mesurées** vivent à côté, dans `budgets-mesures.json` — jamais dans le même fichier que les plafonds.
> Le ratchet livré n'interdit pas la **croissance** : un écran neuf pèse par construction plus que pas d'écran, et un ratchet strictement décroissant bloquerait tout L1. Il interdit la croissance **SILENCIEUSE** — toute valeur au-dessus de celle enregistrée rend `rc=1`, et la faire monter exige `--ratchet`, donc un diff commité et relu. C'est le même mécanisme que `scripts/check-type-debt.sh`.

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
- **Sprite d'icônes** : **EXTERNE**, servi depuis la **même origine** et **dans la zone** — donc **émis par le pipeline webpack** (`/__v3/_next/static/media/sprite.<hash>.svg`), **jamais** depuis `public/` : un fichier de `public/` est servi à la racine de l'URL, hors de la règle du routeur, donc par le LEGACY (§ 4.4) — avec `<link rel="preload" as="image" type="image/svg+xml">`, cache immuable, **≤ 12 Ko gzip**. Un **sous-sprite critique de ≤ 8 glyphes** au-dessus de la ligne de flottaison est inliné dans le layout. *Le sprite n'est donc compté qu'une fois : « HTML ≤ 4 Ko **hors sprite** ; sprite externe ≤ 12 Ko, **1 requête**, cache immuable ».* Le gate CI échoue si une classe `ph-*` référencée n'a pas son `<symbol>`.
- **Assertion anti-panne cross-origin** : sur l'écran le plus dense, **les N `<use>` rendent N symboles visibles** — seul test qui attrape la défaillance silencieuse d'un sprite servi depuis un autre host.
- **0 erreur `axe` `serious`/`critical`** sur toute route `(public)` — porté par **`apps/web-v3/e2e/visual/v3-a11y.spec.ts`** (`@axe-core/playwright`), dont le VERDICT vit dans `apps/web-v3/e2e/visual/lib/a11y.ts` et se gage sans navigateur (`apps/web-v3/__tests__/a11y-gate.test.ts`). Le balayage est **découvert depuis ce que `next build` a ÉMIS** — `apps/web-v3/.next/app-build-manifest.json` —, **jamais depuis un parcours du disque** (§ 9.5 : un glob de `app/(public)/**/page.tsx` gaterait `app/not-found.tsx`, que personne ne reçoit, et laisserait hors de portée le 404 réellement servi) : un écran neuf entre dans le gate le jour où **son build l'émet ET où `budgets.json` le range dans `(public)`**. Une page émise qu'**aucun motif ne réclame**, ou que **deux groupes réclament à précision égale**, fait **échouer** le balayage en se nommant — comme une route **dynamique** qui entre sans valeur d'exemple ; jamais sautée en silence. Le balayage porte une **garde de non-vacuité** — il échoue si le manifeste de build n'émet **aucune** route, son témoin de contrôle étant le gestionnaire `/healthz/route` livré en L-0.5 — et, tant qu'aucune page `(public)` n'est émise, il rend un témoin qui **assère cette raison** plutôt que zéro test : un `[]` prouve alors l'instrument en panne, pas l'absence de violation (leçon 345). `/_not-found` entre dans le balayage le jour où `next build` l'émet, c'est-à-dire à la première page d'App Router. Chaque route est balayée sur les **quatre colonnes de thème du § 9.6** — `color-contrast` est d'impact `serious`, c'est-à-dire exactement la barre de ce gate, et c'est la seule règle d'`axe` dont le verdict dépende du thème — et son **statut HTTP attendu** est asséré AVANT `axe` (200, ou 404 pour `/_not-found`) : sans lui, une route émise qui échoue à l'exécution ferait auditer sa page d'erreur, propre pour `axe`, et sortirait verte. Une violation dont l'`impact` n'appartient pas à la taxonomie d'`axe` est retenue : rien ne prouve qu'elle est sous la barre. **Porteur** : le job `a11y-v3` de `.github/workflows/ci.yml` (`bun run test:a11y`, non amnistié) et la cinquième mesure de `scripts/v3-rapport.mjs` — un instrument que rien ne lance n'en est pas un.
- **0 requête pendant que l'onglet est `hidden`** ; **1 seule** requête de battement pour N onglets sur 10 min (§ 6) — porté par **`apps/web-v3/e2e/visual/v3-lifecycle.spec.ts`**, dont le VERDICT vit dans `apps/web-v3/e2e/visual/lib/lifecycle.ts` et se gage sans navigateur (`apps/web-v3/__tests__/lifecycle-gate.test.ts`). **DEUX barres, pas une** : le § 8.5 gate ZÉRO requête (un onglet caché ne coûte rien), le § 6.5 gate ZÉRO requête **mutante** (un onglet caché ne DÉTRUIT rien — c'est le fond de la décision du § 6.2, « le navigateur n'appelle JAMAIS `leave` ») ; les fondre ferait passer une préchargeuse de fond pour une fuite d'écriture. La fenêtre d'occultation retient l'instant d'**ÉMISSION** — une requête partie avant et qui atterrit pendant n'est pas une fuite — et sa borne droite est **exclue**, sans quoi le gate tomberait sur la **reprise** que le § 6.2 exige. **La fenêtre d'observation est VIRTUELLE** — `page.clock` (contexte Playwright), installée avant navigation, figée après chargement, avancée de la fenêtre de recette ENTIÈRE. Elle a d'abord duré 500 ms de temps MACHINE face à une période de battement de 300 000 ms (rapport **600**) : une telle fenêtre ne voit qu'une fuite ÉMISE SYNCHRONEMENT dans le gestionnaire `visibilitychange`, et **une page dont le battement n'est JAMAIS suspendu en sortait VERTE** — violation frontale de la première ligne du § 6.2 sous le gate censé la tenir. L'argument qui avait écarté l'horloge accélérée (« elle rendrait le compte dépendant de la machine ») vaut pour une horloge RÉELLE et non pour une horloge VIRTUELLE, déterministe par construction. **Aucun écran de la v3 ne tient encore de session invitée** : le gate se prouve donc sur QUATRE sujets **fabriqués**, chacun étant le scénario conforme moins UNE loi — il mute sur `hidden` (§ 6.5), il ne SUSPEND PAS son battement minuté (§ 8.5, barre « 0 requête »), il n'élit pas de porteur, il bat trop souvent (§ 8.5, le RAPPORT) — et il doit PASSER sur le scénario conforme **sans devenir inerte** (la reprise sur `visible` est le second témoin : un vert obtenu par une page qui ne demande plus rien ne prouve rien). Le « 1 seule » du battement est un **RAPPORT, jamais un compte absolu** — la période est de 5 min (§ 5, § 6.4), donc un porteur unique en émet DEUX sur 10 min ; le gate oppose `plafondDeBattements` sur `BATTEMENT.fenetreDeRecetteMs`, jamais le littéral de cette phrase ni une durée déduite du compte observé, et il refuse aussi de sortir vert sur **zéro** battement observé. La durée opposée valait `TICS × periodeMs` pendant que le scénario émettait exactement `TICS` battements : `plafond = TICS`, donc une comparaison vraie par CONSTRUCTION — un **contrôle inerte** dont le seul discriminant restant était l'ÉLECTION. Plafond et compte ont désormais des origines DIFFÉRENTES : le plafond vient de la fenêtre de recette, le compte de l'horloge virtuelle. *Preuves de non-vacuité rejouées* : `fenetreDeRecetteMs → 1` faisait **5 passed**, fait **3 failed** ; un scénario conforme qui cesse de suspendre son battement faisait **5 passed**, fait **2 failed**. Les **six cas C→H** du § 6.5 attendent l'écran `thread` (L2), qui leur donnera un sujet : `CAS_DE_RECETTE` les énumère avec leur statut et un témoin oppose la liste de ce qui reste à porter. **Porteur** : le job `lifecycle-v3` de `.github/workflows/ci.yml` (`bun run test:lifecycle`, non amnistié) et la sixième mesure de `scripts/v3-rapport.mjs` — un instrument que rien ne lance n'en est pas un.

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
| Accessibilité | **LIVRÉ** — `apps/web-v3/e2e/visual/v3-a11y.spec.ts` (verdict dans `lib/a11y.ts`) | `@axe-core/playwright`. Balaie ce que `next build` a ÉMIS, sur les **quatre colonnes de thème** du § 9.6, en assérant le **statut HTTP** de chaque route avant `axe`. **LANCÉ** par le job `a11y-v3` de `ci.yml` et par la cinquième mesure de `scripts/v3-rapport.mjs` |
| Cycle de vie | **LIVRÉ** — `apps/web-v3/e2e/visual/v3-lifecycle.spec.ts` (verdict dans `lib/lifecycle.ts`) | Les deux barres du § 8.5 et du § 6.5 : **0 requête** pendant que l'onglet est `hidden`, **0 requête MUTANTE** sur `visibilitychange:hidden` seul, et le battement d'**un seul porteur** pour N onglets. Aucun écran ne tenant encore de session invitée, il se prouve sur QUATRE sujets **fabriqués**, chacun le scénario conforme moins UNE loi — il TOMBE sur celui qui mute pendant `hidden`, sur celui qui ne SUSPEND PAS son battement minuté, sur celui qui n'élit pas de porteur et sur celui qui bat trop souvent ; il PASSE sur le scénario conforme, dont la **reprise** sur `visible` interdit un vert d'inertie. La fenêtre d'observation est **virtuelle** (`page.clock`) et couvre la fenêtre de recette entière : une fuite MINUTÉE — le cas nominal d'un battement non suspendu — était hors de portée d'une observation de 500 ms de temps machine. Les six cas C→H du § 6.5 sont énumérés avec leur statut (`CAS_DE_RECETTE`) et attendent l'écran `thread` (L2). **LANCÉ** par le job `lifecycle-v3` de `ci.yml` et par la sixième mesure de `scripts/v3-rapport.mjs` |
| Poids réseau | **LIVRÉ** — `apps/web-v3/scripts/mesure-reseau.mjs` ; `e2e/visual/v3-network-vitals.spec.ts` **reste à écrire et l'APPELLE** | CDP (`Network.enable`, `encodedDataLength`), FCP/LCP/CLS, **requêtes avant le premier pixel**, **requêtes PENDANTES** (`émises − terminées`, le GATE « 0 connexion tenue » du § 8.3). Applique le profil **3G Fast** (`Network.emulateNetworkConditions`) et répète l'exécution pour rendre un **p75** — sans quoi ses chiffres ne s'opposent à aucun plafond du § 8.3, exprimé « 3G Fast simulé, p75 » ; `--sans-emulation` le dit dans sa sortie. **COMPARE** ses chiffres aux plafonds de `budgets.json` → `reseau` : rc=1 sur un GATE franchi comme sur une url attendue qu'il n'a pas pu joindre. **La MESURE est un module, pas un spec** : la même mesure sert le gate de la v3 **et** la ligne de base pointée sur la production (`baseline.mjs`) — l'écrire dans un `.spec.ts` obligerait le second à réécrire la boucle CDP, c'est-à-dire à fabriquer la jumelle que la question (d) de la passe Opus cherche |
| Budget | **LIVRÉ** — `apps/web-v3/scripts/check-bundle-budget.mjs` + `budgets.json` + `budgets-mesures.json` | lit `apps/web-v3/.next/app-build-manifest.json`, appelé par `bun run build`. Classe les entrées par **NATURE** — `page` / `route` (0 octet client) / **annexe** (`/layout`, `/not-found` : entrées de manifeste non routables, dont les chunks SONT le socle) / inconnue (⇒ anomalie) — et **normalise le segment de groupe** que Next conserve dans la clé (`/(public)/stories/[id]/page`) avant tout classement. Un groupe de **moins de deux pages** ne rend pas de socle (`null`) et impute le poids ENTIER à l'écran : avec une seule page l'intersection est trivialement ses propres chunks, et l'écran rendait 0 Ko sous un plafond de 95 Ko. rc=1 plafond `GATE` dépassé **ou régression contre `budgets-mesures.json`** · rc=2 **page qu'aucun motif de `budgets.json` ne réclame** (aucun écran n'entre sans budget déclaré) |
| **Rapport unique** | **LIVRÉ** — `scripts/v3-rapport.mjs` (`--self-test`, `--json`, `--base <url>`, `--chemin </story/id>`) | agrège les **sept** mesures ci-dessus en un résultat chiffré. rc=0 tout vert · rc=1 une mesure rouge · **rc=2 rapport INCOMPLET** — une mesure dont le prérequis manque (build, serveur, chemin à mesurer, navigateur) sort en « non exécutée », **jamais en vert**. **Aucune sortie d'outil n'est parsée sans garde** : un outil qui échoue proprement (rc≠0, stdout vide) rend une mesure ROUGE portant sa première ligne de stderr, jamais une exception — l'agrégateur ne peut plus tomber là où le sous-gate tient. **L'accessibilité est la cinquième** : l'omettre rendait « 4/4 vertes, rapport complet » pendant que le gate axe n'avait jamais été regardé — un instrument absent de l'agrégation ne rougit jamais. **Le cycle de vie est la sixième**, entré par la MÊME porte le jour où il a existé, et **la ligne de base est la septième** — la seule mesure du dépôt qui ne soit PAS prise, et donc la seule dont l'absence de l'agrégation coûtait vraiment quelque chose : le rapport rendait « 6/6 vertes, rapport complet » sur la mesure contre laquelle le § 8.2 dit que « le progrès se démontre, jamais contre une intuition ». Elle n'invoque aucun outil, elle LIT `baseline.json` ; son verdict vit dans `apps/web-v3/scripts/baseline.mjs` (`verdictDeLigneDeBase`), avec la donnée qu'il juge, jamais dans l'agrégateur. Le `--self-test` sonde **25** mutations : 11 sur l'arithmétique des statuts (sept mesures), **3 sur l'INVOCATION**, **4 sur le classement d'un gate de navigateur** (un Chromium absent est un prérequis, pas un gate rouge), **7 sur le verdict de la ligne de base** (non établie ⇒ prérequis, jamais rouge ; établie sans chiffres ⇒ ROUGE ; illisible ⇒ ROUGE ; **mesurée ailleurs que sur la production ⇒ ROUGE** ; **amputée d'un des six gestes ⇒ ROUGE** ; **sans profil réseau ⇒ ROUGE** ; établie, chiffrée et complète ⇒ vert) |
| **Résolution du navigateur** | **LIVRÉ** — `scripts/lib/navigateur.cjs` | site UNIQUE de « où est Chromium » et « où est le cache npm hors-ligne » (`.cache/dc-vendor`). `capture-cibles.js`, `compare-rendu.js` et `mesure-reseau.mjs` en dépendent ; les deux premiers en portaient deux copies divergentes |
| Ligne de base | **FORME LIVRÉE, VALEURS À ÉTABLIR** — `apps/web-v3/scripts/baseline.mjs` → `apps/web-v3/e2e/visual/baseline.json` | mesurée **sur la prod actuelle**, commitée, datée. Chaque ligne porte **la commande qui la produit** ; une ligne non mesurée reste `statut: "à établir"` avec sa raison et **toutes ses valeurs à `null`** — un zéro se compare, un `null` se voit. **Elle a désormais SES DEUX PORTEURS**, la même règle que le gate axe : la **septième mesure** de `scripts/v3-rapport.mjs`, qui la compte et la sort en « non exécutée » (rc=2) tant qu'elle n'est pas prise ; et `.github/workflows/v3-baseline.yml` (`workflow_dispatch`), l'**hôte** qui sait la prendre — un instrument que le réseau d'aucune session de développement ne peut lancer n'en est pas un, et il ne manquait pas de code mais de machine. Le workflow DEMANDE les cinq identifiants publics plutôt que de les deviner (un chiffre pris sur une page d'erreur est pire qu'un `null`), les passe par `env:` et les CITE — `${{ inputs.x }}` interpolé dans un `run:` est substitué avant le shell, donc exécutable —, rend `baseline.json` en artefact et ne commite rien : un fichier de vérité entre par une revue. **Elle se prend dans les CONDITIONS du § 8.3**, jamais dans celles du runner : `baseline.mjs` lit le profil 3G Fast au site unique qui le porte (`profilReseau()`, `budgets.json` → `reseau.profil`), le passe à `mesureUrls` avec ses `repetitions` et son `percentile`, et l'écrit dans le fichier — partager le MODULE de mesure sans partager ses conditions rendait l'« AVANT » et l'« APRÈS » non comparables, ce que le § 8.2 interdit. Et **son verdict refuse ce qui n'est pas la production** : une URL d'une autre origine (localhost, staging), un code HTTP ≥ 400 (`page.goto` réussit sur un 404 : la page d'erreur devenait un chiffre), une route manquante des six gestes, un fichier sans profil, un `null` maquillé en zéro |
| Jetons & icônes | `packages/design-tokens/`, `packages/icons/` + `scripts/build-sprite.ts` | mesuré : `packages/` ne contient aujourd'hui que `MeeshySDK` et `shared` |
| Alignement du lockfile | `scripts/check-lockfile-alignment.mjs` + étape **bloquante** du job `quality` de `ci.yml` | **à la RACINE, pas dans `apps/web-v3`** : l'invariant porte sur le `bun.lock` de la racine et sur les manifestes des workspaces que la racine déclare — sa surface est le dépôt (règle de placement (B)), et le précédent est `scripts/check-type-debt.sh`. Entrée **calculée depuis les globs `workspaces`**, jamais par un parcours du disque (qui ramassait `tests/` et le client Prisma généré). Rougit dans les **deux sens** : manifeste absent du lock **et** workspace loqué absent du disque. `--self-test` rejoue **11 mutations** |

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
bun run test:a11y                              # = bunx playwright test e2e/visual/v3-a11y.spec.ts
```

`v3-a11y.spec.ts` assère, **par route `(public)` × colonne de thème** : 0 violation `axe` `serious`/`critical` ; présence de `<main id="main-content">`, `<header>`, `<nav>` ; ordre de tabulation atteignant **tous** les contrôles ; **`lang="xx"` sur chaque nœud dont le texte a été résolu par le Prisme dans une langue ≠ `<html lang>`** ; `dir="rtl"` quand la locale est `ar`.

> **Ce que le fichier porte AUJOURD'HUI, et ce qui reste à porter** — parce qu'un document qui décrit un instrument au futur produit exactement le défaut que l'issue #4442 corrige. **Livré (L-0.5)** : le gate `axe` `serious`/`critical` du § 8.5, avec son balayage découvert, sa garde de non-vacuité, son échec sur une page sans groupe, son assertion de statut HTTP et ses quatre colonnes de thème. **À porter avec les écrans qui les rendent vrais** (aucun écran `(public)` n'existe encore, donc aucune de ces assertions n'aurait de sujet) : `<header>`/`<nav>`/`<main id="main-content">`, l'ordre de tabulation, le `lang` par nœud du Prisme et le `dir="rtl"`. Chaque écran du lot L1 les apporte pour lui-même ; c'est le § 8.5 qui les rend opposables à tous.
>
> **Un instrument qu'aucune commande ne lance n'en est pas un.** Le fichier a d'abord existé sans porteur : la chaîne `test:a11y` n'apparaissait que DEUX fois dans le dépôt — sa définition dans `apps/web-v3/package.json` et le témoin qui vérifiait cette définition. Le gate avait seulement changé de forme, d'une phrase sans fichier à un fichier sans exécutant. Ses DEUX porteurs sont donc gagés : le job **`a11y-v3`** de `.github/workflows/ci.yml` (build de la v3 → `npx playwright install --with-deps chromium` → `bun run test:a11y`, sans `continue-on-error`) et la **cinquième mesure** de `scripts/v3-rapport.mjs`, sans laquelle l'agrégateur rendait « 4/4 vertes, rapport complet » sur une accessibilité jamais regardée. Le témoin `le gate est BRANCHÉ` d'`a11y-gate.test.ts` assère ces deux INVOCATIONS, plus la seule présence d'une clé de `package.json`.
>
> **Le thème est une dimension du BALAYAGE, pas un réglage du navigateur.** `color-contrast` est d'impact `serious` — la barre exacte de ce gate — et c'est la seule règle d'`axe` dont le verdict dépende entièrement du thème. Sans `colorScheme` posé et sans `localStorage`, le script anti-flash (`app/theme-script.tsx`) résout toujours `light` : la branche `.dark`, celle pour laquelle ce script existe, n'aurait jamais été auditée, et une palette sombre non conforme AA aurait passé le gate indéfiniment. Le balayage prend donc les **quatre colonnes du § 9.6** (`COLONNES_DE_THEME` dans `lib/a11y.ts` — site unique, que `v3-visual.spec.ts` lira à son tour plutôt que de réécrire la table), le nom de chaque test porte sa colonne, et la classe résolue sur `<html>` est vérifiée AVANT `axe` — sinon l'audit mesure une palette et le vert en atteste une autre.
>
> **Ce que le balayage prend pour entrée est ce que `next build` a ÉMIS, pas ce que le disque porte.** `apps/web-v3/app/not-found.tsx` existe depuis L-0.5 et n'est servi par personne : Next n'émet la limite `/_not-found` qu'à partir d'une première page d'App Router, et le 404 qu'un navigateur reçoit d'ici là est celui du routeur Pages — sans `lang`, donc en violation `serious` de ce même gate (constat déjà tenu par `apps/web-v3/scripts/check-app-router-built.mjs`, et sans conséquence publique tant que la règle Traefik se limite à `/__v3/_next`, § 4.4). Un balayage du disque gaterait donc une page que personne ne reçoit et laisserait hors de portée celle qu'on reçoit vraiment. Et ce qui fait qu'une route est `(public)` n'est pas son répertoire : c'est le groupe que `budgets.json` lui reconnaît, par la loi de motif de `apps/web-v3/scripts/lib/motifs.mjs` — une seule déclaration de zone pour le budget (§ 8.3) et pour l'accessibilité. Site commun des deux lectures : `apps/web-v3/scripts/lib/routes-emises.mjs`.
>
> **Ce module rend un verdict à DEUX champs, et le gate axe les lit tous les deux.** `plusPrecis` pose `choix: null` dans deux cas distincts — aucun motif ne touche la page, ou deux groupes la réclament à précision égale — « une ambiguïté que l'appelant doit SIGNALER plutôt qu'arbitrer ». `check-bundle-budget.mjs` l'honore en rc=2 ; le gate axe ne lisait que `.groupe` et rangeait donc une page SANS budget déclaré au même endroit qu'une page que `(connected)` réclame légitimement : sautée, en silence, sans que la garde de non-vacuité (qui ne tire que sur une liste TOTALEMENT vide) n'y puisse rien. Il ÉCHOUE désormais en nommant la route et sa raison. La divergence était réapparue **à l'intérieur du module partagé** que l'extraction devait l'empêcher de produire — un module commun garantit une règle commune, jamais que ses deux consommateurs en lisent la même part.
>
> **Et il assère le STATUT HTTP avant `axe`.** Un `goto` qui rend une réponse non nulle ne prouve pas que la page demandée a été servie : une route bien ÉMISE qui échoue à l'exécution (404 sur un identifiant absent, 500, limite `error.tsx`) sert une page d'erreur qui hérite du `<html lang>` du layout racine et passe `axe` sans broncher — le gate sortirait vert sur un écran que le visiteur ne peut pas lire, c'est-à-dire sur le rôle premier, dont tout le contenu vient d'une ressource qui peut manquer. Le statut attendu appartient à la route (`RoutePublique.statut`, 200 par défaut, 404 pour `/_not-found` — la seule route dont la panne EST le contrat), pas au spec.

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

> **Ce que le fichier porte AUJOURD'HUI, et ce qui reste à porter.** **Livré (L-0.5)** : l'anti-régression du § 6.5, la barre « 0 requête » du § 8.5 et le cas E (élection ET rapport), sur **quatre sujets fabriqués** — le gate TOMBE sur la page qui mute pendant `hidden`, sur celle qui ne suspend pas son battement minuté, sur celle qui n'élit pas de porteur et sur celle qui bat trop souvent ; il PASSE sur la page conforme, et sa **reprise** sur `visible` interdit un vert d'inertie. L'horloge est **virtuelle** et portée par le CONTEXTE (deux onglets d'un navigateur partagent un temps) : installée avant navigation, figée après chargement, avancée une fois de `fenetreDeRecetteMs`. Les deux `page` d'un même `context` y sont déjà, opposant N onglets à un porteur unique. **À porter avec l'écran `thread` (L2)**, qui leur donnera un sujet : les cas **C** (bfcache et retour après 10 min), **D** (`Network.emulateNetworkConditions`, file hors-ligne), **F** (`isActive:false` forcé en base), **G** (lien révoqué) et **H** (fermeture d'onglet). `CAS_DE_RECETTE` (`e2e/visual/lib/lifecycle.ts`) porte cette table et un témoin du spec **oppose** la liste de ce qui reste — un instrument qui laisserait croire qu'il porte les six rendrait un vert sur cinq cas que personne n'a joués, c'est-à-dire exactement le défaut que l'issue #4442 corrige.
>
> **Le battement s'y joue par TIC APPELÉ, jamais par `setInterval`.** Une période de 5 min ne se joue pas dans un test ; la faire jouer par une horloge accélérée rendrait le compte dépendant de la machine, donc le gate instable — et un gate instable finit désarmé. Les `TICS` périodes sont donc **appelées** par le spec, et le plafond qu'elles opposent est celui que `plafondDeBattements` calcule pour un porteur unique.

### 9.8 Gate E — la frontière de zone (le `PathPrefix` change vraiment ce qui est servi)

Les gates A à D mesurent ce que la v3 REND. Celui-ci mesure ce qu'un navigateur **reçoit réellement** quand on ajoute ou retire un `PathPrefix`, Service Worker legacy **actif** — la seule preuve que le levier du § 4.3 n'est pas neutralisé côté client (§ 4.4 bis).

| # | Ligne | Ce qui est observé |
|---|---|---|
| 1 | SW legacy actif (visite préalable du legacy, worker installé), **`PathPrefix` ajouté** ⇒ la route est servie par la **v3** | la réponse porte la marque de la zone v3, jamais un corps venu du Cache Storage du legacy |
| 2 | **`PathPrefix` retiré**, `docker compose up -d` **sans rebuild** ⇒ le **legacy reprend** la route | aucun cache ne survit à l'opération : le retour arrière est effectif sur un navigateur **déjà venu** |
| 3 | aucune URL de la zone n'entre dans le Cache Storage du legacy après la visite | `caches.keys()` / `cache.matchAll()` inspecté depuis la page |
| 4 | l'activation d'une nouvelle version du **legacy** ne détruit pas le cache de la **zone** | les deux workers coexistent sur l'origine ; chacun ne purge que son namespace |

**État : recette Playwright à écrire** (elle a besoin du bac de répétition du § 4.10, seul endroit où l'on peut ajouter puis retirer un `PathPrefix` pour de vrai).

**Ce que les témoins unitaires gagent, exactement.** `apps/web/__tests__/public/sw.v3-zone.test.ts` (13 témoins) et `apps/web/__tests__/utils/service-worker-cache-namespace.test.ts` (3 témoins) exécutent le fichier **source réel** de `apps/web/public/sw.js` et le module réel de la page : ils gagent le **COMPORTEMENT** du worker 1.4.0 — navigation de zone, `/__v3/_next/image`, bundles, racine nue, chemin voisin, entrée de cache antérieure jamais resservie, cache jamais peuplé, non-régression du legacy, jumeau lu dans `docker-compose.prod.yml`, et les quatre témoins du namespace de purge (canal 3), jumeau `sw.js` ⇄ `utils/service-worker.ts` compris.

> **Ils ne disent RIEN de la version qui S'EXÉCUTE chez un visiteur revenant** — or c'est exactement la population que les lignes 1 et 2 visent (« navigateur DÉJÀ VENU »). Le worker neuf s'installe en `waiting` ; il n'active qu'à la fermeture de tous les onglets de l'origine ou au clic sur la bannière (§ 4.4 bis, « fenêtre de propagation »). **Les lignes 1 et 2 restent donc NON GAGÉES, et le resteront jusqu'à la recette Playwright** : les témoins gagent un comportement, pas une PRÉSENCE. C'est la leçon du cycle 122 (« qui AFFICHE ce qu'on élit ? ») déplacée d'un cran — *qui EXÉCUTE ce qu'on vient de corriger ?*

```bash
cd apps/web && npx jest __tests__/public/sw.v3-zone.test.ts __tests__/utils/service-worker-cache-namespace.test.ts
```

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
| **L-0.5** | « La v3 est joignable et sa conformité se mesure » | `apps/web-v3` (package Next, port 3300, `assetPrefix:'/__v3'`, `output:'standalone'`, **aucun `basePath`**) ; sa `Dockerfile` calquée sur `apps/web/Dockerfile` ; l'entrée dans `.github/workflows/docker.yml` (`paths: apps/web-v3/**`, détecteur `*"apps/web-v3/"*`, image `meeshy-web-v3`, **nommage disjoint de `web`**) ; l'entrée dans `ci.yml` (matrice de tests + **type-check BLOQUANT, jamais le ratchet**) ; le service `frontend-v3` dans `docker-compose.dev.yml` et `docker-compose.prod.yml` avec `priority=100` et une règle **réduite à `PathPrefix('/__v3/_next')`** — la zone d'assets, et rien d'autre tant qu'aucune page d'App Router n'est émise (§ 4.4) ; la fenêtre tmux `web_v3` ; le **nettoyage du `Makefile`** (`WEB_V2_DIR:88`, `WEB_V2_PID:102`, fenêtres `:1213-1214` et `:1534-1535` pointant `apps/web_v2` inexistant sur le port 3200 déjà pris) ; l'origine `:3300` dans `CORS_ORIGINS`/`ALLOWED_ORIGINS` ; le compose de **staging** (absent du dépôt) avec `frontend-staging.priority=1` ; l'**alignement du lockfile** ; **et toute la machine du § 9.2, ligne de base comprise** | tout |
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
9. Si l'issue bascule une route, **deux commits, dans cet ordre — jamais un seul** (§ 4.4 bis) :
   - **9a, ANTÉRIEUR** : ajouter le préfixe à `V3_ZONE_PREFIXES` dans `apps/web/public/sw.js`, **déployer l'image `apps/web`**, laisser se propager. Sans ce temps d'avance, le worker legacy resert son cache aux visiteurs revenants **sur la route qu'on vient de basculer**, et il n'y a aucun moyen de l'en empêcher après coup.
   - **9b, ENSUITE** : ajouter le `PathPrefix` au routeur `frontend-v3` (dépôt **ET** `/opt/meeshy/production/docker-compose.yml`), puis **rejouer une fois le retrait en staging** — preuve du retour arrière (**Gate E**, § 9.8, ligne 2, **sur un navigateur qui avait visité l'origine avant 9a**).

   Le préfixe **ne sort jamais** de `V3_ZONE_PREFIXES`, retour arrière compris : la liste est monotone croissante, et c'est ce qui garde vrai « enlever le `PathPrefix`, rien d'autre ne bouge » (§ 4.3). Le 9ᵉ témoin de `sw.v3-zone.test.ts` passe au ROUGE si 9b est commité sans 9a.

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
| 12 | **Le PLANCHER de Next dépasse le plafond du RÔLE PREMIER.** Mesuré à L-0.5 : le socle d'App Router pour une page RSC **vide** pèse **99,6 Ko gzip** (4 chunks partagés — `webpack` 1 677 o, `415ba63b` 54 101 o, `576` 45 933 o, `main-app` 253 o), au-dessus des **≤ 95 Ko** que le § 8.3 fixe à la lecture partagée — **avant la première ligne de code produit**. Détail et commande : `apps/web-v3/budgets-mesures.json` → `plancher_next`. | Le rôle premier est P0 : son budget est dépassé par la stack, pas par du code. Le découvrir au troisième écran coûte l'architecture. | Le plafond de 95 Ko reste écrit et **dépassé dès L1** (avertissement `CIBLE`, non bloquant). Deux issues à trancher : **monter le plafond** (et dire à combien), ou **sortir les écrans du rôle premier de l'hydratation d'App Router** (RSC sans runtime client, ou rendu statique servi hors Next). |

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
| Glyphes Phosphor distincts servis | **72** (71 nus + le couple `ph-fill ph-play`) | `grep -c '<symbol' packages/icons/sprite.svg`. La planche rend **73 jetons** (`grep -o 'ph-[a-z0-9-]*' … \| sort -u \| wc -l`) : le compte de jetons ne se lit PAS comme un compte de glyphes, puisque `ph-fill` et `ph-play` n'en font qu'un — et que `ph-play` nu, jamais réclamé, n'est pas servi |
| Occurrences de classes d'icône dans la planche | **76** | `grep -o 'ph ph-[a-z0-9-]*\|ph-fill ph-[a-z0-9-]*' docs/product/MeeshyWebV3Design/MeeshyWebV3.dc.html \| wc -l` |
| Sprite des 72 glyphes — brut / gzip | **31 682 o / 8 911 o** (2026-08-30) | `node packages/icons/scripts/build-sprite.ts` ; la valeur est écrite dans `apps/web-v3/budgets-mesures.json` → `sprite_phosphor`, jamais à la main. L'estimation antérieure (29 404 o / 8,8 Ko) précédait l'actif : le `<symbol>` livré porte `fill="currentColor"` — seul niveau qu'un clone de `<use>` EXTERNE emporte — ce qui coûte 1 440 o bruts et 43 o gzip (mesuré : `sed 's/ fill="currentColor"//g'` sur l'actif, puis `gzip -9`). Le tracé PLEIN du bouton lecture (`ph-fill-play`, `assets/fill/`) **remplace** le tracé creux jamais réclamé : le couple coûte **+2 o bruts et −8 o gzip** contre l'actif du 2026-08-30 qui servait le creux — la variante pleine est un chemin fermé sans contre-forme, donc plus courte |
| Sous-sprite critique — brut / gzip / glyphes | **3 595 o / 1 313 o / 8** (2026-08-30) | même commande ; composition déclarée dans `packages/icons/critique.json` |
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
| Routes d'App Router émises par `apps/web-v3` | **1** (`/healthz`, un route handler ; **aucune page**, donc pas de limite `/_not-found`) | `cd apps/web-v3 && bun run build && cat .next/app-path-routes-manifest.json` |
| Ce que la zone répond sur un chemin humain | **404 anglais du routeur Pages**, sans `<html lang>`, chunks `pages/_app` + `pages/_error` | `cd apps/web-v3 && cp -r .next/static .next/standalone/apps/web-v3/.next/ && PORT=3401 node .next/standalone/apps/web-v3/server.js` puis `curl -s localhost:3401/foo \| head -c 400` |
| Périmètre réel de `assetPrefix: '/__v3'` | **les bundles `_next` seulement** : chunk 200/200, `public/probe.txt` 200/404, `app/robots.txt` 200/404, `app/icon.svg` 200/404 (racine / sous `/__v3`) | même serveur, `for u in /probe.txt /__v3/probe.txt /robots.txt /__v3/robots.txt; do curl -s -o /dev/null -w "$u %{http_code}\n" localhost:3401$u; done` |
| `public/` dans la sortie `standalone` | **absent** — `output:'standalone'` ne le recopie pas | `ls apps/web-v3/.next/standalone/apps/web-v3` → `node_modules package.json server.js` |
| Invariants de la chaîne d'intégration de la v3 | **21**, dont **20 mutations** sondées | `node scripts/check-v3-pipeline.mjs --self-test && node scripts/check-v3-pipeline.mjs` |
| JS client expédié par le squelette de la v3 | **0 Ko** — 1 gestionnaire de route, **0 page** | `cd apps/web-v3 && bun run build && node scripts/check-bundle-budget.mjs` |
| **Plancher de Next** — socle d'App Router pour une page RSC **vide** | **99,6 Ko gzip** (101 964 o : `webpack` 1 677 + `415ba63b` 54 101 + `576` 45 933 + `main-app` 253) ; **au-dessus des 95 Ko** du rôle premier (§ 8.3) — question ouverte n° 12 | page sonde jetable sous `app/(public)/stories/[id]/`, puis `cd apps/web-v3 && npx next build && node scripts/check-bundle-budget.mjs` ; la sonde est retirée, son manifeste est commité en fixture (`apps/web-v3/__tests__/fixtures/app-build-manifest-groupe-reel.json`) |
| Ce qu'un `next build` émet AU MANIFESTE dès qu'une page de groupe existe | **5 clés** : `/(public)/stories/[id]/page`, `/_not-found/page`, `/not-found`, `/layout`, `/healthz/route` — dont **2 seulement** sont des pages | même sonde, `cat apps/web-v3/.next/app-build-manifest.json` |
| Ce que coûte le 404 de la zone sur un chemin humain | **105 803 o transférés, 9 requêtes dont 8 avant le premier pixel** (3 exécutions identiques) | serveur standalone en `PORT=3401` (voir la ligne « Ce que la zone répond… »), puis `node apps/web-v3/scripts/mesure-reseau.mjs http://127.0.0.1:3401/foo` |
| Le même 404, **en 3G Fast simulé, p75 sur 3 exécutions** | **103 Ko, 9 requêtes dont 8 avant le premier pixel, 0 pendante, FCP/LCP 596 ms** — contre **FCP/LCP 40 ms** sans émulation : c'est la preuve que le profil s'applique, et la raison pour laquelle un chiffre non émulé ne s'oppose à aucun plafond du § 8.3. Le gate rougit : `requetes_avant_premier_pixel : 8 > 3 (GATE)` | même serveur, `node apps/web-v3/scripts/mesure-reseau.mjs --repetitions 3 http://127.0.0.1:3401/stories/abc` puis la même commande avec `--sans-emulation` |
| Ligne de base « AVANT » sur `meeshy.me` | **0/6 mesurée — À ÉTABLIR, point OUVERT** : l'egress de la session de développement refuse `CONNECT meeshy.me:443` (`curl` rend `000` / « CONNECT tunnel failed, response 403 »), et les 5 autres cibles attendent un identifiant de contenu public. Le fichier porte lui-même son `point_ouvert` (ce qu'il faut rejouer, où, et comment vérifier le blocage) — le critère de fin du lot n'est **pas** atteint tant que `etablie` vaut `false`. **Ce qui a changé** : le blocage n'est plus seulement documenté, il est OPPOSABLE (septième mesure du rapport unique, rc=2) et LEVABLE sans code neuf (`.github/workflows/v3-baseline.yml`, à lancer avec cinq identifiants publics vivants). **Ce qui a changé au second tour** : l'instrument ne pouvait plus seulement être BLOQUÉ, il pouvait MENTIR. Il appelait `mesureUrls` sans options — donc sans émulation réseau et en UNE exécution — pendant que le gate de la v3 applique le profil 3G Fast de `budgets.json` et rend un p75 : l'« AVANT » aurait été pris en fibre de datacenter et l'« APRÈS » en 3G, et rien dans le fichier écrit ne l'aurait dit. Il applique désormais le profil au site UNIQUE qui le porte (`profilReseau()`) et l'ÉCRIT dans `baseline.json` (`profil`, `repetitions`, `percentile`). Trois refus ferment les trois autres façons d'être vert sans avoir mesuré la production : une URL hors de `https://meeshy.me` est refusée dès la commande (la sonder sur `127.0.0.1` ne rend plus `etablie: true` mais « origine hors production »), un code HTTP ≥ 400 n'est plus une mesure mais un « à établir » (`page.goto` RÉUSSIT sur un 404 : un identifiant mort devenait un chiffre commité), et le verdict exige que les six gestes du rôle premier soient tous représentés, avec un profil, sans chiffre absent maquillé en zéro. La chaîne CDP elle-même s'éprouve par `node apps/web-v3/scripts/mesure-reseau.mjs <url locale>`, dont c'est le métier — jamais par `baseline.mjs`, qui ne mesure que la production | `node apps/web-v3/scripts/baseline.mjs` → `apps/web-v3/e2e/visual/baseline.json` (chaque ligne porte sa commande et sa raison) ; `node scripts/v3-rapport.mjs` nomme le prérequis manquant |
| Gate de cycle de vie — témoins joués | **7** au navigateur, **60** sans navigateur | `cd apps/web-v3 && npx playwright test e2e/visual/v3-lifecycle.spec.ts` ; `cd apps/web-v3 && npx jest __tests__/lifecycle-gate.test.ts` |
| Rapport fenêtre d'observation ÷ période du battement, avant correction | **600** (500 ms machine ÷ 300 000 ms) — toute fuite non synchrone du gestionnaire `visibilitychange` était hors de portée | `DELAI_D_OBSERVATION_MS` de `v3-lifecycle.spec.ts` face à `BATTEMENT.periodeMs` de `e2e/visual/lib/lifecycle.ts` |
| Non-vacuité du gate — fenêtre de recette falsifiée | **3 failed** (avant correction : **5 passed**, le gate était aveugle à la fenêtre qu'il déclarait) | `sed -i 's/fenetreDeRecetteMs: 10 \* 60_000,/fenetreDeRecetteMs: 1,/' apps/web-v3/e2e/visual/lib/lifecycle.ts` puis `cd apps/web-v3 && npx playwright test e2e/visual/v3-lifecycle.spec.ts` — **restaurer le fichier ensuite** |
| Non-vacuité du gate — battement jamais suspendu pendant `hidden` | **2 failed** (avant correction : **5 passed**) | `sed -i '0,/  suspendLeBattementQuandCache: true,/s//  suspendLeBattementQuandCache: false,/' apps/web-v3/e2e/visual/lib/lifecycle.ts` puis la même commande — **restaurer le fichier ensuite** |
| Le rapport unique des sept mesures | rc=0 tout vert · rc=1 une rouge · **rc=2 incomplet** ; `--self-test` sonde **25** mutations (11 d'agrégation, 3 d'invocation, 4 de classement d'un gate de navigateur, 7 sur le verdict de la ligne de base) | `node scripts/v3-rapport.mjs --self-test` puis `node scripts/v3-rapport.mjs --base http://127.0.0.1:3300 --chemin /stories/<id>` |

**Ce que ce tableau dit, en une phrase** : aujourd'hui un lien Meeshy partagé
dans une messagerie rend une carte de preview **vide**, son contenu exige une
hydratation complète avant le premier pixel, et une story deep-linkée bute sur
un mur d'authentification — c'est-à-dire que les trois gestes du rôle premier
sont cassés, chacun pour une raison différente et mesurée.
