# Story Comments — Reactions Persistantes + Mentions + Notifications

Branche : `claude/design-story-comments-ouk2s`

## Contexte
La PR précédente a livré le row commentaire moderne (bulles teintées auteur, switch langue, heart) avec un toggle heart purement local. Ce plan complète :
- Heart **persistant** côté serveur (réutilisation exacte du pattern message reactions)
- Realtime entre clients (sockets, pas REST)
- Mentions dans les commentaires (UI/UX identique à conversation)
- Fan-out de notifications conforme aux règles produit

## Règles produit (notifications)
1. **Story author** : notifié à chaque nouveau commentaire sur sa story
2. **Friends of story author** : notifiés à chaque nouveau commentaire sur sa story
3. **Previous commenters** : notifiés à chaque nouveau commentaire sur la même story (même si pas en réponse à eux)
4. **Comment author** : notifié quand quelqu'un réagit à son commentaire
5. **Mentioned users** : notifiés quand mentionnés dans un commentaire (cohérent avec messages)

## Pattern de référence
On calque **exactement** sur `Reaction` (modèle MongoDB des reactions sur les messages) :
- Table dédiée avec `@@unique([commentId, userId, emoji])`
- `currentUserReactions: string[]` calculé en batch côté API (sans modifier le `select` Prisma)
- Socket.IO : transport principal (pas REST) — events `comment:reaction-add` (client) / `comment:reaction-added` (server)
- Notification type `comment_reaction` (priorité `low`) + skip si self-reaction

## Phase 1 — Backend foundation (cette PR)

### 1A. Prisma + Service (commit atomique)
- [ ] Ajouter modèle `CommentReaction { id, commentId, userId, emoji, createdAt, updatedAt }` avec unique `[commentId, userId, emoji]` et indexes
- [ ] Ajouter `reactionCount Int @default(0)` sur `PostComment`
- [ ] Créer `services/gateway/src/services/CommentReactionService.ts` (mirror exact de `ReactionService.ts`, swap `messageId→commentId`, `participantId→userId`)
- [ ] Tests TDD : `services/gateway/src/__tests__/unit/services/CommentReactionService.test.ts` (mirror de `ReactionService.test.ts`)
- [ ] `npm run build` côté shared (regen Prisma client)

### 1B. Socket.IO events + handler (commit atomique)
- [ ] `socketio-events.ts` : ajouter `SERVER_EVENTS.COMMENT_REACTION_ADDED = 'comment:reaction-added'`, `COMMENT_REACTION_REMOVED = 'comment:reaction-removed'`, `COMMENT_REACTION_SYNC = 'comment:reaction-sync'`, `CLIENT_EVENTS.COMMENT_REACTION_ADD`, `COMMENT_REACTION_REMOVE`
- [ ] `socketio-events.ts` : ajouter `ROOMS.post = (id) => \`post:${id}\`` + helpers `joinPost`/`leavePost`
- [ ] `types/post.ts` : ajouter `CommentReactionUpdateEventData`, `CommentReactionAggregation`, `CommentReactionSyncEventData`
- [ ] `socketio/handlers/CommentReactionHandler.ts` (mirror de `ReactionHandler.ts`) : handlers `comment:reaction-add`/`comment:reaction-remove`/`comment:reaction-request-sync`, broadcast à `post:{postId}`, trigger notification `comment_reaction`
- [ ] Wire handler dans `MeeshySocketIOManager`
- [ ] Wire room join/leave : viewer joins `post:{postId}` à l'ouverture, leave à la fermeture
- [ ] Tests TDD : `__tests__/unit/socketio/CommentReactionHandler.test.ts`

### 1C. GET comments — currentUserReactions (commit atomique)
- [ ] Modifier `PostCommentService.getComments`/`getReplies` : après findMany, batch `prisma.commentReaction.findMany({ where: { userId, commentId: { in: commentIds } } })` → grouper en `Map<commentId, string[]>` → ajouter `currentUserReactions` à chaque comment de la réponse
- [ ] Tests TDD : `__tests__/unit/services/PostCommentService.test.ts` (cas : currentUserReactions vide, peuplé, multi-emoji)

