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
