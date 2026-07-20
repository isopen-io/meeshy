# Iteration 123 (sanitizer) — Plan d'implémentation (2026-07-07)

> Collision de numérotation avec une session parallèle (piste calls) : suffixe `-sanitizer` pour
> préserver les deux historiques. Cette piste = PR #1605 (mergée `main` @ `4b09b553`).

## Objectifs
Unifier les deux sanitizers structurels du gateway (`sanitizeJSON`, `sanitizeMongoQuery`) sur un garde
de clés dangereuses unique (SSOT), fermant le vecteur de prototype-pollution latent de
`sanitizeMongoQuery` (F87).

## Modules affectés
- `services/gateway/src/utils/sanitize.ts` (production)
- `services/gateway/src/__tests__/unit/utils/sanitize.test.ts` (tests)

## Phases d'implémentation
1. **RED** — Ajouter 4 tests `sanitizeMongoQuery` (prototype pollution via `JSON.parse` : `__proto__`,
   `constructor`, `prototype`, `__proto__` imbriqué). Confirmer l'échec (4/4). ✅
2. **GREEN** — Extraire `SecuritySanitizer.isDangerousKey(key)` (privé statique, garde verbatim de
   `sanitizeJSON`) ; l'appliquer dans `sanitizeJSON` **et** `sanitizeMongoQuery`. ✅
3. **REFACTOR** — Documenter le SSOT + le vecteur `JSON.parse`/`__proto__` en docstring. ✅
4. **VALIDATE** — Suite `sanitize` complète (195/195), test admin sanitization (20/20), `tsc --noEmit`. ✅

## Dépendances
`packages/shared` : `prisma generate --generator client` + `bun run build` (prérequis CI-parity).

## Risques estimés
Très faible. Garde renforcé = sur-ensemble strict de l'ancien. `sanitizeJSON` inchangé
fonctionnellement. Aucun call site runtime de `sanitizeMongoQuery` (fix préventif).

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant.

## Critères de validation
- [x] 195/195 `sanitize.test.ts` (4 nouveaux, RED→GREEN prouvé)
- [x] 20/20 admin user-sanitization
- [x] `tsc --noEmit` gateway sans erreur `sanitize`
- [x] PR #1605 mergée en `main` (CI verte)

## Statut de complétion
**COMPLET & MERGÉ** (PR #1605, `main` @ `4b09b553`).

## Progress tracking
- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 REFACTOR/docs
- [x] Phase 4 VALIDATE
- [x] Merge sur main

## Future improvements
- F88 (MINOR) : clamp défensif `truncateFilename` pour `maxLength < 4`.
