# Iteration 123 — Plan d'implémentation (2026-07-07)

## Objectives
Corriger **F87** : `SecuritySanitizer.sanitizeMongoQuery` doit bloquer les vecteurs de prototype
pollution (`__proto__`, `constructor`, `prototype`) en plus des opérateurs Mongo (`$…`), à parité avec
son jumeau `sanitizeJSON`.

## Affected modules
- `services/gateway/src/utils/sanitize.ts` — garde de clé étendu dans `sanitizeMongoQuery`.
- `services/gateway/src/__tests__/unit/utils/sanitize.test.ts` — 4 tests de non-régression sécurité.

## Implementation phases
1. **RED/analyse** — reproduction runtime : `{ "__proto__": { "isAdmin": true } }` fait fuiter
   `sanitized.isAdmin === true` et altère le prototype de l'objet retourné. ✅
2. **GREEN** — aligner le garde sur `sanitizeJSON` :
   `key.startsWith('__') || key.startsWith('$') || key === 'constructor' || key === 'prototype'`. ✅
3. **Tests** — ajouter 4 cas (fuite `__proto__`, `constructor`/`prototype` strippés, `__proto__`
   imbriqué, non-pollution globale). ✅
4. **Docs** — analyse + plan (ce fichier). ✅

## Dependencies
Aucune. Changement localisé à une méthode statique pure.

## Estimated risks
Très faibles. Additif (retrait de clés sans sémantique métier). Aucun call-site de production actuel.

## Rollback strategy
Revert du commit unique — la méthode revient au garde `$…` seul.

## Validation criteria
- [x] Suite `sanitize.test.ts` : 195/195.
- [x] 12 cas Mongo existants inchangés (non-régression).
- [x] `tsc --noEmit` gateway propre sur `sanitize.ts`.

## Completion status
**COMPLETE** — implémenté, testé (195/195), typecheck propre. Prêt pour commit + push + PR.

## Progress tracking
- [x] Phase 1 (repro/analyse)
- [x] Phase 2 (fix)
- [x] Phase 3 (tests)
- [x] Phase 4 (docs)
- [ ] Commit + push + PR

## Future improvements
- **F88** : clamp défensif de `truncateFilename` pour `maxLength < 4`.
- **F89** : extraire `isDangerousKey(key)` partagé par `sanitizeJSON` + `sanitizeMongoQuery` (refactor
  DRY, comportement inchangé) pour empêcher toute future divergence.