### 1D. Notification fan-out (commit atomique)
- [ ] `NotificationService` : ajouter types `story_new_comment`, `friend_story_new_comment`, `comment_reaction` (constants dans `types.ts`)
- [ ] `NotificationService.createCommentReactionNotification(...)` (mirror de `createReactionNotification`)
- [ ] `NotificationService.createStoryCommentNotificationsBatch(...)` — un seul fan-out, types différents par destinataire (author, friend, previous commenter)
- [ ] Wire dans `comments.ts` POST : après création, fetch previous commenter IDs + story author + friends, batch notify
- [ ] Tests TDD : `NotificationService.test.ts`

### 1E. SDK Swift (commit atomique)
- [ ] `APIPostComment.currentUserReactions: [String]?` dans `PostModels.swift`
- [ ] Types socket `SocketCommentReactionUpdateEvent`, `SocketCommentReactionAggregation`
- [ ] `SocialSocketManager` : listeners `comment:reaction-added`/`comment:reaction-removed`/`comment:reaction-sync`
- [ ] Méthodes : `addCommentReaction(commentId, emoji)`, `removeCommentReaction(commentId, emoji)`, `requestCommentReactionSync(commentId)`, `joinPostRoom(postId)`, `leavePostRoom(postId)`
- [ ] Tests : decoding + socket events

### 1F. iOS wiring (commit atomique)
- [ ] `StoryViewerView` : seeder `storyCommentLikedIds` depuis `comment.currentUserReactions?.contains("❤️")` au chargement
- [ ] Sur tap heart → emit socket `comment:reaction-add` ou `-remove` (pas REST)
- [ ] Subscribe aux events realtime → patcher `storyCommentLikedIds` + `storyCommentLikeDelta`
- [ ] Join `post:{storyId}` room à l'ouverture du viewer, leave au close
- [ ] Test ViewModel : seeding correct depuis API

## Phase 2 — Mentions (PR suivante)
- Généraliser `/mentions/suggestions` pour accepter `postId`
- `MentionService.createMentions` + `createMentionNotificationsBatch` dans comment POST
- Web : `CommentComposer` + `PostComposer` consomment `useMentions` + `MentionAutocomplete`
- iOS : `FeedCommentsSheet` consomme `MentionService` + panel suggestions

## Risques & décisions
- **Migration MongoDB** : pas de backfill — les anciens likes (likeCount denormalisé) ne migrent pas vers `CommentReaction`. Acceptable car stories TTL courte + `likeCount` reste pour rétro-compat affichage.
- **Room `post:{postId}`** : nouvelle room. Viewer iOS/web doit join/leave proprement.
- **Idempotency** : `addReaction` actuel n'est pas en transaction (findFirst + create séparés). On reproduit le même pattern (cohérence) MÊME si ce n'est pas optimal — refacto séparée.
- **`likeCount` field** : on garde pour rétro-compat mais on ne s'en sert plus côté heart (utiliser `reactionCount` + `currentUserReactions`).

## Phase 3 — Post reactions unification (table pattern)

Décision : aligner `Post` sur le pattern `Comment`/`Message` (table dédiée). Élimine la race d'array, la fuite de privacy (liste reactors broadcast à tous), et les 3 sources de vérité divergeantes (`likeCount`/`reactionCount`/`reactionSummary`/`reactions[]`).

