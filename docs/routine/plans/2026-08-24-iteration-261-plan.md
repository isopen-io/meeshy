# Plan — Itération 261 : achever la SSOT ObjectId dans le gateway (3 idiomes)

## Objectifs
1. Créer la SSOT manquante pour l'idiome `pattern` JSON Fastify :
   `OBJECT_ID_PATTERN` (= `OBJECT_ID_REGEX.source`) dans
   `packages/shared/utils/object-id.ts`.
2. Rebrancher les ~24 littéraux inline restants du gateway sur la SSOT, sous les
   trois idiomes, **sans changer aucun comportement** (messages, gardes, langage).

## Affected modules
- `packages/shared/utils/object-id.ts` (+ test `__tests__/utils/object-id.test.ts`)
- Gateway (18 fichiers) :
  - Idiome A : `socketio/queuedEventContract.ts`, `socketio/handlers/ReactionHandler.ts`,
    `socketio/handlers/AttachmentReactionHandler.ts`, `socketio/utils/socket-helpers.ts`,
    `socketio/MeeshySocketIOManager.ts`, `validation/message-read-status-schemas.ts`,
    `routes/admin/agent.ts`, `routes/admin/agent-topics.ts`, `routes/users/profile.ts`,
    `routes/users/preferences.ts`
  - Idiome B : `validation/{mentions,socket-event,messages,admin,conversation-encryption,message-read-status}-schemas.ts`,
    `routes/posts/types.ts`, `routes/admin/agent.ts`
  - Idiome C : `routes/calls.ts`, `routes/conversation-preferences.ts`, `routes/admin/agent.ts`

## Implementation phases
1. **SSOT + test (TDD)** — RED (2 tests sur `OBJECT_ID_PATTERN` absent), puis
   ajout de la constante, GREEN, rebuild `dist`. ✅
2. **Idiome A** — `isValidObjectId(x)` (prédicat) / import d'`OBJECT_ID_REGEX`
   (remplace les `const` locaux). ✅
3. **Idiome B** — swap du seul littéral pour `OBJECT_ID_REGEX`, messages conservés. ✅
4. **Idiome C** — swap des chaînes `pattern` pour `OBJECT_ID_PATTERN`. ✅
5. **Validation** — tsc gateway+shared, suites affectées. ✅

## Dependencies
`OBJECT_ID_PATTERN` doit être bâti dans `packages/shared/dist` avant le tsc du
gateway (subpath `@meeshy/shared/utils/object-id` résout vers `dist/`). Rebuild
shared après phase 1.

## Estimated risks
Très faible (refactor pur). Un seul écueil identifié et évité : router l'idiome B
vers `CommonSchemas.mongoId` aurait changé les messages d'erreur d'API. La
migration ne touche que le littéral regex.

## Rollback strategy
Revert du commit : chaque site retrouve son littéral inline. Aucune migration de
données, aucun changement de contrat.

## Validation criteria
- gateway `tsc --noEmit` = 0, shared `tsc --noEmit` = 0.
- `object-id.test.ts` : 8/8 (dont 2 nouveaux, RED prouvé).
- 45 suites affectées vertes (1570 tests).

## Completion status
**TERMINÉ.** SSOT créée, 19 fichiers rebranchés, 3 idiomes couverts, validation
verte.

## Progress tracking
- [x] Phase 1 — `OBJECT_ID_PATTERN` + test
- [x] Phase 2 — idiome A (10 sites)
- [x] Phase 3 — idiome B (9 sites)
- [x] Phase 4 — idiome C (9 sites)
- [x] Phase 5 — validation

## Future improvements
- **Cluster minuscules-only `/^[a-f0-9]{24}$/`** (`notification-schemas.ts` ×11,
  `mediaOwnership.ts`, `posts/sounds.ts`, `posts/types.ts` `soundId`) : langage
  DIFFÉRENT (rejette l'hexa majuscule). L'unifier est un **changement de
  comportement** (élargit l'acceptation) — décision sémantique à instruire à part.
- Promouvoir `assertValidObjectId` (garde « valide ou jette », gateway) au-delà
  des 3 services de réaction, là où un site refait `if (!isValidObjectId(x)) throw`.
