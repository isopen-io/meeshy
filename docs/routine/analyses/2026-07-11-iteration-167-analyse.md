# Iteration 167 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `3150bdb` (dernier merge : PR #1861 — android/profile report a user).
Branche `claude/brave-archimedes-fj3tsm` en phase avec `origin/main` (0/0).

Aucune PR autonome ouverte à traiter au démarrage (les PR ouvertes #1852–#1862 sont
d'autres branches / dependabot, hors de ce cycle). Ce cycle prend **167**.

Cible choisie parmi le **backlog explicitement reporté** des itérations 165 et 166
(« Suivis, non traités ce cycle ») :

> **gateway** — `PostCommentService.likeComment` (REST) contourne l'invariant « max 1
> réaction/user » appliqué par le path socket. Caveat de reachability (le client built-in
> n'envoie que ❤️).

Confirmé toujours présent. Le second candidat backlog (réaction cross-session web :
Participant ID vs User ID, `use-reactions-query.ts`) reste écarté : cross-couche
(type partagé + gateway + web), non validable en runtime web dans cet environnement.
La cible gateway retenue **est validable** (suites jest du gateway exécutables ici).

---

## Cible retenue : F126 — `PostCommentService.likeComment` (REST) ne borne pas les réactions d'un user à 1 emoji distinct → contourne l'invariant « max 1 réaction/user » du chemin socket

### Current state
`services/gateway/src/services/PostCommentService.ts:340`. Le like REST d'un commentaire
(`POST /posts/:postId/comments/:commentId/like`, `routes/posts/comments.ts:314`) accepte un
emoji arbitraire (`LikeSchema = { emoji: z.string().max(10).default('❤️') }`,
`routes/posts/types.ts:308`) et se contente d'un `upsert` sur la contrainte unique
`(commentId, userId, emoji)` :

```ts
await this.prisma.commentReaction.upsert({
  where: { comment_user_reaction_unique: { commentId, userId, emoji } },
  create: { commentId, userId, emoji },
  update: {},
});
```

L'`upsert` est idempotent **par emoji** — il empêche le double-comptage d'un même emoji,
mais **n'empêche pas** un user d'accumuler plusieurs emojis distincts.

Le chemin socket, lui (`CommentReactionService.addReaction:102-116`), applique explicitement
`MAX_REACTIONS_PER_USER = 1` : si le user détient déjà un emoji différent, l'ajout d'un
second est **rejeté**. Le modèle canonique de réaction de l'app (`ReactionService`, messages)
va plus loin : la clé unique est `(messageId, participantId)` sans emoji, si bien qu'un nouvel
emoji **remplace** in-place la réaction précédente (single-reaction-per-user).

### Problems identified
Un client qui envoie successivement `{ emoji: '❤️' }` puis `{ emoji: '👍' }` sur le même
commentaire via REST crée **2 lignes `CommentReaction`** pour le même user → `likeCount` /
`reactionCount` = 2, `reactionSummary = { '❤️': 1, '👍': 1 }`. Le socket aurait rejeté le 2ᵉ.

Entrée → sortie fausse :
- `likeComment(c, u, '❤️')` puis `likeComment(c, u, '👍')` → 2 réactions du user `u` sur `c`
  au lieu de 1. Divergence directe d'invariant REST vs socket sur la même table source de vérité.

### Root causes
`likeComment` a été conçu comme « fallback REST idempotent du socket » mais l'idempotence n'a
été raisonnée que **par emoji** (contrainte unique incluant l'emoji). L'invariant produit réel
— « au plus 1 réaction distincte par user par commentaire » — n'est pas une propriété de la
contrainte unique `(commentId, userId, emoji)` ; il doit être appliqué au niveau service,
comme le fait le chemin socket. Ce volet a été omis côté REST.

### Business impact
Faible mais réel : compteurs de like/réaction d'un commentaire potentiellement gonflés par un
seul user multi-emoji via REST, et état incohérent selon le chemin d'écriture. Masqué en
pratique car le client web built-in n'envoie que ❤️ via ce endpoint — mais le endpoint accepte
tout emoji, donc exploitable par tout client (mobile, API tierce, futur bouton multi-emoji).

### Technical impact
Nul hors du chemin REST like. La correction aligne REST sur l'invariant déjà garanti par
socket, en réutilisant le modèle canonique « la nouvelle réaction remplace la précédente ».

### Risk assessment
Très faible. Changement local à `likeComment`. La purge `deleteMany({ emoji: { not: emoji } })`
ne supprime **que** les autres emojis du même user sur le même commentaire — elle est un no-op
quand seul l'emoji demandé existe (cas ❤️/❤️ du fallback socket), donc l'idempotence de secours
est strictement préservée. Aucun changement de signature, de schéma, d'API publique ni d'état
persistant au-delà de la borne d'invariant.

### Proposed improvements
Dans `likeComment`, avant l'`upsert`, purger les autres réactions du user sur ce commentaire
puis upsert l'emoji demandé (sémantique « remplace », alignée sur `ReactionService`) :

```ts
await this.prisma.commentReaction.deleteMany({
  where: { commentId, userId, emoji: { not: emoji } },
});
await this.prisma.commentReaction.upsert({ /* … inchangé … */ });
```

`syncCommentLikeCounters` recompute ensuite `likeCount`/`reactionCount`/`reactionSummary`
depuis la table (déjà auto-réparant) → compteurs cohérents post-purge.

### Expected benefits
- Invariant « max 1 réaction/user » désormais garanti sur **les deux** chemins (REST + socket).
- Convergence sur le modèle canonique de réaction (remplace) → style cohérent app-wide.
- Idempotence de fallback préservée (❤️/❤️ inchangé), pas de double-comptage.

### Implementation complexity
Triviale — ~6 lignes de prod (1 `deleteMany` + commentaire), 3 tests ajoutés.

### Validation criteria
- RED d'abord : `likeComment(c, u, '👍')` doit appeler
  `deleteMany({ where: { commentId, userId, emoji: { not: '👍' } } })` (échoue avant : jamais appelé).
- Idempotence : `likeComment(c, u, '❤️')` → `deleteMany({ not: '❤️' })` (no-op) + `upsert.update = {}`.
- Comment absent → `null`, aucun `upsert`.
- Non-régression : suites `PostCommentService.test.ts`, `comments-like-delete.test.ts`,
  `comments.test.ts` vertes (106 tests).

### Tests — absence de couverture confirmée
`PostCommentService.test.ts` ne couvrait **aucun** appel `likeComment` (uniquement
`getComments`/`getReplies`/`deleteComment`/`addComment`). Nouveau `describe('likeComment')`
avec 3 tests : purge multi-emoji (RED avant fix), idempotence same-emoji, comment absent.

---

## Suivis (backlog, non traités ce cycle)
- **web** — réaction cross-session : mauvaise identité comparée (Participant ID vs User ID),
  `apps/web/hooks/queries/use-reactions-query.ts:411,444`. Correctif propre = enrichir
  `ReactionUpdateEventData` du `userId` du réacteur (type partagé + `createUpdateEvent` gateway
  + consommateur web). Cross-couche, non validable en runtime web ici — reporté.
- **gateway/comment** — divergence secondaire pré-existante : le chemin socket **rejette** le
  switch d'emoji (throw) tandis que REST/messages **remplacent**. Non-bloquant (invariant max-1
  respecté des deux côtés), mais harmonisation « remplace partout » serait plus cohérente.
  Consigné pour un futur cycle.
