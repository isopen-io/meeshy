# Plan d'implémentation — Iteration 176

## Objectifs
Corriger la faiblesse chaîne-vide de `resolveParticipantAvatar` (SSOT avatar
participant) : une chaîne `''`/`'   '` locale doit déclencher le fallback vers
l'avatar de compte, jamais être renvoyée telle quelle (évite `<img src="">` et
la perte de la photo de compte). Aligner sur le frère SSOT `getSenderUserId`.

## Modules affectés
- `packages/shared/utils/participant-helpers.ts` (production — 1 fonction pure)
- `packages/shared/__tests__/utils/participant-helpers.test.ts` (tests)
- Consommateurs (aucun changement) : `services/gateway` — `MessageReadStatusService`,
  routes `conversations/{core,search,messages,participants}.ts`.

## Phases
1. **RED** — +4 tests couvrant `''` local (→ fallback compte), `'   '` blanc
   (→ fallback), `''` sans compte (→ null), `''`+`''` (→ null). Prouver l'échec
   sur le code d'origine.
2. **GREEN** — garde de vacuité `hasAvatarContent` (typeof string + trim non
   vide), early returns à deux niveaux. Signature inchangée.
3. **VALID** — suite shared complète (vitest), build tsc, régénération dist.

## Dépendances
Aucune. Fonction pure, sans I/O.

## Risques estimés
Négligeable — durcissement de garde, forme de retour inchangée (`string | null`).

## Stratégie de rollback
`git revert` du commit unique.

## Critères de validation
- 4 RED prouvés puis verts ; 6 cas existants inchangés.
- `packages/shared` : 46 fichiers / 1358 tests verts.
- `bun run build` OK.
- CI verte post-push.

## Statut de complétion
- [x] Phase 1 (RED)
- [x] Phase 2 (GREEN)
- [x] Phase 3 (validation locale)
- [ ] CI verte (post-push)

## Suivi / améliorations futures
Audit systématique des résolveurs de champs présentables partagés pour la même
faiblesse `??`-vs-chaîne-vide (convergence de tous les SSOT sur la garde de
vacuité).
