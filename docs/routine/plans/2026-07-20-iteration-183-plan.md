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
# Plan Iteration 183 — Corriger le contrat mensonger de `attachmentTranslationsMapSchema`

## Objectifs
Rendre le contrat de `parseAttachmentTranslationsMap` **cohérent, honnête et
testé** : supprimer le docstring auto-contradictoire (`:187-196`) qui affirme une
validation cross-field clé↔contenu jamais implémentée, et verrouiller le
comportement réel par un test de caractérisation.

## Modules affectés
- `packages/shared/utils/attachment-validators.ts` (docstring `:187-196`, aucune
  logique).
- `packages/shared/__tests__/attachment-validators.test.ts` (+1 test).

## Phases d'implémentation
1. **RED/Characterization** — ajouter un test affirmant qu'une map dont la clé de
   langue ne correspond pas à la langue réelle du contenu est **acceptée**
   (`ok:true`), faute de marqueur de langue interne à recouper. Passe sur le code
   actuel.
2. **GREEN** — réécrire le docstring `:187-196` pour dire la vérité (clé
   autoritaire, non recoupée, impossible à recouper car pas de champ langue
   interne ; responsabilité de l'appelant), aligné sur `:253-258`.
3. **VALIDATE** — `vitest run __tests__/attachment-validators.test.ts` (37 verts).

## Dépendances
Aucune. `packages/shared` autonome, vitest déjà installé.

## Risques estimés
Très faible : fix documentaire + test caractérisant le comportement existant.
Aucune signature, aucun appelant, aucune forme persistée modifiée.

## Stratégie de rollback
`git revert` du commit unique (2 fichiers). Aucun impact runtime.

## Critères de validation
- 37/37 tests `attachment-validators` verts (36 + 1).
- `tsc --noEmit` shared inchangé.

## Statut de complétion
- [x] Phase 1 — test de caractérisation (RED/lock) — +1 test
- [x] Phase 2 — docstring corrigé (GREEN)
- [x] Phase 3 — validation vitest — **1365/1365 tests verts (46 suites), dont 37 `attachment-validators` (36 + 1)**

## Progress tracking
Démarré 2026-07-20 sur `claude/brave-archimedes-xx8xvp` @ base `b3ffa80`.

## Améliorations futures
Voir la section Backlog de l'analyse (normalizeLanguageCode ISO 639-3, sémantique
`limit=0`, case-sensitivity `CommonSchemas.language`, borne email 254/255).
