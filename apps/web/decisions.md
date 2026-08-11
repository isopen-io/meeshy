# Decisions - apps/web (Next.js Frontend)

## 2025-01: State Management - Zustand 5
**Statut**: Accept
**Contexte**: Besoin d'un state manager performant pour une app de messagerie temps r
**Decision**: Zustand 5 avec `devtools` + `persist` middleware, stores par domaine (auth, conversation, language, app)
**Alternatives rejet**: Redux Toolkit (boilerplate excessif), Context API (re-renders globaux), Jotai/Recoil (persistence moins mature)
**Cons**: `useShallow` obligatoire pour selectors multi-champs, pas de time-travel debugging natif

## 2025-01: Data Fetching - React Query 5 + Socket.IO
**Statut**: Accept
**Contexte**: Source de vrit temps r via WebSocket, cache HTTP comme filet de secuirte
**Decision**: React Query (`staleTime: Infinity`, `gcTime: 30min`) + Socket.IO qui met jour le cache directement
**Alternatives rejet**: SWR (manipulation cache moins puissante), Apollo/GraphQL (overkill pour REST+WS), polling (inefficace pour chat)
**Cons**: Logique de synchronisation cache complexe, risque de race conditions WS vs HTTP

## 2025-01: Routing - Next.js 15 App Router avec Route Groups
**Statut**: Accept
**Contexte**: Besoin de layouts partags et de boundaries d'authentification propres
**Decision**: App Router avec route groups `(protected)/` pour auth, Server Components par dfaut
**Alternatives rejet**: Pages Router (dprc, pas de RSC), Parallel Routes (trop complexe pour le chat)
**Cons**: `'use client'` ncessaire partout pour l'interactivit, erreurs build implicites

## 2025-01: Auth - JWT + Session Tokens en localStorage
**Statut**: Accept
**Contexte**: API cross-domain (`gate.meeshy.me` vs `meeshy.me`), support anonymous
**Decision**: JWT en localStorage (Zustand persist), refresh token non-bloquant 5min avant expiry, retry automatique sur 401
**Alternatives rejet**: httpOnly cookies (pas cross-domain), NextAuth.js (complexit serveur), OAuth seul (besoin user/pass MVP)
**Cons**: Vulnrabilit XSS (localStorage accessible), pas de protection CSRF native

## 2025-01: WebSocket - Socket.IO avec Orchestrator Pattern
**Statut**: Accept
**Contexte**: Messagerie temps rel avec reconnexion automatique et multi-device
**Decision**: Socket.IO Client 4.8 avec services spcialiss (MessagingService, TypingService, PresenceService, TranslationService)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/fallback), Firebase Realtime Database (vendor lock-in)
**Cons**: Bundle plus lourd que WS natif, fallback polling augmente la charge serveur

## 2025-01: Styling - Tailwind CSS 3.4 + Radix UI + CSS Variables HSL
**Statut**: Accept
**Contexte**: Design system personnalis avec thming dynamique (dark/light)
**Decision**: Tailwind utilitaire + Radix primitives (accessible) + CSS variables HSL + pattern shadcn/ui (copier, pas installer)
**Alternatives rejet**: Material UI (trop opinionn), Chakra UI (runtime CSS-in-JS), Styled Components (incompatible RSC)
**Cons**: Classes HTML longues, drift des composants shadcn/ui (merge manuel)

## 2025-01: i18n - Client-Side JSON (pas next-intl)
**Statut**: Accept
**Contexte**: next-intl redirige `/` vers `/en` ce qui casse l'UX du chat anonyme
**Decision**: Imports JSON dynamiques (`@/locales/{lang}/{ns}.json`), cache mmoire, Zustand language store
**Alternatives rejet**: next-intl (redirections URL forces), i18next (bundle lourd), SSR i18n (reload page au changement)
**Cons**: Pas de dtection locale par URL, pas de SEO pour le contenu traduit

## 2025-01: Build - Standalone Output + Runtime Env Injection
**Statut**: Accept
**Contexte**: Une seule image Docker pour dev/staging/prod
**Decision**: `output: 'standalone'`, placeholders `__RUNTIME_*__` remplacs par `sed` au dmarrage du container
**Alternatives rejet**: Build-time env vars (rebuild par env), SSR env vars (pas de standalone)
**Cons**: `sed` fragile sur code minifi, collision de placeholders possible
**Attention**: NE JAMAIS quoter les valeurs YAML dans docker-compose (`VAR=value` pas `VAR="value"`)

## 2025-01: Encryption - Signal Protocol + Web Crypto + IndexedDB
**Statut**: Accept
**Contexte**: E2EE pour messages privs, chiffrement serveur pour messages traduits
**Decision**: SharedEncryptionService (DI), Web Crypto API, IndexedDB pour cls (pas localStorage)
**Alternatives rejet**: localStorage (quota 5-10MB, pas async), custom crypto (ne jamais rouler le sien)
**Cons**: Pas de backup des cls, pas de sync multi-device, +300KB bundle

## 2025-01: Audio/Media - FFmpeg.wasm + Tone.js
**Statut**: Accept
**Contexte**: Compression audio ct client pour privacy et conomie bande passante
**Decision**: FFmpeg.wasm (compression), Tone.js (effets temps rel), Browser Image Compression
**Alternatives rejet**: Compression serveur (privacy), Web Audio API direct (trop bas niveau)
**Cons**: FFmpeg.wasm 30MB+, plus lent que FFmpeg natif, bugs Safari

