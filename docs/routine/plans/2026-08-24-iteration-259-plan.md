# Plan — Itération 259 : SSOT du prédicat ObjectId dans le package shared

## Objectifs
Unifier les 4 copies du prédicat « chaîne = ObjectId MongoDB » du package
`shared` derrière une brique feuille unique `utils/object-id.ts`, en supprimant
au passage la divergence de forme entre les deux regex Zod.

## Modules affectés
- `packages/shared/utils/object-id.ts` (**neuf**) — `OBJECT_ID_REGEX`, `isValidObjectId`.
- `packages/shared/utils/conversation-helpers.ts` — `isValidMongoId` → brique.
- `packages/shared/types/migration-utils.ts` — `isValidObjectId` → brique.
- `packages/shared/utils/validation.ts` — `CommonSchemas.mongoId` → brique.
- `packages/shared/types/validation.ts` — `mongoIdSchema` → brique (retire `/i`).
- `packages/shared/__tests__/utils/object-id.test.ts` (**neuf**).

## Phases
1. RED — test du module + témoin d'accord des 5 prédicats. ✅
2. GREEN — `object-id.ts`. ✅
3. Rebranchement des 4 consommateurs. ✅
4. Validation (build, suite shared, tsc, gateway consommateurs). ✅

## Dépendances
Aucune. Module feuille sans import.

## Risques estimés
Négligeable — comportement inchangé, prouvé par témoin d'accord. Exports et
signatures publiques préservés.

## Stratégie de rollback
Supprimer `object-id.ts` + son test, réinliner les 4 regex.

## Critères de validation
- Suite shared complète verte (2560).
- Gateway consommateurs verts (223).
- `tsc --noEmit` shared exit 0.
- CI verte sur la PR.

## Statut de complétion
**Complété** (local). En attente de CI verte sur la PR.

## Suivi / améliorations futures
- Convergence gateway → shared APRÈS merge de #3424 (évite le conflit).
- Dépréciation éventuelle de `migration-utils.isValidObjectId` (sans consommateur externe).
