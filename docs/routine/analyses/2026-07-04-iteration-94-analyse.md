# Iteration 94 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `c735c016` (« Merge pull request #1450 » — HEAD au démarrage, working tree propre).
Branche de travail `claude/brave-archimedes-xk6ick` déjà synchronisée sur `origin/main`
(même SHA `c735c016`), 0 commit non-mergé à préserver.

PR ouvertes au démarrage : #1452 (calling audit — gateway `CallEventsHandler`/`CallService` + iOS
`CallManager` + `apps/ios/decisions.md`), #1451 (Android contacts — `apps/android` only). Toutes
disjointes des fichiers web social ciblés ici. Cible retenue : **F55** (parké it.91→93, MEDIUM) —
désync du cache reels web sur `post:updated` / `post:deleted`, correction purement web vérifiable
en jest.

## Cible : F55 — désync du cache reels web sur edit/delete d'un post

### Current state
`use-post-socket-cache-sync.ts` maintient trois familles de caches React Query pour un post :
1. `posts.infinite('feed')` — le fil principal.
2. `posts.detail(id)` — la page détail.
3. Les **threads d'affinité reels** (`posts.reelsFeed(seed)` → clé
   `['posts','list','reels', seed]`, `foryou` + un thread par seed deep-linké `/reel/:id`),
   atteints via le helper `patchReelCaches` (prefix-match `setQueriesData`).

Les handlers de réaction / like / comment appellent bien `patchReelCaches` (via
`patchPostInAllCaches`), donc les compteurs restent live sur les surfaces reels. **MAIS** les deux
handlers de cycle de vie du post ne touchaient **jamais** les caches reels :

- `handlePostUpdated` (édition de caption/média) : patchait `feed` + `detail`, **pas** les reels.
- `handlePostDeleted` : patchait `feed` uniquement — **ni** les reels **ni** le cache `detail`.

### Problems identified
- **Caption périmé sur reels** : éditer un reel depuis n'importe quelle surface laisse
  `/feed/reels` et `/reel/:id` afficher l'ancien texte/média jusqu'au prochain refetch complet.
- **Reel supprimé persistant** : supprimer un reel le laisse visible dans les threads d'affinité
  reels — l'utilisateur peut scroller sur un contenu qui n'existe plus (et retenter une action
  socket dessus).
- **Cache `detail` orphelin sur delete** : `handlePostDeleted` ne purgeait pas
  `posts.detail(id)` — une vue détail déjà chargée d'un post supprimé restait servie depuis le
  cache (asymétrie avec `handlePostUpdated` qui, lui, écrit `detail`).

### Root cause
Trois familles de caches contiennent la même entité post, mais seuls deux des trois handlers de
mutation les traitaient toutes. `patchReelCaches` existait (introduit pour like/comment/bookmark)
mais n'était **câblé que dans le chemin `patchPostInAllCaches`** — les handlers update/delete,
qui construisent leur patch feed « à la main », ne l'invoquaient pas. Aucun helper de **suppression**
reels n'existait (symétrique de `patchReelCaches`).

### Business impact
Les reels sont la surface la plus récente et la plus consommée du produit social. Un caption qui
reste périmé après édition, ou un reel supprimé qui persiste dans le thread d'affinité, sont des
défauts de fraîcheur immédiatement visibles sur le geste éditorial de l'auteur — exactement la
surface où la cohérence local-first est un différenciateur (principe « Instant App »).

### Technical impact
- `handlePostUpdated` : ajoute `patchReelCaches(qc, data.post.id, () => data.post)` — remplace
  l'entité périmée dans **tous** les threads reels (prefix-match, tous les seeds).
- `handlePostDeleted` : ajoute `removePostFromReelCaches(qc, data.postId)` (nouveau helper,
  miroir de `patchReelCaches` filtrant l'id) + `queryClient.removeQueries({ queryKey:
  detail(postId) })` pour purger la vue détail orpheline.
- Zéro changement gateway/iOS/shared — correction purement web dans un seul fichier + tests.

### Risk assessment
FAIBLE. `patchReelCaches` / `removePostFromReelCaches` sont des no-op si aucun cache reels n'existe
(`if (!old?.pages) return old`), donc aucun effet sur les surfaces non-reels. `removeQueries` sur
`detail` est idempotent et sans effet si la vue détail n'a jamais été chargée. Les handlers `feed`
existants sont inchangés (tests existants verts). Aucun schéma, migration ni API publique modifiée.

### Proposed improvements
1. Câbler `patchReelCaches` dans `handlePostUpdated`.
2. Helper `removePostFromReelCaches` (miroir de `patchReelCaches`) + câblage dans
   `handlePostDeleted`, plus purge du cache `detail`.
3. Tests de régression : édition propagée aux threads `foryou` + seed ; suppression retire le post
   de tous les threads reels en préservant les frères ; suppression purge le cache `detail`.

### Expected benefits
- Caption/média d'un reel édité reste frais sur `/feed/reels` et `/reel/:id` sans refetch.
- Un reel supprimé disparaît de tous les threads reels immédiatement.
- Cache `detail` d'un post supprimé purgé — plus de vue orpheline servie depuis le cache.
- Symétrie complète des trois familles de caches sur les trois handlers de cycle de vie.

### Implementation complexity
FAIBLE — 1 helper neuf + 2 lignes de câblage + 1 `removeQueries`, dans un seul fichier, couvert par
3 tests de régression neufs.

### Validation criteria
- [x] `post:updated` propage l'édition aux threads reels `foryou` ET seed (RED sans fix, GREEN après).
- [x] `post:deleted` retire le post de tous les threads reels, frères préservés.
- [x] `post:deleted` purge le cache `detail` du post.
- [x] Suite `use-post-socket-cache-sync` : 83/83 verte (80 existants + 3 neufs), 0 régression.
- [x] `__tests__/hooks/queries/` complet : 382/382 vert, 15 suites.
- [x] `tsc --noEmit` web : 0 nouvelle erreur sur les 2 fichiers touchés (baseline test-mocks
      `implicit any` inchangé, hors périmètre).

## Candidats écartés ce cycle (documentés)
- **Câbler les reels dans `handlePostCreated` / `handlePostReposted`** : la création d'un reel
  n'apparaît pas nécessairement dans un thread d'affinité déjà chargé (ranking serveur) —
  prepend forcé fausserait l'ordonnancement affinité. Non retenu : ce n'est pas une désync, c'est
  le comportement voulu (le thread reels se re-classe au prochain fetch).
- **Fix racine gateway (émettre l'entité reel enrichie sur un événement dédié)** : les reels
  passent déjà par `post:updated`/`post:deleted` génériques — aucun nouvel événement nécessaire,
  le fix web-only est suffisant et correct.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed` (aligne posts non-❤️ sur le chemin heart-absolu).
- **F57** (LOW) : `hasMentions` (ASCII `\w`) vs `parseMentions` (Unicode) boundary drift.
- **F58** (LOW) : comment-reaction `postType` STATUS/REEL collapse.
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
