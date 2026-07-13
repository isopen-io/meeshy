# Plan Iteration 176 — normalisation chaîne-vide de `resolveParticipantAvatar`

## Objectifs
Faire de la source unique `resolveParticipantAvatar` un résolveur robuste aux
chaînes vides/blanches : un avatar local `''` doit retomber sur l'avatar du
compte, deux valeurs blanches doivent renvoyer `null` (jamais `<img src="">`).

## Modules affectés
- `packages/shared/utils/participant-helpers.ts` (implémentation)
- `packages/shared/__tests__/utils/participant-helpers.test.ts` (tests)
- Consommateurs gateway (10 sites) : **inchangés** (type de retour identique).

## Phases
1. RED — 2 tests couvrant `''`/blanc local + double blanc → null. ✅
2. GREEN — type guard `isNonBlankAvatar` + `.find()` sur `[local, compte]`. ✅
3. REFACTOR — aucun (composition minimale déjà atteinte). ✅
4. Validation — suite shared complète + build. ✅

## Dépendances
Aucune. Changement confiné à `packages/shared`.

## Risques estimés
Très faibles : signature/type de retour inchangés, comportement strictement
amélioré. Aucun consommateur à adapter.

## Stratégie de rollback
Revert du commit unique (2 fichiers). Aucune migration, aucun état.

## Critères de validation
- 8/8 sur la suite dédiée, 46 suites / 1356 tests verts sur `packages/shared`.
- `bun run build` exit 0.

## Statut
**Terminé** — implémenté, testé (46/46 suites), buildé. Prêt à merger.

## Progress tracking
- [x] RED (2 tests) — vérifié rouge sur l'origine
- [x] GREEN (type guard + find)
- [x] Suite shared complète verte
- [x] Build shared exit 0
- [x] Analyse + plan documentés

## Améliorations futures
- Aucun point chaîne-vide résiduel connu sur la résolution d'identité.
