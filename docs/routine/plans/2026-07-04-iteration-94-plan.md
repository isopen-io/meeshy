# Iteration 94 — Plan d'implémentation (2026-07-04)

## Objectives
Corriger **F55** : la désync du cache reels web sur `post:updated` / `post:deleted`. Éditer un reel
doit rafraîchir sa caption/média sur les threads d'affinité reels ; supprimer un reel doit le
retirer de ces threads et purger le cache détail.

## Affected modules
- `apps/web/hooks/queries/use-post-socket-cache-sync.ts` (source — 2 handlers + 1 helper neuf).
- `apps/web/__tests__/hooks/queries/use-post-socket-cache-sync.test.tsx` (3 tests neufs + 2
  helpers de test `seedReels`/`getReels`).

## Implementation phases
1. **RED** — tests neufs : édition propagée aux threads reels `foryou`+seed ; suppression retire de
   tous les threads reels (frères préservés) ; suppression purge le cache `detail`. → 3 échecs.
2. **GREEN** —
   - `handlePostUpdated` : `patchReelCaches(qc, data.post.id, () => data.post)`.
   - `removePostFromReelCaches` (helper neuf, miroir de `patchReelCaches`).
   - `handlePostDeleted` : `removePostFromReelCaches` + `removeQueries({ queryKey: detail(postId) })`.
3. **REFACTOR** — helper factorisé, commentaires d'intention alignés sur le style existant du fichier.

## Dependencies
- `packages/shared` build (`dist/`) + prisma client généré — prérequis jest web (fait au démarrage).

## Estimated risks
FAIBLE. Helpers reels no-op sans cache reels ; `removeQueries` idempotent ; handlers feed inchangés.
Aucun changement gateway/iOS/shared.

## Rollback strategy
Révert du commit unique — changement isolé à un fichier source + son test.

## Validation criteria
- [x] 3 tests neufs RED sans fix, GREEN après.
- [x] Suite `use-post-socket-cache-sync` : 83/83.
- [x] `__tests__/hooks/queries/` : 382/382 (15 suites).
- [x] `tsc --noEmit` : 0 nouvelle erreur sur les fichiers touchés.

## Completion status
**DONE** — implémenté, testé (83/83 + 382/382 régression), typecheck propre sur le périmètre.

## Progress tracking
- it.91→93 : F55 parké (changement multi-couches jugé « itération web dédiée »).
- it.94 : F55 résolu (this).

## Future improvements
Voir backlog reporté dans l'analyse it.94 : F51b, F56b, F57, F58, F59.
