# Plan — Iteration 179 : SSOT `resolveParticipantDisplayName`

## Objectifs
Éliminer la fuite chaîne-vide et le court-circuit du fallback compte sur la
sérialisation `sender.displayName` des routes gateway, en branchant les 7 sites
sur une source unique blank-aware miroir de `resolveParticipantAvatar`.

## Modules affectés
- `packages/shared/utils/participant-helpers.ts` (+ helper, refactor prédicat)
- `packages/shared/__tests__/utils/participant-helpers.test.ts` (+8 tests)
- `services/gateway/src/routes/conversations/core.ts` (1 site + import)
- `services/gateway/src/routes/conversations/search.ts` (1 site + import)
- `services/gateway/src/routes/conversations/messages.ts` (5 sites + import)

## Phases
1. **RED** — tests `resolveParticipantDisplayName` (fait, 8 tests).
2. **GREEN** — helper + généralisation `isNonBlank` (fait).
3. **Wiring** — 7 substitutions gateway + imports (fait).
4. **Validation** — build shared, tsc gateway, suites routes (fait).

## Dépendances
Aucune nouvelle. Réutilise l'infra `participant-helpers` existante.

## Risques estimés
Très faibles — substitution mécanique vers un helper testé, type de retour
inchangé, miroir d'un pattern en production (#1925).

## Stratégie de rollback
Revert du commit unique : helper additif + substitutions locales, aucun schéma ni
contrat API modifié.

## Critères de validation
- shared : 16/16 tests, build OK.
- gateway : tsc 0 erreur ; routes conversation 166/166 ; messages|search 615/615.

## Statut de complétion
✅ Complété — prêt pour push + PR.

## Suivi de progression
- [x] Helper + tests
- [x] 7 sites câblés
- [x] Validation locale verte

## Améliorations futures
- Traiter Finding 3 (normalisation `getUserLanguageChoices`).
- Envisager un `resolveParticipantIdentity(participant)` regroupant
  avatar + displayName + username si un 8e call-site apparaît.
