# Iteration 112 — Plan d'implémentation (2026-07-06)

## Objectives
Corriger F83 : rendre la ventilation par statut de `AffiliateTrackingService.getAffiliateStats`
cohérente avec `totalReferrals` en appliquant les mêmes filtres (`tokenId` / `status` / dates)
à la requête `groupBy` qu'à la requête `findMany`.

## Affected modules
- `services/gateway/src/services/AffiliateTrackingService.ts` (source, 1 ligne + commentaire).
- `services/gateway/src/__tests__/unit/services/AffiliateTrackingService.test.ts` (2 tests neufs).
- `docs/routine/analyses/2026-07-06-iteration-112-analyse.md`, ce plan.

## Implementation phases
1. **RED** — test comportemental : double prisma filtre-conscient, `?status=completed`, assert
   `completed+pending+expired == totalReferrals`. Échoue sur le code actuel (6 ≠ 3).
2. **GREEN** — `groupBy.where` = `whereClause`.
3. **Contrat** — test asservissant `groupBy.where.affiliateTokenId` au filtre `tokenId`.
4. **Validation** — suite `AffiliateTrackingService.test.ts`, puis suite gateway, puis CI.

## Dependencies
`bun install` + `prisma generate` (parité CI locale). Test unitaire mocké → n'exige pas MongoDB.

## Estimated risks
Très faibles : `whereClause` inclut déjà `affiliateUserId`, comportement sans-filtre inchangé.

## Rollback strategy
Revert du commit (changement isolé, sans migration ni schéma).

## Validation criteria
- Tests neufs verts, existants préservés.
- CI gateway verte.

## Completion status
- [x] Fix source appliqué.
- [x] Tests neufs écrits.
- [ ] Suite locale verte (install en cours).
- [ ] Push + PR.

## Progress tracking
Voir section « Validation criteria » de l'analyse 112.

## Future improvements
F83b (tokens non filtrés — volontaire), F82b (PR #1528), reports antérieurs.
</content>
