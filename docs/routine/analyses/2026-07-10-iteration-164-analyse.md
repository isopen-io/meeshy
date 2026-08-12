# Iteration 164 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `c7f17a6` (dernier merge : PR #1814 — Android per-message language explorer sheet).
Branche `claude/brave-archimedes-rgmqss` recréée sur `origin/main` (0/0). Ce cycle prend **164**
(163 est pris par la PR ouverte #1815 — story-comment fan-out visibility).

PRs ouvertes au démarrage (autres sessions, hors périmètre autonome) :
- #1817 — gateway/realtime : language-filtered `message:new` cross-node delivery
- #1816 — android/chat : live cloned-voice audio translation
- #1815 — gateway/notifications : story-comment fan-out visibility (iter 163)

Périmètres verrouillés (pour ne pas dupliquer / entrer en conflit) : mentions autocomplete,
stats participant / online-users, posts/story watch-time (`recordView`/`duration`), realtime
delivery/receipts + `message:new` language filter, notifications story-comment visibility,
`PostCommentService.deleteComment`/`likeComment`, calls / signaling, typing suppression,
translator queue, presence label, message-edit empty-content, attachment-reaction offline replay,
notification:read badge, `useMessageStatusDetails` cache key, `computeStoryDurationMs`,
`resolveContentRoute`, `formatContentPublishedAt` DST.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests, hors des périmètres verrouillés.
Priorité 1 = features récemment développées (feed social / réactions / stories).

---

## Cible retenue : F123 — `PostService.getPostInteractions` lit les réactions depuis le JSON legacy `post.reactions` (stale) au lieu de la table `PostReaction` (SSOT) → toute réaction posée via socket s'affiche `reaction: null` dans le panneau « vues » de l'auteur

### Current state
`services/gateway/src/services/PostService.ts:1311`. `getPostInteractions(postId, userId)`
alimente le panneau « seen-by + réactions » de l'auteur d'un post / story
(`GET /posts/:postId/interactions`, `routes/posts/interactions.ts`). Avant ce cycle :

```ts
const post = await this.prisma.post.findFirst({
  where: { id: postId, deletedAt: NOT_DELETED },
  select: { id: true, authorId: true, reactions: true },   // ← JSON legacy dénormalisé
});
...
const reactions = (post.reactions as any[] | null) ?? [];   // ← source stale
const reactionByUser = new Map<string, string>();
for (const r of reactions) reactionByUser.set(r.userId, r.emoji);
const viewers = views.map((v) => ({
  ...
  reaction: reactionByUser.get(v.user.id) ?? null,          // ← faux pour réaction socket
}));
```

Le champ JSON `post.reactions` n'est écrit que dans **deux** endroits de toute la codebase —
`likePost` (l.757) et `unlikePost` (l.800), **REST uniquement**. Le chemin socket
(`post:reaction-add` → `PostReactionHandler.handleAddReaction` → `PostReactionService.addReaction`)
crée une ligne `PostReaction` et met à jour `reactionSummary`/`reactionCount`/`likeCount`,
mais **jamais** `post.reactions`.

### Problems identified
Une réaction posée via socket (le chemin par défaut du web et de l'app) n'apparaît **jamais**
dans le panneau des vues de l'auteur : `post.reactions` reste vide/stale, donc
`reactionByUser.get(v.user.id)` renvoie `undefined` → `reaction: null`. L'auteur voit « Vera a
vu » mais pas son 👍.

### Root cause
Divergence de source de vérité. Le maintainer avait **déjà diagnostiqué exactement cette classe
de bug** dans le chemin frère `PostFeedService.enrichWithLikeStatus`
(`PostFeedService.ts:933-939`, commentaire : *« PAS du Json legacy `post.reactions` (jamais mis à
jour par le chemin socket → `isLikedByMe` était faux après un like socket) »*) et l'avait migré
vers la table `PostReaction`. `getPostInteractions` était le **dernier consommateur** resté sur le
JSON legacy — une instance résiduelle de la même divergence.

### Scénario input → output erroné
1. Auteur A poste la story S. Viewer V l'ouvre (web) et réagit 👍 via `post:reaction-add`.
2. `addReaction` crée `PostReaction{postId:S, userId:V, emoji:'👍'}` + met à jour
   `reactionSummary`/`reactionCount`/`likeCount`. `post.reactions` reste vide.
3. V a aussi une ligne `PostView` sur S.
4. A ouvre le panneau des interactions → `getPostInteractions(S, A)`.
5. Lit `post.reactions` (vide) → `reactionByUser` sans entrée pour V.
6. **Output** : V listé avec `reaction: null`. **Attendu** : `reaction: '👍'`.

### Business impact
Feature feed social / stories (Priorité 1). L'auteur, principal consommateur de ce panneau,
ne voit aucune des réactions posées via le chemin par défaut (socket) — le signal d'engagement
le plus direct est invisible côté créateur.

### Technical impact
Divergence SSOT silencieuse : aucune erreur, la donnée existe (la table `PostReaction` est
correcte, `getPostReactions` la lit bien) mais un consommateur lit une projection périmée.

### Risk assessment
Faible. Le correctif aligne `getPostInteractions` sur le contrat déjà appliqué par tous les
autres consommateurs de réactions (`enrichWithLikeStatus`, `getPostReactions`, feed). Contrat de
retour (`{ viewers, total, hasMore }`) inchangé ; aucun changement de schéma, d'API, d'état
persistant. Le JSON legacy n'est plus lu — donc une réaction retirée via socket cesse aussi
d'apparaître fantôme.

### Proposed improvements
Dériver `reactionByUser` de `this.prisma.postReaction.findMany({ where: { postId },
select: { userId, emoji } })` (SSOT), plié dans le `Promise.all` existant (aucun round-trip
séquentiel supplémentaire). Retirer `reactions: true` du `select`.

### Expected benefits
- Panneau des vues de l'auteur cohérent avec les réactions socket (le cas dominant).
- Convergence du **dernier** consommateur de réactions vers la table SSOT → plus de dérive de
  cette classe.
- Une réaction retirée via socket disparaît correctement (plus de fantôme legacy).

### Implementation complexity
Triviale — ~8 lignes de prod (une requête ajoutée dans le `Promise.all`, un `select` allégé).

### Validation criteria
- RED d'abord : réaction socket (ligne `PostReaction`, `post.reactions` vide) → `viewers[0].reaction`
  doit valoir `'👍'` (échoue avant : `null`, l'ancien code ne lit jamais la table).
- JSON legacy stale : `post.reactions` porte un 😍 fantôme, table vide → `reaction: null`
  (la table fait autorité).
- Viewer sans réaction → `null` (parité).
- Suites `posts` gateway vertes ; `tsc --noEmit` sans nouvelle erreur.

### Tests — absence de couverture confirmée
Les trois suites de route (`interactions.test.ts`, `interactions-extended.test.ts`,
`interactions2.test.ts`) **mockent intégralement** `PostService.getPostInteractions` — la méthode
réelle, et sa lecture de `post.reactions`, n'est jamais exécutée. Aucun test unitaire de
`PostService` ne semait une `PostReaction` socket pour asserter le champ `reaction`. Nouveau
fichier `__tests__/posts-interactions-reaction-source.test.ts` (3 tests).

---

## Suivis (backlog, non traités ce cycle)
- **Réaction cross-session : mauvaise identité comparée (Participant ID vs User ID)**
  (`apps/web/hooks/queries/use-reactions-query.ts:411,444`). `handleReactionAdded` /
  `handleReactionRemoved` comparent `event.participantId` (un `Participant.id`, construit par
  `ReactionHandler._resolveParticipantId`) à `currentUserId` (un `User.id`). Les deux espaces
  d'identifiants ne sont jamais égaux pour un utilisateur enregistré → le highlight « vous avez
  réagi » ne se met pas à jour sur les autres sessions/onglets du même utilisateur (chip sans
  anneau `border-primary`, ou resté highlighté après retrait). Les tests
  (`use-reactions-query.test.tsx`) sèment `participantId === currentUserId`, masquant le
  décalage. Fix non-trivial : plomber un `currentParticipantId` (résolu depuis les participants
  de la conversation) dans `UseReactionsQueryOptions` et comparer dessus, aux deux sites +
  chemin anonyme. Reporté à un cycle dédié (touche plusieurs call sites → plus invasif que le
  scope surgical de ce cycle, et adjacent au périmètre réactions).
