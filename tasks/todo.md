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

## Review section
À compléter à la fin de l'exécution.
