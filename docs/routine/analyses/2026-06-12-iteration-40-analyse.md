# Iteration 40 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 39 (lot « Fraîcheur & pureté », mergé via PR #604). Le plan iter 39 désigne
pour iter 40 : F2 (toujours bloqué — validation staging), F10 (opportuniste), sinon
nouvel audit du spectre récent → ancien. Les merges récents (#599, #600, #601, #603)
sont essentiellement iOS (non testable sur ce runner Linux) ; l'audit s'est donc porté
sur gateway + shared + web, du plus récemment touché au plus ancien, conformément à la
routine.

## Audit — constats vérifiés

### 1. Violation de la règle « No redundant boolean + timestamp pairs » (Post, PostComment)
`packages/shared/prisma/schema.prisma:2825-2826` (Post) et `:2982-2983` (PostComment)
portent la paire interdite `isDeleted Boolean @default(false)` + `deletedAt DateTime?`.
CLAUDE.md (racine ET gateway) érige le nullable seul en règle : `deletedAt: null` =
actif, non-null = supprimé avec horodatage. Vérifications faites :
- **Tous** les sites d'écriture posent les deux champs ensemble (`PostService.ts:492`,
  `PostCommentService.ts:195`, `ExpiredStoriesCleanupService.ts:79,93`,
  `routes/admin/posts.ts:549`) — la migration des filtres vers `deletedAt: null` est
  donc sémantiquement équivalente sur les données existantes.
- **Aucun** « restore » (`data: { isDeleted: false }`) n'existe — pas de chemin qui
  désynchroniserait les deux champs.