### 3A — Prisma + PostReactionService (commit atomique)
- [ ] `PostReaction { id, postId, userId, emoji, createdAt, updatedAt }` + `@@unique([postId, userId, emoji])` + indexes (mirror exact de `CommentReaction`)
- [ ] Relations inverses : `Post.postReactions PostReaction[]` + `User.postReactionsAuthored PostReaction[]`
- [ ] **Garder** `Post.reactions: Json?` et `Post.likeCount` pour rétro-compat (deprecation future)
- [ ] Créer `services/gateway/src/services/PostReactionService.ts` (mirror de `CommentReactionService`)
  - `addReaction(postId, userId, emoji)` avec `try/catch P2002`
  - `removeReaction`
  - `getEmojiAggregation` retournant `{ emoji, count }` (pas `userIds` — décision privacy Phase 3 trim)
  - `getPostReactions`
  - `updatePostReactionSummary` enveloppé dans `prisma.$transaction`
  - `MAX_REACTIONS_PER_USER = 1` (cohérent)
- [ ] Tests TDD ~60 tests

### 3B — Socket.IO + handler (commit atomique, après 3A)
- [ ] `SERVER_EVENTS.POST_REACTION_ADDED/REMOVED/SYNC = 'post:reaction-added/-removed/-sync'`
- [ ] `CLIENT_EVENTS.POST_REACTION_ADD/REMOVE/REQUEST_SYNC`
- [ ] `PostReactionUpdateEventData`, `PostReactionAggregation`, `PostReactionSyncEventData` (slim — pas de `userIds`)
- [ ] `PostReactionHandler` mirror de `CommentReactionHandler` :
  - Auth check + Zod validation
  - `canUserViewPost()` ACL réutilisé (déjà extrait Phase 1 remediation)
  - `SocketRateLimiter` 30/min (cohérent)
  - Broadcast à `ROOMS.post(postId)` (déjà existant !) + `user:{postAuthor}`
- [ ] Wire dans `MeeshySocketIOManager`
- [ ] Tests TDD ~20 tests

### 3C — Refactor PostService.likePost/unlikePost en compatibility shim (commit atomique)
- [ ] `PostService.likePost` → délègue à `postReactionService.addReaction` + maintient `Post.reactions: Json[]` + `likeCount` en parallèle (compat clients pré-Phase-3)
- [ ] `PostService.unlikePost` → idem
- [ ] Documenter dans le code que ces méthodes sont des shims temporaires
- [ ] Tests asserent la double-écriture

### 3D — GET /posts batch query currentUserReactions (commit atomique, après 3A)
- [ ] Modifier `PostService.getFeed` / `getPost` / `findPostsForUser` (find canonical method) : après le `findMany(posts)`, batch query `prisma.postReaction.findMany({ userId, postId IN [...] })` → map → ajouter `currentUserReactions: string[]` à chaque post
- [ ] Mirror exact du pattern messages.ts:711-734 et PostCommentService.getComments
- [ ] Tests TDD ~10 tests

### 3E — SDK Swift (commit atomique, après 3B+3D)
- [ ] `APIPost.currentUserReactions: [String]?`
- [ ] `SocketPostReactionUpdateEvent`, `SocketPostReactionAggregation`, `SocketPostReactionSyncEvent`
- [ ] `SocialSocketProviding` : `addPostReaction(postId:emoji:)`, `removePostReaction`, `requestPostReactionSync`
- [ ] Listeners
- [ ] Tests

### 3F — iOS feed + post detail wiring (commit atomique)
- [ ] PostListView / PostDetailView : seed liked state depuis `currentUserReactions`
- [ ] Heart tap → Socket.IO emit (pas REST)
- [ ] `.onReceive` events realtime
- [ ] In-flight lock + heartInFlight per postId
- [ ] join/leave `post:{postId}` room sur viewer

### 3G — Migration script one-shot (commit séparé)
- [ ] `scripts/migrate-post-reactions.ts` : pour chaque `Post.reactions: Json[]` non vide, insert `PostReaction` rows (idempotent via unique constraint)
- [ ] Dry-run option, batch 1000 posts/iteration, progress log
- [ ] Tests sur fixtures

