# Iteration 238 — Plan : `resolveRiverLaneAt` exclut l'avis système en mode sérialisé

## Objectifs
- Réaligner `resolveRiverLaneAt` (branche sérialisée) sur `serializedOccupancies` : un avis système
  n'occupe la colonne de personne ⇒ `null` à son rang.
- Couvrir le chemin sérialisé × avis système, jamais testé jusqu'ici.

## Modules affectés
- `packages/shared/utils/river-lanes.ts` — fonction `resolveRiverLaneAt` (1 ligne + doc).
- `packages/shared/__tests__/river-lanes.test.ts` — 1 test dans le describe `resolveRiverLaneAt`.

## Phases d'implémentation
1. **RED** : test sérialisé `[notice('j','lena',0), message('a','lena',1), message('b','mia',2)]`,
   attendre `resolveRiverLaneAt(geometry, 0, 0) === null`, rang 1 → `lena`, rang 2 → `mia`. ✅ échoue
   (retournait la colonne de `lena` au rang 0).
2. **GREEN** : `laneIndex === 0 && bubble !== undefined && !bubble.isSystem`. ✅ 115/115.
3. **REFACTOR** : doc de `resolveRiverLaneAt` consignant l'exception (renvoi à `serializedOccupancies`).

## Dépendances
- Aucune. Fonction pure, aucun consommateur (`grep` : zéro appelant hors tests, aucun miroir SDK/Android).

## Risques estimés
- Minime : un seul chemin (branche sérialisée, `laneIndex === 0`, rang d'un avis) modifié.

## Stratégie de rollback
- `git revert` du commit : 1 fichier de code + 1 fichier de test, aucun état persistant, aucune migration.

## Critères de validation
- [x] `bun run build` (tsc) vert dans `packages/shared`.
- [x] `bunx vitest run river-lanes` : 115/115.
- [x] Suite partagée complète : 2352/2352.
- [x] Aucun consommateur/miroir impacté (`grep`).

## Statut de complétion
**COMPLÉTÉ** — code + doc + test posés, tous les gates verts.

## Suivi de progression
- Analyse : `docs/routine/analyses/2026-08-21-iteration-238-analyse.md`.
- Commit sur `claude/brave-archimedes-3g4ujt`.

## Améliorations futures
- Audit système de `resolveRiverStep` / `resolveRiverLivingLanes` (probablement déjà corrects).
- Runners-up utils : garde NaN `classifyRelativeTime`, `focusCurve` totalité, `classify` `''`.
- Test d'intégration bout-en-bout quand une peau câblera l'en-tête défilant sur `resolveRiverLaneAt`.
