# Plan — Iteration 205 : SSOT `utils/jwt` (décodage JWT base64url-safe)

## Objectives
Éliminer un bug de correctness (décodage JWT non base64url-safe) répliqué dans 2
implémentations sur 3, en convergeant tout le décodage JWT client sur un SSOT
unique, sans changer le comportement des 2 consommateurs production corrects.

## Affected modules
- `apps/web/utils/jwt.ts` (**nouveau** — SSOT)
- `apps/web/utils/auth.ts` (ré-export)
- `apps/web/utils/websocket-diagnostics.ts` (import SSOT, suppression copie)
- `apps/web/services/auth-manager.service.ts` (`decodeJWT` délègue)
- `apps/web/__tests__/utils/jwt.test.ts` (**nouveau** — 19 tests)

## Implementation phases
1. **RED** — `jwt.test.ts` : encoder base64url + token régression `-`/`_`, couvrir
   `decodeJwtPayload` / `isValidJWTFormat` / `isJWTExpired`. ✅
2. **GREEN** — `utils/jwt.ts` : promouvoir la version correcte de `auth.ts` en SSOT,
   + `decodeJwtPayload` factorisé. ✅
3. **REFACTOR/converge** — `auth.ts` ré-exporte ; `websocket-diagnostics` importe ;
   `auth-manager.decodeJWT` délègue. ✅
4. **Validate** — suites consommatrices vertes sans modification. ✅

## Dependencies
Aucune (module feuille sans import). `packages/shared/dist` requis seulement pour
faire tourner la suite `connection.service` (mapping jest `@meeshy/shared`).

## Estimated risks
Faible. Changement de comportement limité aux 2 copies buggées (correctif voulu).
Circularité : néant (`jwt.ts` n'importe rien ; pas de cycle auth ↔ auth-manager).

## Rollback strategy
Révert du commit unique — les 4 sites reviennent à l'état pré-itération.

## Validation criteria
- `jwt.test.ts` : 19/19 (3 régressions base64url).
- `auth.test.ts`, `auth-manager.service.test.ts`, `api.service.test.ts`,
  `socketio/connection.service.test.ts` : verts sans changement de test.
- `tsc --noEmit` : 0 nouvelle erreur sur les 4 fichiers.

## Completion status
**Terminé** — implémenté + validé localement. 198/198 sur le périmètre affecté.

## Progress tracking
- [x] SSOT `utils/jwt.ts`
- [x] Tests régression base64url
- [x] Convergence des 3 sites
- [x] Docs analyse + plan
- [ ] Commit + push + PR

## Future improvements
Voir `docs/routine/analyses/2026-07-25-iteration-205-analyse.md` §Future :
`isUserAnonymous` (`id.length > 20`, prioritaire), dédup `getUserDisplayName`,
`formatFileSize` inline.
