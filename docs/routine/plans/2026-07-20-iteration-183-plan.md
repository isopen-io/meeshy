# Plan d'implémentation — Itération 183

## Objectifs
1. **Éliminer la fuite mémoire non bornée** du cache de debounce de
   `deviceCountry.ts` en propageant le durcissement iter-181 de son miroir
   auto-déclaré `deviceLocale.ts` (plafond `MAX_TRACKED_USERS` + éviction).
2. **Corriger la sémantique de plancher** de `validatePagination` : un `limit=0`
   explicite doit être ramené au plancher (1), pas coercé vers `defaultLimit`.

## Modules affectés
- `services/gateway/src/middleware/deviceCountry.ts` (fix mémoire + seams)
- `services/gateway/src/__tests__/unit/middleware/deviceCountry.test.ts` (RED/bloc)
- `services/gateway/src/utils/pagination.ts` (fix plancher)
- `services/gateway/src/__tests__/unit/utils/pagination.test.ts` (RED/assertion)

## Phases
1. **RED pagination** — corriger l'assertion `'0' → 20` en `'0' → 1`, ajouter le
   cas `''` (illisible → défaut) et `defaultLimit` explicite. ✅
2. **GREEN pagination** — `Number.isNaN(parseInt)` ? `defaultLimit` : valeur
   parsée, puis `Math.max(1, …)`. ✅
3. **RED deviceCountry** — importer les seams `_deviceCountryCacheSize` /
   `_DEVICE_COUNTRY_MAX_TRACKED_USERS` (inexistants → compile-fail), ajouter le
   bloc `describe('bounded debounce cache (memory-leak guard)')` mirroir de
   `deviceLocale.test.ts`. ✅
4. **GREEN deviceCountry** — ajouter `MAX_TRACKED_USERS`,
   `pruneStaleDebounceEntries`, la balayage pré-insertion, et les deux seams. ✅
5. **Validation** — jest (deviceCountry 17, +deviceLocale +pagination 43, routes
   paginées 121) + tsc (0 erreur). ✅

## Dépendances
`pruneStaleDebounceEntries` / `MAX_TRACKED_USERS` — patron déjà en production dans
`deviceLocale.ts` (iter-181, PR #2057). Copie verbatim.

## Risques estimés
Très faibles. #1 = copie d'un helper testé, comportement de debounce identique
sous le plafond. #2 = seul `limit=0` change (20 → 1), aucun call site interne
concerné (grep).

## Stratégie de rollback
Revert du commit unique de l'itération.

## Critères de validation
- `deviceCountry.test.ts` : **17 verts** (3 nouveaux).
- `deviceLocale` + `pagination` : **43 verts**.
- Routes paginées (`communities-core`, `admin-reports`, `affiliate`,
  `users-devices`) : **121 verts**.
- `tsc --noEmit` gateway : **0 erreur**.

## Statut
**COMPLETE** — implémenté et validé.

## Suivi de progression
- [x] RED pagination (assertion `'0' → 1`)
- [x] GREEN pagination (NaN vs valeur parsée)
- [x] RED deviceCountry (seams + bloc bounded-cache)
- [x] GREEN deviceCountry (plafond + éviction + seams)
- [x] Validation jest + tsc
- [x] Analyse + plan
- [ ] Commit + push

## Améliorations futures
- `AuthSchemas.verifyPhone.code` : +regex `/^[0-9]{6}$/` (parité avec `verifyEmail`).
- `ConversationSchemas.participantsFilters.limit` : clamp NaN/négatif (à câbler d'abord).
