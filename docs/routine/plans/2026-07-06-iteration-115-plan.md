# Iteration 115 — Plan d'implémentation (2026-07-06)

## Objectifs
Aligner la reconstruction de la carte `reactionSummary` des **posts** et **commentaires** sur le patron
`groupBy` autoritaire déjà utilisé par les réactions de **message** (`ReactionService`) :
1. `PostReactionService.updatePostReactionSummary(postId)` → `$transaction` + `groupBy` (carte + total
   autoritaires) ; `likeCount` conservé synchronisé sur le total.
2. `CommentReactionService.updateCommentReactionSummary(commentId)` → idem.
3. Simplifier la signature privée (drop des paramètres `emoji`/`action`/`count`) et les 4 sites d'appel.

## Modules affectés
- `services/gateway/src/services/PostReactionService.ts` (méthode `updatePostReactionSummary` + 2 appelants).
- `services/gateway/src/services/CommentReactionService.ts` (méthode `updateCommentReactionSummary` + 2 appelants).
- Tests : `PostReactionService.test.ts`, `CommentReactionService.test.ts` (mocks tx enrichis de `groupBy`,
  nouveaux tests d'autorité de la carte).
- Aucun changement de schéma, de route, de forme de réponse ni de signature **publique**.

## Phases d'implémentation
1. **RED** — tests : `updateXReactionSummary` appelle `groupBy` ; la carte écrite provient du `groupBy`
   (multi-emoji), `reactionCount`/`likeCount == somme(groupBy)`, indépendamment de la valeur préalable de
   `reactionSummary`.
2. **GREEN source** — réécrire les 2 méthodes sur `groupBy`, adapter les 4 sites d'appel.
3. **Refactor** — vérifier le miroir exact avec `ReactionService.updateMessageReactionSummary`
   (commentaires FR alignés, `select: { id: true }`).
4. **Validation** — bun install (parité CI), Prisma generate + build shared, jest gateway sur les 2 suites
   + suites réactions voisines, typecheck, puis suite complète si le temps le permet.
5. **Commit + push + PR (ne pas merger sans CI verte)**.

## Dépendances
- `bun install` (node_modules absent au démarrage — lancé).
- `npx prisma generate --generator client` + `bun run build` dans `packages/shared` (parité CI gateway).

## Risques estimés
Faibles. Alignement sur un patron déjà en production et testé (message ReactionService,
`PostCommentService.syncCommentLikeCounters`). Le `groupBy` remplace `findUnique + count` → une requête de
moins par mutation. `reactionCount`/`likeCount` restent le total autoritaire (somme du groupBy == count()
précédent).

## Stratégie de rollback
Restaurer les 2 méthodes à leur forme delta + `count()` précédente et les 4 sites d'appel (diff localisé à
2 fichiers source).

## Critères de validation
- [x] RED prouvé (contre le code d'origine via `git stash` : 4 tests `writesReactionSummaryFromGroupBy`
      échouent — `reactionCount: 1` du `count()` mock au lieu de `2` du `groupBy`).
- [x] GREEN source (2 méthodes + 4 appelants).
- [x] jest `PostReactionService.test.ts` + `CommentReactionService.test.ts` verts (**142/142**).
- [x] suites réactions voisines vertes (**7 suites / 352 tests** : PostReactionHandler,
      AttachmentReactionHandler, reactions-routes, SocialEventsHandler, ReactionService, PostFeedService,
      PostService).
- [x] typecheck gateway `tsc --noEmit` sans erreur.
- [ ] CI verte après push.

## Statut de complétion
- Source : **fait**. Tests : **fait**. Validation locale : **fait** (jest + tsc verts). CI : **en attente**.

## Progress tracking
- [x] Analyse écrite (`docs/routine/analyses/2026-07-06-iteration-115-analyse.md`).
- [x] Plan écrit (ce fichier).
- [x] Fix source + tests.
- [x] Validation locale (jest + tsc verts).
- [ ] Push + CI verte + merge main + suppression branche.

## Améliorations futures
- **#1560** — signaler la régression `reactionSummary` (delta au lieu du `groupBy` déjà sur `main`).
- **F84b** — `locationCount` incrémental (nécessite `messageType` au handler) — inchangé.
- Helper partagé de recompte autoritaire pour les 3 services de réaction (dé-duplication) — cycle dédié.
</content>
