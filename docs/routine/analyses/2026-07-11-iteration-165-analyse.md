# Iteration 165 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `c358be9` (dernier merge : PR #1823 — Android per-post Prisme language switch).
Branche `claude/brave-archimedes-okxxjl` recréée sur `origin/main` (0/0). Ce cycle prend **165**.

PRs ouvertes au démarrage (autres sessions, hors périmètre autonome) :
- #1824 — gateway/realtime : `updatedBy` requis dans tous les emits `CONVERSATION_UPDATED`

Périmètres verrouillés (pour ne pas dupliquer / entrer en conflit) : `conversation:updated`
emits / `emitConversationPreviewUpdate` / `MessageHandler.broadcastNewMessage`,
`PostService.getPostInteractions` reaction source (fixé iter 164), `PostFeedService.enrichWithLikeStatus`,
réactions cross-session identity (Participant ID vs User ID) dans les hooks web, mentions
autocomplete, stats participant / online-users, watch-time/`recordView`, `message:new` language
filter, calls / signaling, typing suppression, translator queue, presence, message-edit
empty-content.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests, hors des périmètres verrouillés.
Priorité 1 = features récemment développées (feed social / réactions / stories).

---

## Cible retenue : F124 — `ExpiredStoriesCleanupService` filtre le soft-delete des stories expirées avec le matcher MongoDB `deletedAt: null`, qui ne matche **aucune** story vivante → aucune story expirée n'est jamais soft-deletée (ni hard-deletée ensuite) : fuite de lignes MongoDB non bornée

### Current state
`services/gateway/src/services/ExpiredStoriesCleanupService.ts:72-81`. Le service tourne toutes
les heures (`start(intervalMs = 60*60*1000)`) et effectue un nettoyage en deux passes :

```ts
const softResult = await this.prisma.post.updateMany({
  where: {
    type: 'STORY',
    expiresAt: { lt: now },
    deletedAt: null,          // ← matcher MongoDB incorrect
  },
  data: { deletedAt: now },
});
```

La passe 1 (soft-delete) marque les stories expirées `deletedAt = now`. La passe 2 (hard-delete)
ne cible que les stories **déjà** soft-deletées (`deletedAt: { not: null }`) plus vieilles que
`hardDeleteAgeMs` (7 j).

### Problems identified
Sur MongoDB, un post jamais supprimé ne stocke **aucune** clé `deletedAt` : Prisma omet les
champs optionnels non renseignés à l'insertion. Un filtre `{ deletedAt: null }` ne matche **pas**
les documents où le champ est absent — il matche zéro story vivante. La passe soft-delete met donc
toujours `softDeleted = 0`. Comme rien n'est jamais soft-deleté, la passe hard-delete
(`deletedAt: { not: null }`) ne trouve rien non plus → `hardDeleted = 0` en permanence. Les
documents de stories expirées (et leurs tableaux embarqués `storyViews` / réactions, leurs lignes
`PostMedia`) s'accumulent **indéfiniment** dans MongoDB.

### Root cause
Divergence avec l'invariant MongoDB **déjà documenté et centralisé** dans la codebase :
`services/gateway/src/services/posts/postIncludes.ts:18-33` exporte
`NOT_DELETED = { isSet: false }` avec un commentaire explicite :

> *« Prisma's bare `{ deletedAt: null }` filter does NOT match documents where the field is ABSENT
> on MongoDB — Prisma omits unset optional fields at insert time… The naive `null` filter then
> silently drops EVERY live post, which emptied the feed / reels / stories endpoints in
> production. »*

Tous les autres consommateurs Post (`PostService`, `PostFeedService`, `PostCommentService`,
`postIncludes`) importent `NOT_DELETED`. `ExpiredStoriesCleanupService` est le **seul** site resté
sur le matcher naïf `deletedAt: null` — une instance résiduelle exacte de la même classe de bug qui
avait vidé le feed en production.

### Scénario input → output erroné
1. Story S créée normalement il y a 25 h (TTL 24 h). Le document Mongo n'a **pas** de clé
   `deletedAt` (champ non renseigné → omis par Prisma).
2. `expiresAt < now` est vrai. La passe soft-delete tente
   `updateMany({ where: { type:'STORY', expiresAt:{lt:now}, deletedAt: null } })`.
3. **Output** : `{ deletedAt: null }` ne matche pas le document sans clé `deletedAt` → `count = 0`.
   **Attendu** : la story est soft-deletée (`count ≥ 1`).
4. 7 jours plus tard, la passe hard-delete cherche `deletedAt: { not: null }` → toujours vide,
   car rien n'a jamais été soft-deleté. La story reste en base pour toujours.

### Business impact
Feature stories (Priorité 1). Le service existe précisément pour empêcher la fuite de lignes
MongoDB décrite dans son propre header (`storyViews`/réactions grossissent sur les stories virales
longtemps après leur disparition de l'écran). Le bug le rend **totalement inopérant** : la fuite
qu'il devait fermer reste ouverte. Invisible côté produit (les read paths filtrent déjà par
`expiresAt > now`) jusqu'à ce que la collection MongoDB gonfle — disque, coût, latence des scans,
analytics faussées.

