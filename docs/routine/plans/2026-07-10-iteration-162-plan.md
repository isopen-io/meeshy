# Iteration 162 — Plan d'implémentation (2026-07-10)

## Objectives
Rétablir l'invariant `post.commentCount == #(commentaires non-supprimés)` et éliminer les
réponses orphelines lors de la suppression d'un commentaire porteur de réponses (F122).

## Affected modules
- `services/gateway/src/services/PostCommentService.ts` — `deleteComment` (cascade + décrément correct).
- `services/gateway/src/__tests__/unit/services/PostCommentService.test.ts` — nouvelle suite `deleteComment`.

## Implementation phases
1. **RED** — Ajouter la suite `deleteComment` (null / FORBIDDEN / leaf / cascade 1 niveau /
   cascade profondeur arbitraire / replyCount reply / pas de replyCount top-level). Vérifier
   qu'elle échoue contre l'ancien code. ✅ (4 échecs constatés).
2. **GREEN** — Réécrire `deleteComment` : BFS des descendants non-supprimés via `parentId`,
   `updateMany` soft-delete `[cible, ...descendants]`, `commentCount: { decrement: 1 + N }`,
   `replyCount` du parent direct inchangé. ✅
3. **Validation** — `tsc --noEmit` propre ; 25/25 `PostCommentService` ; 217/217 comment-related. ✅

## Dependencies
Aucune (Prisma `postComment.updateMany` déjà disponible). Prérequis de parité locale exécutés :
`prisma generate` (output `./prisma/client`) + `bun run build` sur `packages/shared`.

## Estimated risks
Faible. Méthode isolée, contrat de retour inchangé, pas de migration. Décrément borné par les
descendants comptés → jamais négatif.

## Rollback strategy
Revert du commit unique ; aucune donnée persistée modifiée par le changement de code lui-même
(seul le comportement runtime de suppression change).

## Validation criteria
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] `PostCommentService` : 25/25.
- [x] Suites comment-related (`PostComment|posts/comments|CommentReaction`) : 217/217.
- [x] RED confirmé avant fix.

## Completion status
**Terminé** — implémenté, testé, typé. Prêt à merger.

## Future improvements
- F123 (web, faible priorité) : DST-safe « hier » dans `formatContentPublishedAt` via
  `calendarDayDiff` (déjà importé) au lieu de `startOfToday - 86400000`.
- Envisager une transaction Prisma (`$transaction`) pour rendre soft-delete + décrément atomiques
  si une charge concurrente élevée sur la suppression apparaît (actuellement non nécessaire :
  chemin idempotent via `withMutationLog`).
