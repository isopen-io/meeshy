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
# Plan — Iteration 206 : `SecuritySanitizer.sanitizeEmail` converge sur le SSOT `@meeshy/shared/utils/email-validator`

## Objectives
Éliminer la 4ᵉ règle de validation d'email divergente du repo (regex inline plus
faible dans la gateway) en déléguant à `validateAndNormalizeEmail`, sans changer
le comportement sur les emails valides, en resserrant le rejet des formes
malformées (points consécutifs/en tête/en fin, domaines tiret-bordés).

## Affected modules
- `services/gateway/src/utils/sanitize.ts` (import SSOT + délégation)
- `services/gateway/src/__tests__/unit/utils/sanitize.test.ts` (+6 régressions)

## Implementation phases
1. **RED** — 6 tests de régression sur `sanitizeEmail` (points consécutifs,
   point en tête/fin du local, domaine tiret-préfixé/suffixé, points consécutifs
   domaine) → échouent contre la regex inline. ✅
2. **GREEN** — remplacer la regex par `validateAndNormalizeEmail(input)` après le
   garde `!input`. ✅
3. **REFACTOR/converge** — import `@meeshy/shared/utils/email-validator` (subpath
   déjà prouvé côté web), commentaire SSOT. ✅
4. **Validate** — 18 tests existants + 6 nouveaux verts ; suite complète verte ;
   `tsc` gateway 0 erreur sur les fichiers touchés. ✅

## Dependencies
`packages/shared/dist` construit (`bun run build`) pour le `tsc` gateway. Jest
mappe la source → tourne sans dist.

## Estimated risks
Faible. Méthode pure, aucun appelant production actuel. Comportement inchangé sur
les emails valides (24 cas verts). Pas de cycle d'import (`email-validator` est un
module feuille).

## Rollback strategy
Révert du commit unique — `sanitizeEmail` revient à la regex inline.

## Validation criteria
- `sanitize.test.ts` : 201/201 (dont 24 `sanitizeEmail`).
- `tsc --noEmit` gateway : 0 erreur sur `sanitize.ts` / `email-validator`.
- `packages/shared/dist/utils/email-validator.d.ts` présent.

## Completion status
**Terminé** — implémenté + validé localement. 201/201 sur la suite affectée.

## Progress tracking
- [x] RED : 6 tests de régression
- [x] GREEN : délégation SSOT
- [x] Convergence + commentaire
- [x] Validation locale (jest + tsc + build shared)
- [x] Docs analyse + plan
- [ ] Commit + push + PR

## Future improvements
Voir `docs/routine/analyses/2026-07-26-iteration-206-analyse.md` §Future :
convergence des 3 regex d'email des composants web d'auth (candidat #2),
dédup `escapeHtml` (candidat #3), initiales avatar (candidat #4),
`sanitizeFileName` surrogate-safe (candidat #5).