## 2025-02: URL Config - Drivation dynamique depuis window.location
**Statut**: Accept
**Contexte**: L'app doit fonctionner sur localhost, IP LAN, meeshy.local, meeshy.me sans config
**Decision**: `lib/config.ts` drive les URLs depuis `window.location.hostname` (gate.{domain}, ml.{domain})
**Alternatives rejet**: URLs hardcodes (.env), variables d'environnement (ncessitent config par dev)
**Cons**: Ne fonctionne pas en SSR (besoin `INTERNAL_*_URL`), pattern sous-domaine hardcod

## 2026-08: SyncEngine — détection de trou `_seq` côté web (miroir du SDK iOS)
**Statut**: Accept
**Contexte**: Le gateway estampille les émissions Socket.IO user-scoped d'un numéro de séquence
monotone per-user (`_seq`, `emitWithSeq`). iOS le suit depuis 2026-05 (`SyncSeqState` /
`SyncSeqTracker` → `NotificationGapResyncCoordinator`). Le web n'en décodait RIEN : aucune
détection de trou, et aucune resync au reconnect. Or le QueryClient global tourne en
`staleTime: Infinity` — une notification manquée ne réapparaissait jamais de la session.
**Decision**: `lib/sync/sync-seq-state.ts` (valeur pure : `detectSyncSeqGap` / `recordSyncSeq` /
`observeSyncSeq`) est le miroir EXACT de `SyncSeqState.swift`. Le transport
(`notification-socketio.singleton`) observe le `_seq` et expose `onSyncDesync(reason)` —
`'gap'` (trou de séquence) ou `'reconnect'` (fenêtre aveugle après coupure). La décision « quoi
refetch » vit côté consommateur (`use-notifications-manager-rq`), débouncée 300 ms comme iOS.
**Alternatives rejetées**: réécrire la règle côté web (deux interprétations divergeraient) ;
brancher l'invalidation dans le singleton (mélange transport et décision produit, contraire au
découpage SDK/app d'iOS) ; réinitialiser le curseur à chaque `disconnect` socket (détruirait
précisément la preuve du trou que la reconnexion doit révéler).
**Cons**: le `_seq` n'est estampillé que sur `notification:new` (unique call-site `emitWithSeq`) —
la couverture reste celle du pilote. Émission et observation doivent rester en LOCKSTEP : étendre
`emitWithSeq` à d'autres events sans étendre l'observation des DEUX clients fabrique de faux trous.
Le curseur n'est pas persisté (mémoire d'onglet), donc une fenêtre onglet-fermé reste couverte par
le seul `refetchOnMount: 'always'`.

## 2026-08: Liste de conversations — rattrapage DELTA au reconnect socket (miroir `deltaSyncCore`)
**Statut**: Accepté
**Contexte**: Trois surfaces web tiennent un état temps réel ; deux rattrapaient une coupure
SOCKET (messages d'une conversation via `syncNewerMessages`, notifications via `onSyncDesync`
depuis le cycle 75), la liste de conversations non — `use-conversations-query.ts` n'avait que
`refetchOnMount: 'always'`. Le `refetchOnReconnect: 'always'` du QueryClient global ne la couvre
pas : il écoute le `onlineManager` de React Query, c'est-à-dire la connectivité RÉSEAU du
navigateur, que ne bougent ni un redémarrage gateway, ni un drop du load balancer, ni un échec
d'upgrade de transport. Pendant cette fenêtre, la liste garde compteurs de non-lus, aperçus et
effectif d'avant la coupure jusqu'au prochain focus de fenêtre ou remontage.
**Decision**: un DELTA `GET /conversations?updatedSince=`, jamais un `refetch()`.
`lib/sync/conversation-list-delta.ts` (valeur pure : `conversationDeltaWatermark` /
`mergeConversationDeltas`) est le miroir de `deltaSyncCore` + `mergeDeltaConversations` +
`reconcileUnread` du SDK iOS. Le déclencheur est le front `false → true` de `isSocketConnected`
(`use-conversation-list-delta-sync`), le MÊME motif que le « Trigger 1 » du fil de messages. La
borne est relue du cache à chaque passe — le cache React Query EST le curseur, aucun état
persisté.
**Alternatives rejetées**: `refetch()` de la liste (REMPLACE les pages en cache et perd ce que le
socket y a écrit — même raison qui a fait naître `syncNewerMessages`) ; un second signal de
reconnect propre à la liste (il en existe déjà un, testé) ; un curseur persisté à la iOS (le
cache est déjà la source, un second curseur pourrait diverger de lui).
**Cons**: le delta est upsert-only — une conversation HARD-supprimée côté serveur pendant la
coupure n'y apparaît jamais (iOS compense par une réconciliation complète 24 h ; le web s'appuie
sur `refetchOnWindowFocus`). Une inconnue plus ancienne que la fenêtre chargée est écartée tant
qu'il reste des pages, sinon elle se dupliquerait au prochain `fetchNextPage`. Le tri appliqué
après fusion est celui du serveur (`lastMessageAt` décroissant) : il ne s'applique qu'au chemin
delta, les patchs socket continuent de laisser la ligne à sa place.
