# Plan d'implémentation — Iteration 181

## Objectifs
Corriger la sous-évaluation de `metrics.cacheSize` dans
`StatusService.resetMetrics()` (omission de `onlineEnsureCache`) et supprimer la
racine du bug : factoriser le calcul dupliqué en une source unique.

## Modules affectés
- `services/gateway/src/services/StatusService.ts` (correctif + refactor)
- `services/gateway/src/__tests__/unit/services/StatusService.test.ts` (test RED)

## Phases
1. **RED** — Ajouter un test dans le bloc `resetMetrics` : peupler les 3 caches,
   `resetMetrics()`, attendre `cacheSize === 3`. Vérifier l'échec sur le code
   d'origine.
2. **GREEN + REFACTOR** — Extraire `private computeCacheSize()` ; router les 7
   sites (6 assignations + `resetMetrics`) vers ce helper.
3. **Validation** — Rejouer `StatusService` + `maintenance-routes`.

## Dépendances
- Parité CI locale : `bun install` (gateway), `prisma generate --generator client`,
  `bun run build` (@meeshy/shared). Réalisées avant exécution des tests.

## Risques estimés
Très faible — refactor interne, aucune API publique modifiée, comportement des 6
sites déjà corrects inchangé.

## Stratégie de rollback
`git revert` du commit unique. Aucun changement de schéma / contrat.

## Critères de validation
- `unit/services/StatusService.test.ts` 55/55, `unit/routes/maintenance-routes.test.ts` 13/13 (68/68).
- RED reproduit (`Expected 3, Received 2`) puis GREEN.

## Statut de complétion
- [x] Phase 1 (RED prouvé)
- [x] Phase 2 (GREEN + refactor)
- [x] Phase 3 (validation 68/68)

## Progress tracking
Terminé dans l'itération 181.

## Améliorations futures
Voir le backlog de l'analyse 181 (sender display-name SSOT large, socket manager
présence key, F69).
