# Itération 264 — Plan d'implémentation

## Objectives
Consolider le garde-fou du plafond de réactions (dupliqué VERBATIM dans 5 services
du gateway) en une garde unique `assertReactionAllowed`, miroir exact de
`assertValidObjectId`. Behavior-preserving.

## Affected modules
- **Neuf** : `services/gateway/src/utils/reaction-limit-guard.ts`
- **Neuf** : `services/gateway/src/utils/__tests__/reaction-limit-guard.test.ts`
- **Modifiés** (import + 1 bloc → 1 appel) :
  - `services/gateway/src/services/ReactionService.ts`
  - `services/gateway/src/services/PostReactionService.ts`
  - `services/gateway/src/services/CommentReactionService.ts`
  - `services/gateway/src/services/AttachmentReactionService.ts`
  - `services/gateway/src/services/PostCommentService.ts`

## Implementation phases
1. **RED** — écrire `reaction-limit-guard.test.ts` (module inexistant ⇒ échec). ✅
2. **GREEN** — créer `reaction-limit-guard.ts` (`assertReactionAllowed` consommant
   le prédicat + le message partagés, jetant `ConflictError`). ✅
3. **REFACTOR** — remplacer les 5 blocs `if (!isReactionAllowed(...)) { throw ... }`
   par `assertReactionAllowed(existingReactionCount);` ; retirer les imports shared
   devenus inutiles ; conserver `ConflictError` (utilisé ailleurs partout). ✅

## Dependencies
Aucune. Le prédicat `isReactionAllowed` et le message existent déjà en shared.

## Estimated risks
Très faibles. Aucun changement de type inféré, aucun changement de comportement
runtime. Le seul axe de vigilance — un import shared laissé orphelin — vérifié à 0.

## Rollback strategy
Revert du commit unique.

## Validation criteria
- [x] RED prouvé.
- [x] GREEN : garde 4/4.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] 13 suites / 340 tests des services de réaction verts.
- [ ] CI verte sur la PR.

## Completion status
**Implémenté et validé localement.** En attente CI.

## Progress tracking
- Phase 1 (RED) ✅
- Phase 2 (GREEN) ✅
- Phase 3 (REFACTOR 5 sites) ✅
- Validation locale ✅
- CI ⏳

## Future improvements (report des candidats non retenus ce cycle)
- **`decodeCursor` validation de type** (`utils/keyset-cursor.ts`) : ne vérifie que
  la véracité (`data.createdAt && data.id`), pas le TYPE, avant de caster en
  `CursorData` et de composer un filtre Prisma `Date`. Gap de validation, sévérité
  limitée (curseurs server-mintés). Candidat itération suivante.