### 3H — Docs (commit atomique)
- [ ] `services/gateway/decisions.md` : entrée « Post reactions migrés vers table dédiée — unification avec Message/Comment »
- [ ] `tasks/todo.md` Phase 3 review section

### Hors scope Phase 3
- Drop définitif de `Post.reactions: Json[]` + REST `/like` endpoints → Phase 4 (après ~2 versions clients migrés)
- Endpoint paginé `GET /posts/:id/reactions?emoji=X` (si feature « voir qui a liké » devient produit) → à la demande
- Web Next.js wiring → Phase 4
- Migration analogue pour `Post.storyViews: Json[]` → séparé, scope distinct

## Phase 4 — Cohérence end-to-end + parité web/iOS + SWR/local-first

Issu des 3 revues Opus seniors (event flow E2E + SWR + cross-frontend parity).
Scope total : 11 P0 + 10 P1 + 7 P2.

### Wave 4A — Backend P0 critique (commit atomique)
- [ ] **#1** `getStoryNotificationRecipients` inclut les `PostReaction` reactors (scénario 6 cassé)
- [ ] **#2** `core.ts` POST + PUT : `extractMentions` + `createPostMentions` + `createPostMentionNotificationsBatch` (post-body mentions)
- [ ] **#3** `notification:counts` event émis sur chaque `createNotification` + `notification:read` → `ROOMS.user(userId)`
- [ ] **#4** Self-reaction guard dans `_createReactionNotification` (`ReactionHandler.ts`)
- [ ] Tests TDD pour chaque

### Wave 4B — Backend P1 broadcasts + rate limit (commit atomique)
- [ ] STATUS likes → `status:reacted` au lieu de `post:liked` générique
- [ ] `broadcastStoryReacted` émet à `ROOMS.post(storyId)` (pas que author)
- [ ] Nouveau event `story:unreacted` + handler
- [ ] `broadcastPostUpdated` appelé sur PUT `/posts/:id` non-STORY
- [ ] Rate limit per-pair sur `message_reaction`/`post_like`/`comment_reaction` (mirror MAX_MENTIONS_PER_MINUTE)
- [ ] `invalidateFriendsCache` sur friend accept
- [ ] Rename `STORY_TRANSLATION_UPDATED` event constant `post:` → `story:`
- [ ] Tests

### Wave 4C — Web data layer migration (commit atomique)
- [ ] **P0 #5** Fix `useCreateCommentMutation` import dans `feeds/post/[postId]/page.tsx` (crash)
- [ ] **P0 #9** Ajouter `currentUserReactions: string[]` + `isLikedByMe: boolean` aux types `Post`/`PostComment` dans `packages/shared/types/`
- [ ] **P0 #7** Migrer `useLikePost`/`useUnlikePost`/`useLikeComment`/`useUnlikeComment` REST → Socket.IO (`addPostReaction`/`addCommentReaction`)
- [ ] **P0 #6** `use-post-socket-cache-sync.ts` subscribe à `POST_REACTION_ADDED/REMOVED/SYNC` + `COMMENT_REACTION_ADDED/REMOVED/SYNC`
- [ ] **P0 #8** Supprimer `useState<Set<string>>` pour `likedPosts`/`bookmarkedPosts`/`userReactions` dans `feeds/page.tsx`, dériver depuis cache TanStack
- [ ] Tests intégration React Query

### Wave 4D — Web v2 UX (commit atomique, après 4C)
- [ ] **P0 #11** Wire `useCommentsInfiniteQuery({postId: story.id})` + `CommentList` réutilisé dans `StoryViewer.tsx`
- [ ] **P1** Wire `useMentions` + `MentionAutocomplete` dans v2 `CommentComposer.tsx`, `PostComposer.tsx`, `MessageComposer.tsx`
- [ ] **P1** Heart animation : spring + `@media (prefers-reduced-motion: reduce)` guard sur `PostCard.tsx` + `CommentItem.tsx`
- [ ] **P1** Min 44px touch target sur heart buttons
- [ ] **P2** Shimmer placeholder dans `MentionAutocomplete.tsx` pendant debounce
- [ ] **P2** v2 feeds page explicit `CacheResult` switch (au lieu de TanStack isLoading implicite)

