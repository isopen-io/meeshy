# Iteration 131 — Plan d'implémentation (2026-07-08)

## Objectives
Éliminer le flake CI horaire F94 : rendre déterministes les trois tests `shouldCreateNotification — DND
active` de `NotificationService.uncovered-paths.test.ts` en figeant l'horloge, en miroir du pattern déjà
présent dans le fichier. Zéro changement de production.

## Affected modules
- `services/gateway/src/__tests__/unit/services/NotificationService.uncovered-paths.test.ts` — 3 tests.

## Implementation phases
1. **RED (preuve)** — figer temporairement l'horloge à `23:59` UTC dans les deux tests `'23:59'`-window
   pour reproduire l'échec (borne exclusive), confirmant le diagnostic.
2. **GREEN** — envelopper les trois tests de
   `jest.useFakeTimers().setSystemTime(new Date('2024-01-15T12:00:00Z'))` → `jest.useRealTimers()`.
   Pour les tests jour-dépendants, calculer `today`/`otherDay` après avoir figé l'horloge.
3. **REFACTOR** — aucun.

## Dependencies
Aucune. Pattern `jest.useFakeTimers` déjà utilisé dans le même fichier.

## Estimated risks
Nul côté production (aucun code de service modifié). Attention : `shouldCreateNotification` est async avec
prisma mocké (promesses résolues) — les fake timers modernes n'empêchent pas la résolution des
microtâches ; restaurer `useRealTimers()` après chaque test.

## Rollback strategy
Revert du commit (1 fichier de test).

## Validation criteria
- [x] RED prouvé : `isDNDActive` à 23:59 UTC (fenêtre `00:00`–`23:59`) renvoie `false` (borne exclusive) ;
      à 12:00 renvoie `true`. Les 3 tests figent désormais l'horloge à 12:00 → déterministes.
- [x] Suite `NotificationService.uncovered-paths.test.ts` intégralement verte (52/52).
- [x] Zéro changement de comportement de `NotificationService` (aucun code de production touché).

## Completion status
**COMPLET** — F94 fermé.

## Progress tracking
- [x] Analyse rédigée (`analyses/2026-07-08-iteration-131-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Implémentation + tests (52/52 verts).
- [ ] Commit + push + PR.

## Future improvements
- **F90** (backlog, architecturalement significatif) : message-search — recall des matches de traduction
  plafonné à `take: 200` par fenêtre curseur ; correction propre = recherche JSON côté DB ou keyset dédié.
  Nécessite une décision produit.