- **Aucun index** ne référence `isDeleted` (les `@@index` de Post/PostComment sont
  tous sur d'autres champs) — pas de migration d'index.
- **Aucun client ne consomme le booléen** : `apps/web` = 0 occurrence ;
  iOS calcule déjà `isDeleted` en propriété dérivée
  (`CoreModels.swift:612`, `MessageModels.swift:341` : `deletedAt != nil`).
  Le modèle `Message` (schema l.549) suit déjà le pattern pur — Post/PostComment sont
  les deux seuls retardataires.
- ~91 occurrences `isDeleted` côté gateway/shared (dont ~30 en tests) : filtres
  (`isDeleted: false`), sélections, mocks. Champs MongoDB résiduels dans les anciens
  documents : inoffensifs (Prisma ignore les champs inconnus).

### 2. Agrégations en mémoire dans les endpoints admin langues (bande passante MongoDB→gateway)
`services/gateway/src/routes/admin/languages.ts` rapatrie des collections entières
pour agréger en JS :
- `/stats` l.84-96 : `findMany` de TOUS les messages de la fenêtre (jusqu'à 90 j) avec
  jointure `sender` pour compter les utilisateurs distincts par langue (Map+Set en JS).
- `/stats` l.119-130 : `findMany` de TOUS les messages avec `translations` — les blobs
  JSON de traduction (potentiellement plusieurs Ko par message multilingue) traversent
  le réseau pour un simple comptage de paires de langues (l.135-153).
- `/timeline` l.290-296 : `findMany` de TOUS les messages de la fenêtre pour un
  groupement par jour fait en JS (l.307-315).

Sur une plateforme dimensionnée 100k msg/s, ces trois requêtes sont des bombes mémoire
et un gâchis massif de bande passante intra-cluster. L'état de l'art MongoDB est le
pipeline d'agrégation côté base (`$group`, `$objectToArray`+`$unwind`,
`$dateToString`), accessible via `prisma.message.aggregateRaw`. Seuls les agrégats
(quelques dizaines de lignes) traversent alors le réseau. Le premier `groupBy` Prisma
(l.56-72, top langues) est déjà côté base — c'est le modèle à généraliser.

### 3. Requêtes séquentielles dans NotificationService (latence notifications)
`createMentionNotification` (`NotificationService.ts:1019-1029`) attend
`user.findUnique` PUIS `conversation.findUnique` alors que les deux sont
indépendantes. Même motif dans `createReactionNotification` et les méthodes sociales.
`Promise.all` divise la latence DB par 2 sur le chemin chaud des mentions/réactions
(appelé à chaque fan-out).

### 4. Abonnement au store entier pour le thème (Header, DashboardLayout)
`apps/web/components/layout/Header.tsx:61` et `DashboardLayout.tsx:66` :
`const { theme, setTheme } = useAppStore()` — abonnement à TOUT le store Zustand sans
sélecteur : ces deux composants structurels re-rendent à chaque mutation du store
(notifications, sidebar…), pas seulement au changement de thème. Les sélecteurs
existent déjà (`useTheme` `app-store.ts:131`, `useAppActions` l.136 avec `useShallow`)
mais sont contournés. Violation directe de « Zero Unnecessary Re-render ».

### 5. `console.log` de debug en production (use-ranking-data)
`apps/web/hooks/use-ranking-data.ts:101,103,119` : trois `console.log` verbeux
(paramètres, réponse complète, items) expédiés à chaque fetch de ranking dans la
console de tous les utilisateurs + trois `console.error` hors logger maison.
À remplacer par `logger.*` (silencieux en prod, cohérent avec le reste de l'app).

### Faux positifs / déjà conformes (vérifiés pendant l'audit)
- `ImageAttachment.tsx` : srcset responsive + `loading="lazy"` + `decoding="async"` —
  exemplaire, rien à faire.
- Hooks React Query conversations/messages : `staleTime: Infinity` + sync Socket.IO —
  conformes W1-W7.
- `typing.service.ts` : cleanup des listeners complet, aucune fuite.
- Compteurs dénormalisés de Post (`likeCount`…) : pattern correct, à imiter pour F10.
- Tick `AgentScheduleTimeline` : déjà visibility-aware depuis iter 39 ; le
  restructurer en start/stop d'interval serait du churn sans gain mesurable.

## Décision iter 40 — lot « Pureté schéma & agrégation côté base »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Suppression `isDeleted` (Post, PostComment) : schéma, filtres → `deletedAt`, types shared, tests | Pureté — règle critique CLAUDE.md ; un octet de moins par doc/payload ; zéro risque de désynchronisation |
| B | `languages.ts` : 3 agrégations en mémoire → pipelines MongoDB (`aggregateRaw`) | Bande passante/CPU — O(messages) → O(agrégats) sur le réseau ; suppression du risque OOM admin |
| C | Web : sélecteurs `useTheme`/`useAppActions` (Header, DashboardLayout) ; `console.*` → `logger` (use-ranking-data) | UX/CPU — zéro re-render parasite des composants structurels ; consoles propres |
| D | `Promise.all` sur les paires de `findUnique` indépendants des notifications sociales | Latence — chemin chaud des fan-outs ÷2 en aller-retours DB |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | Dénormaliser `conversationId` scalaire + index sur `Notification` (`context.conversationId` filtré via `$runCommandRaw` `NotificationService.ts:3016`) | MOYEN | Dual-write + backfill ; utile à fort volume ; à coupler avec une fenêtre de maintenance |
| F17 | `getAllUsers()` sans pagination ni sélection de champs (`users.service.ts:36`, consommé par `use-contacts-v2.ts:117`) | MOYEN (BP) | Nécessite une évolution du contrat API gateway (params `limit`/`fields`) |
| F18 | Helpers `formatTime`/`formatDuration`/`formatTimeAgo` dupliqués dans 5+ composants admin/web | FAIBLE (pureté) | Extraction vers `packages/shared` à faire d'un bloc avec revue des locales |
| F19 | Spinner du dashboard ignore le cache React Query (`dashboard/page.tsx:155`) | MOYEN (UX) | Distinguer `isPending`/`isFetching` — à auditer écran par écran |

## Gain estimé global
Schéma 100 % conforme à la règle nullable-timestamp (plus aucune paire redondante) ;
endpoints admin langues passant de O(messages) à O(agrégats) en transfert réseau et
mémoire gateway ; Header/DashboardLayout insensibles aux mutations de store hors
thème ; latence des notifications mention/réaction réduite d'un aller-retour DB ;
console production propre.