### Technical impact
Fuite silencieuse de lignes non bornée. Aucune erreur, aucun log d'alerte — le service loggue
`softDeleted: 0` sans jamais signaler l'anomalie. Les lignes `PostMedia` des stories expirées
(le contenu le plus media-heavy, et toutes les stories expirent) ne sont jamais purgées.

### Risk assessment
Très faible. Le correctif aligne l'unique site divergent sur le contrat `NOT_DELETED` déjà appliqué
partout ailleurs. Contrat de retour (`{ softDeleted, hardDeleted }`) inchangé ; aucun changement de
schéma, d'API, d'état persistant autre que celui **attendu** (les stories expirées commencent enfin
à être soft- puis hard-deletées). La passe hard-delete (`deletedAt: { not: null }`) reste correcte :
`{ $ne: null }` sur MongoDB exclut bien les champs absents ET null, ne matchant que les vraies dates.

### Proposed improvements
Importer `NOT_DELETED` depuis `./posts/postIncludes` (source de vérité unique de l'invariant) et
remplacer `deletedAt: null` par `deletedAt: NOT_DELETED` dans la passe soft-delete. Commentaire
inline expliquant le piège MongoDB pour empêcher toute régression future.

### Expected benefits
- Les stories expirées sont enfin soft-deletées puis hard-deletées → la fuite de lignes MongoDB
  que le service devait fermer est réellement fermée.
- Les lignes `PostMedia` orphelines des stories expirées sont purgées (passe G7 enfin atteinte).
- Convergence du **dernier** site vers l'invariant `NOT_DELETED` → plus de dérive de cette classe.

### Implementation complexity
Triviale — 1 ligne de prod modifiée (+ 1 import, + commentaire). Zéro round-trip supplémentaire.

### Validation criteria
- RED d'abord : le nouveau test asserte que le `where` du soft-delete `updateMany` vaut
  `{ isSet: false }` (et non `null`) — échoue contre l'ancien code (`null`).
- GREEN : suite `ExpiredStoriesCleanupService` verte (10/10).
- `tsc --noEmit` sans nouvelle erreur ; l'import `NOT_DELETED` résout.

### Tests — absence de couverture confirmée
La suite `__tests__/unit/ExpiredStoriesCleanupService.test.ts` **mocke intégralement** Prisma :
`post.updateMany` est `jest.fn(async () => ({ count: 0 }))`. Les tests couvrent le lifecycle,
l'error handling, la régression P2014, et le shape `where.OR` de la purge media — mais **jamais**
le `where` de la passe soft-delete, donc la sémantique `null` vs `isSet:false` n'était pas couverte.
Nouveau test (`soft-delete matches live stories by the unset deletedAt field, not null`) qui asserte
directement le `where` émis, sur le modèle des tests media-purge existants.

---

## Suivis (backlog, non traités ce cycle)
- **Optimistic unlike laisse une clé fantôme `{emoji: 0}` dans `reactionSummary`**
  (`apps/web/hooks/queries/use-post-mutations.ts:372-375`, jumeau
  `use-comment-mutations.ts:277-280`). `onMutate` de `useUnlikePostMutation` écrit
  `reactionSummary[emoji] = Math.max(0, count - 1)` et **conserve** la clé quand le compte tombe à
  0, alors que le réconciliateur socket autoritatif (`handlePostReactionRemoved`,
  `use-post-socket-cache-sync.ts:266-286`) `delete newSummary[emoji]` quand `count === 0`. Les
  renderers (`PostCard.tsx:270`, `PostDetail.tsx:117`) calculent `hasReactions =
  Object.keys(reactionSummary).length > 0` sans filtre zéro → badge fantôme « 👍 0 » qui clignote
  jusqu'à l'echo serveur. Non couvert (le test n'assert que `likeCount`). Fix ~5 lignes par site.
  Reporté (zone hooks réactions web, adjacente à un périmètre verrouillé).
- **`useFeedQuery` sans garde `hasMore`** (`apps/web/hooks/queries/use-feed-query.ts:25`) :
  `getNextPageParam` renvoie `lastPage.meta?.nextCursor ?? undefined` sans garder
  `pagination.hasMore`, contrairement à son frère `use-reels-feed-query.ts:34-35`. Boucle de fetch
  possible si l'endpoint renvoie un `nextCursor` non-null sur la dernière page. Confiance moyenne
  (dépend du contrat serveur).
- **`createStoryCommentNotificationsBatch` EXCEPT gate**
  (`services/gateway/src/services/notifications/NotificationService.ts:1611-1618`) : `canSeePost`
  pour `EXCEPT` renvoie `!visibilityUserIdSet.has(userId)` sans check d'amitié, contrairement au
  canonique `canUserViewPost` (`posts/postVisibility.ts:97-99`). Fuite de confidentialité possible
  après édition PUBLIC→EXCEPT. Reporté (zone notifications fan-out, semi-verrouillée).
