# Iteration 114 — Plan d'implémentation (2026-07-06)

## Objectifs
Homogénéiser le service des **réactions de message** (`ReactionService`) sur le contrat de cohérence
déjà appliqué à `PostReactionService` / `CommentReactionService` :
1. `updateMessageReactionSummary` → `$transaction` + `reactionCount` autoritaire re-dérivé via
   `tx.reaction.count(...)`.
2. `addReaction` → `try/catch` **P2002** idempotent.

## Modules affectés
- `services/gateway/src/services/ReactionService.ts` (méthodes `addReaction` + `updateMessageReactionSummary`).
- Tests : `services/gateway/src/__tests__/unit/services/ReactionService.test.ts` (mock `$transaction`
  + `reaction.count`, nouveaux tests transaction/autorité/P2002).
- Aucun changement de schéma, de route, de forme de réponse ni de signature publique.

## Phases d'implémentation
1. **RED** — tests : `$transaction` appelé par add/remove ; `reactionCount` écrit == valeur de
   `reaction.count()` (autoritaire, ≠ incrément) ; `addReaction` renvoie l'existant sans lever sur P2002.
2. **GREEN source** — envelopper `updateMessageReactionSummary` dans `$transaction`, recomputer
   `reactionCount` via `tx.reaction.count`; ajouter le `try/catch` P2002 idempotent dans `addReaction`.
3. **Refactor** — vérifier le miroir exact avec `PostReactionService` (commentaires FR alignés).
4. **Validation** — bun install (parité CI), Prisma generate + build shared, jest gateway sur
   `ReactionService.test.ts` + suites réactions voisines, puis suite complète.
5. **Commit + push**.

## Dépendances
- `bun install` (node_modules absent au démarrage).
- `npx prisma generate --generator client` + `bun run build` dans `packages/shared` (parité CI gateway).

## Risques estimés
Faibles. Alignement sur un patron déjà en production et testé (post/commentaire). Surcoût d'un `count()`
par mutation, négligeable (`@@index([messageId])` présent), déjà accepté ailleurs.

## Stratégie de rollback
Restaurer les deux méthodes à leur forme incrémentale précédente (diff localisé à un seul fichier source).

## Critères de validation
- [x] RED prouvé (3 assertions transaction/autorité échouent sur le code d'origine après `git stash`).
- [x] GREEN source (2 méthodes).
- [x] jest `ReactionService.test.ts` vert (229/229 sur les 5 suites appariées).
- [x] suites réactions voisines vertes (17 suites / 465 tests `reaction|Reaction`).
- [x] typecheck gateway `tsc --noEmit` sans erreur.
- [ ] CI verte après push.

## Statut de complétion
- Source : **fait**. Tests : **fait**. Validation locale : **fait** (jest + tsc verts). CI : **en attente**.

## Progress tracking
- [x] Analyse écrite (`docs/routine/analyses/2026-07-06-iteration-114-analyse.md`).
- [x] Plan écrit (ce fichier).
- [x] Fix source + tests.
- [x] Validation locale (jest + tsc verts).
- [ ] Push + CI verte + merge main + suppression branche.

## Améliorations futures
- **F84b** — `locationCount` incrémental (nécessite `messageType` au handler) — inchangé.
- Envisager un helper partagé de recompte autoritaire pour les 3 services de réaction (dé-duplication),
  cycle dédié — la structure diffère (participantId vs userId, likeCount présent/absent).
</content>
