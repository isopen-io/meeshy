## Phase 5 — Reactions sur posts migrees vers table dediee (2026-05-15)

**Contexte** : Les reactions sur posts/stories etaient stockees en `Post.reactions: Json[]` embedded (array de `{userId, emoji, createdAt}`). Trois problemes structurels : (1) race condition sur l'array — concurrent `findFirst + update` ecrasent l'un l'autre car le RMW n'est pas atomique ; (2) leak de privacy — la liste exhaustive des reactors est envoyee a tout viewer du post ; (3) trois sources de verite divergeables (`likeCount`, `reactionCount`, `reactionSummary`, `reactions[]`).

Le pattern Message/Comment etabli en Phase 1+2 (table dediee + `currentUserReactions` batch + Socket.IO + ACL room) etait strictement superieur. Phase 5 aligne Post sur ce pattern.

**Decision** :
- Nouvelle table `PostReaction { postId, userId, emoji, createdAt, updatedAt }` avec `@@unique([postId, userId, emoji])` + indexes (`[userId, commentId]` cover la query batch hot path).
- Nouveau `PostReactionService` mirror exact de `CommentReactionService` post-remediation : `try/catch P2002`, `prisma.$transaction` enveloppant `updatePostReactionSummary`, `MAX_REACTIONS_PER_USER = 1`, `getEmojiAggregation` retourne `{ emoji, count }` only (pas de `userIds`/`hasCurrentUser` — Phase 3 privacy trim coherent SDK + gateway).
- Nouveau `PostReactionHandler` Socket.IO (`post:reaction-add/added/-remove/-removed/-request-sync/-sync`) avec auth, Zod, `SocketRateLimiter` 30/60s, `canUserViewPost()` ACL (extrait dans `services/posts/postVisibility.ts`, partage avec `CommentReactionHandler`), `enhancedLogger`. La room `post:{postId}` est partagee avec les comments — les handlers `post:join`/`post:leave` ont migre depuis `CommentReactionHandler` vers `PostReactionHandler` (posts sont les owners naturels).
- `PostService.likePost`/`unlikePost` (REST) deviennent des compat shims : delegent a `PostReactionService.addReaction`/`removeReaction` puis resynchronisent `Post.reactions: Json[]` + `Post.likeCount` depuis la table canonique. Les anciens clients qui lisent ces champs voient toujours un etat coherent.
- `currentUserReactions: string[]` ajoute aux reponses `GET /posts/:id`, `/feed`, `/feed/stories`, `/posts/user/:id`, `/posts/community/:id`, `/posts/bookmarks` via batch query `prisma.postReaction.findMany({ userId, postId IN [...] })`. `Cache-Control: private, no-cache` ajoute sur ces routes.
- SDK Swift : `APIPost.currentUserReactions: [String]?`, `SocketPostReactionUpdateEvent`/`SyncEvent`/`Aggregation` (slim), `addPostReaction(postId:emoji:)`/`removePostReaction`/`requestPostReactionSync` sur `SocialSocketProviding`, publishers `postReactionAdded/Removed/Sync`. `PostReactionError` enum (mirror de `CommentReactionError`).
- iOS app : `FeedView` + `RootViewComponents.ThemedFeedOverlay` + `PostDetailView` hoissent `postLikedIds`/`postLikeDelta`/`postHeartInFlightIds`, seedent depuis `currentUserReactions` via `computePostLikedIds(from:)`, emettent via Socket.IO (`addPostReaction`/`removePostReaction`, plus de REST), s'abonnent aux events realtime. `PostDetailView` join/leave la room `post:{postId}` ; le feed list NE join PAS (trop de rooms ephemeres).
- Script one-shot `scripts/migrate-post-reactions.ts` backfille `Post.reactions: Json[]` -> `PostReaction` rows. Cursor-paginated, idempotent via `@@unique` + P2002 swallow (Mongo Prisma 6 ne supporte pas `createMany skipDuplicates`), resumable via `--from-cursor`, `--dry-run` option. Helper `embeddedReactionsToRows` extrait + 19 tests unitaires.

**Alternatives rejetees** :
- **Garder embedded array avec Mongo natif `$push` + filter `$ne`** : aurait fixe la race d'array sans table, mais (a) necessite `prisma.$runCommandRaw` qui casse le typage Prisma et la coherence avec le reste du codebase, (b) ne resout PAS le leak de privacy (les viewers continuent de recevoir tous les userIds), (c) ne resout pas la dispersion des compteurs.
- **Hybride : table source-de-verite + snapshot embedded des derniers N** : dual-write, complexite supplementaire pour un benefice marginal sur des commentaires qui ont typiquement <30 reactions.
- **Reverser Comment vers embedded pour matcher Post** : aurait simplifie l'API (1 query), mais aurait reintroduit les 3 problemes resolus en Phase 1+2 + ses 12 commits + ses revues senior. Le pattern Comment est strictement superieur ; on a aligne Post dessus, pas l'inverse.

**Compatibilite** :
- `Post.reactions: Json[]` est PRESERVE pour les clients pre-Phase-5. Sa deprecation est differee a Phase 6 (apres deploiement + migration data + verification que les clients passent par `currentUserReactions`).
- Notification `'post_like'` (type existant) est reutilisee — pas de nouveau type pour eviter de toucher l'UI iOS de rendu de notifications.
- Anciens clients web continuent d'appeler REST `POST/DELETE /posts/:id/like` ; ces endpoints continuent de fonctionner via le compat shim.

**Risques connus residuels** :
- Drift potentiel entre `Post.reactions: Json[]` (legacy) et `PostReaction` table pendant la fenetre de migration : le shim `PostService.likePost` rebuild systematiquement le Json depuis la table, donc apres CHAQUE ecriture via /like ou Socket.IO les deux convergent. Mais les ecritures pre-Phase-5 restent en place — d'ou le besoin du script de backfill `scripts/migrate-post-reactions.ts`.
- `MeeshyNotificationType` doit etre etendu pour supporter `post_like` si pas deja present (verifie iOS pre-existant — type connu, rendu via `heart.fill`).

**Tests** : +67 PostReactionService + +26 PostReactionHandler + +22 PostService/PostFeedService batch enrichment + +5 SDK Swift decoding + +10 iOS computePostLikedIds + heartInFlight + +19 migration helper = **+149 tests**. Total Phase 1+2+3 atomiques sur la branche : 400+.
