# Iteration 169 — Plan d'implémentation (2026-07-11)

## Objectifs
Éliminer le `reactionSummary` résiduel `{ [emoji]: 0 }` produit par les mutations optimistes de
retrait de réaction (commentaire + post), et aligner l'optimiste sur le chemin socket autoritatif
via une source unique.

## Modules affectés
- `apps/web/lib/reaction-summary.ts` (NOUVEAU — helper pur `decrementReactionSummary`)
- `apps/web/hooks/queries/use-comment-mutations.ts` (`useUnlikeCommentMutation.onMutate`)
- `apps/web/hooks/queries/use-post-mutations.ts` (`useUnlikePostMutation.onMutate`)
- Tests : `apps/web/__tests__/lib/reaction-summary.test.ts` (NOUVEAU),
  `apps/web/__tests__/hooks/queries/use-comment-mutations.test.tsx`,
  `apps/web/__tests__/hooks/queries/use-post-mutations.test.tsx`

## Phases
1. **RED** — helper unit tests (delete-at-zero, keep>0, absent emoji, null/undefined,
   immutabilité) + tests de régression « residual-zero » sur les deux mutations. Vérifié : 7
   tests échouent contre l'ancienne logique `?? 1`.
2. **GREEN** — helper pur `decrementReactionSummary` + substitution dans les deux `onMutate`.
3. **REFACTOR** — la substitution supprime la duplication inline (source unique).

## Dépendances
Aucune. Prérequis parité tests locale (CLAUDE.md) : `prisma generate` + `packages/shared` build
(effectués).

## Risques estimés
Faible. Chemins isolés `onMutate`, contrats de mutation/rollback inchangés. Test existant
`use-post-mutations.test.tsx:990` (compte > 0) préservé.

## Stratégie de rollback
Revert du commit (helper + 2 substitutions + tests). Aucune migration, aucun changement de schéma
ou d'API.

## Critères de validation
- `reaction-summary.test.ts` + `use-comment-mutations.test.tsx` + `use-post-mutations.test.tsx`
  → 61/61 verts (fait).
- `tsc --noEmit` propre sur les fichiers touchés (fait).

## Statut de complétion
✅ Complété. RED confirmé (7 échecs pré-fix), GREEN (61/61), typecheck propre.

## Suivi / améliorations futures
- Reels comment overlay re-like infini (`ReelsFeedScreen.tsx:251`) — reporté, plus impactant,
  multi-composants.
