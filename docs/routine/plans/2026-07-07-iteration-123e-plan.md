# Iteration 123 — Plan d'implémentation (2026-07-07)

## Objectifs
Unifier les deux sanitizers structurels du gateway (`sanitizeJSON`, `sanitizeMongoQuery`) sur un garde
de clés dangereuses unique (SSOT), fermant le vecteur de prototype-pollution latent de
`sanitizeMongoQuery` (F87).

## Modules affectés
- `services/gateway/src/utils/sanitize.ts` (production)
- `services/gateway/src/__tests__/unit/utils/sanitize.test.ts` (tests)

## Phases d'implémentation
1. **RED** — Ajouter 4 tests `sanitizeMongoQuery` (prototype pollution via `JSON.parse` :
   `__proto__`, `constructor`, `prototype`, `__proto__` imbriqué). Confirmer l'échec (4/4).
2. **GREEN** — Extraire `SecuritySanitizer.isDangerousKey(key)` (privé statique, garde verbatim de
   `sanitizeJSON`) ; l'appliquer dans `sanitizeJSON` **et** `sanitizeMongoQuery`.
3. **REFACTOR** — Documenter le SSOT + le vecteur `JSON.parse`/`__proto__` en commentaire de docstring.
4. **VALIDATE** — Suite `sanitize` complète (195/195), test admin sanitization (20/20), `tsc --noEmit`.

## Dépendances
`packages/shared` : `prisma generate --generator client` + `bun run build` (prérequis CI-parity pour
la résolution `@meeshy/shared` au typecheck). Aucune autre.

## Risques estimés
Très faible. Garde renforcé = sur-ensemble strict de l'ancien (`$` toujours bloqué). `sanitizeJSON`
inchangé fonctionnellement. Aucun call site runtime de `sanitizeMongoQuery` (fix préventif).

## Stratégie de rollback
Revert du commit unique (helper + 2 conditions + tests). Aucune migration, aucun état persistant.

## Critères de validation
- [x] 195/195 `sanitize.test.ts` (4 nouveaux, RED→GREEN prouvé)
- [x] 20/20 admin user-sanitization
- [x] `tsc --noEmit` gateway sans erreur `sanitize`

## Statut de complétion
**COMPLET** — implémenté, testé, typé, prêt à merger.

## Progress tracking
- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Phase 3 REFACTOR/docs
- [x] Phase 4 VALIDATE

## Future improvements
- F88 (MINOR) : clamp défensif `truncateFilename` pour `maxLength < 4`.
