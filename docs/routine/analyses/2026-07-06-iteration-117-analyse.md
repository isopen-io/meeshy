# Iteration 117 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `beaa28f0` (« chore(release): version packages [skip ci] »), working tree propre. Branche de
travail `claude/brave-archimedes-2nvv6v` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver. `git config user.email/name` positionné (`noreply@anthropic.com` / `Claude`).

**18 PR ouvertes au démarrage.** La cible retenue est **strictement disjointe** des zones touchées :
- **#1560** (`claude/brave-archimedes-t6mxsx`) durcit **uniquement** `ReactionService`
  (réactions de *message*) — patch obsolète d'ailleurs vis-à-vis de `main` (voir ci-dessous).
- **#1559 / #1557** web conversations/anonymous-chat (F84 dans leur numérotation) — disjoint.
- **#1561 / #1558 / #1563** realtime/calls — disjoint.
- iOS/Android/dependabot — disjoint.

Aucune PR ouverte ne touche `PostReactionService.ts` ni `CommentReactionService.ts`.

Cette itération solde **F84c**, explicitement reporté par l'itération 113
(« reactionSummary des posts/commentaires maintenu par delta read-modify-write non atomique alors que le
total reactionCount est recomputé autoritairement ; dérive d'emoji fantôme possible en concurrence »).

## Constat de démarrage — l'inversion de F84c

L'analyse d'origine de F84c (itération 113) supposait que les réactions de message étaient le service
*déjà durci* et proposait de propager son durcissement `groupBy` aux posts/commentaires. **La réalité de
`main` est plus nuancée** — les trois services de réaction sont dans **trois états de cohérence
différents** :

| Service | `reactionCount` (total) | `reactionSummary` (carte emoji→count) |
|---|---|---|
| `ReactionService` (message) | **autoritaire** — `groupBy(...).reduce(sum)` | **autoritaire** — `groupBy(...).reduce()` |
| `PostReactionService` | **autoritaire** — `postReaction.count(...)` | **delta read-modify-write** ❌ |
| `CommentReactionService` | **autoritaire** — `commentReaction.count(...)` | **delta read-modify-write** ❌ |

`ReactionService.updateMessageReactionSummary` (l.338-372) recompte **et** le total **et** la carte
par emoji depuis un `groupBy` sur la table `Reaction` (source de vérité) — pleinement auto-réparant. Les
services post/commentaire recomptent le **total** de façon autoritaire (`count()`), mais maintiennent
encore la carte **par emoji** par delta `currentSummary[emoji] += count` sur une lecture préalable.

> Note : la PR ouverte **#1560** propose de « durcir » `ReactionService` en le ramenant à un delta
> read-modify-write + `count()` — soit **strictement moins** correct que l'état actuel de `main` (qui a
> déjà le `groupBy`). Elle a été écrite contre un `main` plus ancien. La présente itération ne la touche
> pas ; elle aligne au contraire post/commentaire sur le **meilleur** patron (`groupBy`), ce qui rend la
> régression de #1560 encore plus visible si elle est mergée telle quelle (à signaler séparément).

## Cible : F84c — `reactionSummary` des posts/commentaires par delta → dérive d'emoji fantôme

### Current state
`PostReactionService.updatePostReactionSummary(postId, emoji, action, count)`
(`services/gateway/src/services/PostReactionService.ts:312-347`) et son jumeau
`CommentReactionService.updateCommentReactionSummary(commentId, emoji, action, count)`
(`CommentReactionService.ts:371-401`) :

```ts
await this.prisma.$transaction(async (tx) => {
  const post = await tx.post.findUnique({ where: { id: postId }, select: { reactionSummary: true } });
  if (!post) return;
  const currentSummary = (post.reactionSummary as Record<string, number>) || {};
  if (action === 'add') currentSummary[emoji] = (currentSummary[emoji] || 0) + count;
  else if (currentSummary[emoji]) { currentSummary[emoji] -= count; if (currentSummary[emoji] <= 0) delete currentSummary[emoji]; }
  const total = await tx.postReaction.count({ where: { postId } });   // total AUTORITAIRE
  await tx.post.update({ where: { id: postId }, data: { reactionSummary: currentSummary, reactionCount: total, likeCount: total } });
});
```

Le pré-check des réactions (`findMany`/`findFirst` sur les lignes existantes) **et** le `create`/`deleteMany`
se font **hors** de cette transaction ; seule la mise à jour du résumé est transactionnelle. La carte
`reactionSummary` est donc reconstruite par delta sur une lecture qui n'est **pas** synchronisée avec
l'insertion/suppression de ligne.