### Wave 4E — iOS gaps (commit atomique)
- [ ] **P0 #10** `loadStoryComments` cache-first via `CacheCoordinator.shared.comments.load`
- [ ] **P1** SDK `storyUpdated`/`storyDeleted` publishers + listeners (`SocialSocketManager.swift`)
- [ ] **P1** Wire consommation dans `StoryViewModel.swift`
- [ ] **P1** `FeedCommentsSheet.repliesMap` persiste via `CacheCoordinator.shared.comments` (clé `replies-{commentId}`)
- [ ] **P2** Nouveau cache store `reactions: GRDBCacheStore<MessageID, ReactionAggregation[]>` OU forcer `messages.mergeUpdate` sur chaque event
- [ ] Tests

### Wave 4F — Friend content notifs (commit atomique)
- [ ] **P2** Story creation : notif `friend_posted_story` aux amis (friends only)
- [ ] **P2** Mood/status creation : notif `friend_posted_mood`
- [ ] iOS `MeeshyNotificationType` + push templates
- [ ] Tests

### Plan d'exécution (parallélisation par file set)
- **Round 1 (parallèle)** : 4A backend P0 / 4C web data / 4E iOS
- **Round 2 (parallèle)** : 4B backend P1 / 4D web UX
- **Round 3** : 4F friend notifs + final review

**Status** : Phase 3 livrée (8 commits supplémentaires sur la branche, **18 commits total**).

### Commits Phase 3
| Commit | Phase | Tests |
|---|---|---|
| `997befa` | docs(plan) | — |
| `3b7e0a5` | 3A — Prisma `PostReaction` + service | 67 ✓ |
| `ae384f8` | 3B+3D — Socket.IO `PostReactionHandler` + GET batch `currentUserReactions` | +48 ✓ |
| `53d85c2` | 3C — `PostService.likePost/unlikePost` compat shim | 154 ✓ (full suite) |
| `78edd78` | 3E — SDK Swift `currentUserReactions` + socket events | +5 (Swift) |
| `d42d8f6` | 3G — Migration script + helper + 19 tests | 19 ✓ |
| `c8e88ff` | 3F — iOS feed + post detail wiring | +10 (Swift) |
| à venir | 3H — docs decisions.md + review | — |

**Bilan Phase 3** : 8 commits, ~149 nouveaux tests verts gateway/iOS, `tsc --noEmit` clean. Pattern unifié sur Message/Comment/Post (3 entités sur 4 désormais alignées).

### Vérifications restantes (macOS requis)
- [ ] `./apps/ios/meeshy.sh build && test`
- [ ] `swift test` SDK (PostModelsTests, SocialSocketEventTests)
- [ ] Smoke test : like/unlike rapide multi-device, vérifier convergence

### Plan de déploiement
1. Deploy gateway + SDK + iOS Phase 3 codebase
2. Exécuter `pnpm tsx scripts/migrate-post-reactions.ts --dry-run` pour estimer volume
3. Exécuter sans `--dry-run` en horaire creux (~80 min/M posts)
4. Monitor metrics `post_reactions_added_total`, latence socket handler
5. Après ~2 semaines de stabilité + clients SDK migrés : Phase 4 deprecate `Post.reactions: Json[]` + REST `/like` endpoints

### Follow-ups (Phase 4+)
- Drop `Post.reactions: Json[]` après backfill complet et clients migrés
- Drop REST `POST/DELETE /posts/:id/like` endpoints (équivalent Socket.IO disponible)
- Endpoint paginé `GET /posts/:id/reactions?emoji=X&limit=20` si feature « liked by » devient produit
- Migration analogue pour `Post.storyViews: Json[]` → table `PostView` (autre dette structurelle)
- Web Next.js consume `currentUserReactions` + socket realtime
- Localized APNs/FCM templates pour `post_like`/`comment_reaction`

