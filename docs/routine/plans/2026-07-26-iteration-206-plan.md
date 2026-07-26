# Plan — Iteration 206 : convergence pagination (clamp `limit=0 → 1` + borne haute des routes)

## Objectives
Propager le correctif `limit=0` du gateway `validatePagination` vers (a) le
miroir partagé `CommonSchemas.pagination`/`messagePagination` et (b) 3 routes
gateway qui hand-roll la pagination sans borne haute. Redonner au miroir partagé
la propriété qu'il revendique (« mirrors the gateway »).

## Affected modules
- `packages/shared/utils/validation.ts` — helpers `clampLimit`/`clampOffset`.
- `packages/shared/__tests__/validation.test.ts` — assertions durcies.
- `services/gateway/src/routes/posts/interactions.ts` — 2 sites → `validatePagination`.
- `services/gateway/src/routes/admin/reports.ts` — 1 site → `validatePagination`.
- `services/gateway/src/__tests__/unit/routes/posts/interactions-extended.test.ts` — 2 tests de clamp.

## Implementation phases
1. **RED** : durcir `validation.test.ts` (`limit=0 → toBe(1)`) → échoue sur la
   valeur buggée 20. Ajouter les tests de clamp gateway.
2. **GREEN (shared)** : extraire `clampLimit`/`clampOffset` (`Number.isNaN`
   guard), câbler les deux schémas, réécrire le commentaire.
3. **GREEN (gateway)** : importer + appliquer `validatePagination` aux 3 sites,
   défauts préservés (50 / 50 / 10), `maxLimit: 100`.
4. **VALIDATE** : build shared, vitest shared, jest gateway (suites concernées),
   `tsc --noEmit`.

## Dependencies
- `packages/shared/dist` reconstruit (mapping jest gateway).
- Prisma client généré.

## Estimated risks
Faible. Miroir partagé sans consommateur prod (change API + test, pas de live).
Routes : seuls plancher/borne changent, chemins nominaux inchangés (tests verts).

## Rollback strategy
Revert du commit unique — changements isolés, aucun schéma DB ni contrat public
modifié.

## Validation criteria
- vitest shared 39/39 ; jest gateway 198/198 sur le périmètre (48 + 150).
- `tsc --noEmit` gateway 0 erreur.

## Completion status
- [x] Phase 1 — tests RED
- [x] Phase 2 — shared helpers
- [x] Phase 3 — routes gateway
- [x] Phase 4 — validation locale
- [ ] Merge dans `main`

## Progress tracking
Implémenté et validé localement le 2026-07-26. En attente de push + CI.

## Future improvements
Voir la section « Future improvements » de l'analyse 206 : `.min(1)` manquant
dans `admin-schemas.ts:94` + fallback inline redondant (languages/analytics) ;
convergence `getSenderUserId`.