### Problems identified
- **[LIVE] Dérive d'emoji fantôme dans la carte `reactionSummary`.** Le total `reactionCount`/`likeCount`
  est autoritaire (`count()`), mais la **ventilation par emoji** reste delta. Deux mutations concurrentes
  (ex. deux ajouts d'emojis différents sur le même post) reconstruisent chacune la carte à partir d'une
  lecture qui peut manquer l'effet de l'autre ; en cas de `WriteConflict` MongoDB sur le document `post`,
  la transaction perdante **échoue sans réappliquer son delta** — la ligne `PostReaction` existe mais son
  emoji n'apparaît jamais dans `reactionSummary`. **Aucun chemin auto-réparateur** : le résumé reste
  incohérent en permanence.
- **[LIVE] `sum(reactionSummary) ≠ reactionCount`.** Le total étant recomputé et la carte non, la somme
  des valeurs de la carte peut diverger du total autoritaire — l'UI affiche « ❤️ 2 · 👍 1 » (somme 3)
  sous un badge total « 4 ». Incohérence visible directement.
- **[CONSISTENCY] Trois contrats de cohérence pour une même primitive.** Message = `groupBy` (carte +
  total autoritaires), post/commentaire = `count()` (total autoritaire) + delta (carte). Divergence de
  comportement inter-surfaces pour « réaction emoji dénormalisée ».

### Root cause
Lors de l'unification `likeCount` (post puis commentaire), seul le **compteur total** a été rendu
autoritaire (`count()`) ; la reconstruction de la **carte par emoji** est restée en delta, alors que le
service message a par la suite adopté le patron `groupBy` qui rend **carte ET total** autoritaires en une
seule requête. Le durcissement n'a jamais été propagé jusqu'à la carte.

### Business impact
La ventilation emoji d'un post ou d'un commentaire (fil social — cœur de l'engagement) peut afficher un
emoji manquant ou une somme incohérente avec le total, sans jamais se corriger. Perte de confiance dans un
compteur visible en permanence sur chaque carte de post.

### Technical impact
- `reactionSummary` (JSON emoji→count) peut diverger de l'ensemble réel des lignes `PostReaction` /
  `CommentReaction` de façon **définitive**. Fiabilité des agrégats sociaux sapée.
- Un `groupBy` remplace un `count()` : **même nombre de round-trips** dans la transaction (1 lecture
  d'agrégat au lieu de 1 `findUnique` + 1 `count`) → en réalité **une requête de moins**.

### Risk assessment
Très faible. On aligne exactement sur un patron **déjà en production et testé** (message
`ReactionService.updateMessageReactionSummary`, `PostCommentService.syncCommentLikeCounters` utilise déjà
le même `commentReaction.groupBy`). `reactionCount`/`likeCount` restent le **total autoritaire** (somme
du `groupBy`, strictement égale au `count()` précédent). Aucun changement de signature publique, de forme
de réponse, ni de schéma. La signature **privée** `updateXReactionSummary` est simplifiée
(`(id)` au lieu de `(id, emoji, action, count)`) — les paramètres delta deviennent inutiles.

### Proposed improvements
1. `PostReactionService.updatePostReactionSummary(postId)` → `$transaction` : existence du post
   (`select: { id: true }`), `postReaction.groupBy({ by:['emoji'], where:{postId}, _count:{emoji:true} })`,
   reconstruire `reactionSummary` + `total` depuis le `groupBy`, écrire
   `{ reactionSummary, reactionCount: total, likeCount: total }`. Miroir exact de `ReactionService`
   (+ `likeCount` conservé). Adapter les 2 appelants (drop des args delta).
2. `CommentReactionService.updateCommentReactionSummary(commentId)` → idem sur `commentReaction` /
   `postComment`.

### Expected benefits
- Carte `reactionSummary` **auto-réparante** — recomputée depuis la table à chaque mutation, jamais
  d'emoji fantôme ni de somme incohérente avec le total.
- Les trois services de réaction convergent vers **un seul** contrat de cohérence (`groupBy` autoritaire).
- Code simplifié (suppression de la branche delta + de 3 paramètres par méthode) ; une requête de moins
  par mutation.

### Implementation complexity
Faible (2 méthodes privées + 4 sites d'appel, 2 fichiers ; patron copié d'un service voisin déjà validé).

### Validation criteria
- RED→GREEN : `updateXReactionSummary` appelle `groupBy` ; `reactionSummary` écrit provient du `groupBy`
  (ex. `[{emoji:'👍',_count:{emoji:3}},{emoji:'❤️',_count:{emoji:2}}]` → `{'👍':3,'❤️':2}`,
  `reactionCount === 5`, `likeCount === 5`) et non d'un delta sur la lecture préalable.
- Suites `PostReactionService.test.ts` + `CommentReactionService.test.ts` vertes (existants préservés /
  mocks tx enrichis de `groupBy`).
- Suites voisines réactions vertes ; typecheck gateway vert ; CI verte.

## Améliorations futures (reportées)
- **#1560** — à signaler : sa réécriture de `ReactionService` en delta + `count()` régresse la carte
  `reactionSummary` (perte du `groupBy` déjà présent sur `main`). Ne pas merger tel quel.
- **F84b** — `locationCount` incrémental des stats de conversation (nécessite `messageType` au handler) —
  inchangé.
- Envisager un helper partagé de recompte autoritaire pour les 3 services de réaction (dé-duplication) —
  la structure diffère (participantId vs userId ; `likeCount` présent/absent) → cycle dédié.
</content>