## Review section — Phase 2 (Mentions)

**Status** : Phase 1 livrée (6 commits sur `claude/design-story-comments-ouk2s`, tous poussés).

### Commits
| Phase | Commit | Description | Tests |
|-------|--------|-------------|-------|
| 1A | `8cb1e61` | Prisma `CommentReaction` + `CommentReactionService` (mirror exact de `ReactionService`) | 63 ✓ |
| 1C | `5f199fd` | `currentUserReactions` batch query dans `GET /posts/:postId/comments` + replies | 12 ✓ |
| 1B | `c12333b` | Socket.IO events (`comment:reaction-added/removed/sync`, `post:join/leave`) + `CommentReactionHandler` + `ROOMS.post(id)` | 14 ✓ |
| 1E | `4830be2` | SDK Swift : `APIPostComment.currentUserReactions`, `Socket{Comment}Reaction{Update/Sync}Event`, publishers + emit méthodes | 6 (Swift, non vérifiés sur Linux) |
| 1D | `dca4080` | Fan-out notifications new-comment (author `STORY_NEW_COMMENT` + friends `FRIEND_STORY_COMMENT` + prior commenters `STORY_THREAD_REPLY`, dedup priorité auteur > commenter > friend) | 15 ✓ |
| 1F | `a601e20` | iOS heart toggle persistant via socket (plus de REST), seed `storyCommentLikedIds` depuis `currentUserReactions`, join/leave `post:{storyId}` room | 4 (Swift) |

**Total** : 6 commits, 104 tests gateway verts, TypeScript `tsc --noEmit` clean.

### Vérifications restantes (non exécutables depuis Linux)
- [ ] `./apps/ios/meeshy.sh build` (macOS requis)
- [ ] `./apps/ios/meeshy.sh test` (macOS requis)
- [ ] `cd packages/MeeshySDK && swift test --filter "(PostModelsTests|SocialSocketEventTests)"` (macOS requis)

### Follow-ups identifiés (hors scope)
1. **Mentions Phase 2** (PR suivante)
   - Généraliser `/mentions/suggestions` pour accepter `postId`
   - `MentionService.createMentions` + `createMentionNotificationsBatch` dans comment POST
   - Web `CommentComposer`/`PostComposer` + iOS `FeedCommentsSheet` consomment l'autocomplete
2. **SDK protocol extension** : ajouter `joinPostRoom/leavePostRoom/addCommentReaction/removeCommentReaction` au protocole `SocialSocketProviding` pour faciliter le mocking iOS
3. **UX iOS** : indicateur in-flight pendant l'ack socket + toast d'erreur sur rollback
4. **Web** : `useCommentReactionsQuery` (mirror de `useReactionsQuery`) + consommation des nouveaux events dans `CommentItem`
5. **Refacto idempotency** : `addReaction`/`addCommentReaction` actuellement `findFirst + create` séparés — passer en `upsert` avec transaction si on rencontre des races en prod

### Décisions notables
- **`likeCount` field** : conservé sur `PostComment` pour rétro-compat affichage, mais le heart ne s'en sert plus (utilise `reactionCount` + `currentUserReactions`). Cleanup futur possible.
- **`reactionSummary` JSON** : maintenu denormalisé (économie d'1 requête au render), mais la source de vérité reste la table `CommentReaction`.
- **Broadcast targeting** : `ROOMS.post(postId)` pour les viewers actifs (live sync) + `user:{commentAuthorId}` pour la notification — les deux comme demandé.
- **Migration** : pas de backfill, les anciens `likeCount` denormalisés ne migrent pas vers `CommentReaction`. Acceptable (stories TTL courte).
