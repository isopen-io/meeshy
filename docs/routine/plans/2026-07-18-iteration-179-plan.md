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
# Plan d'implémentation — Iteration 179

## Objectifs
Aligner les quatre derniers points de résolution d'avatar de participant hors de la
source unique `resolveParticipantAvatar` : 3 sites `CallEventsHandler` (ordre
inversé + fuite blanc) et 1 transform dashboard (fuite blanc + champ non livré).

## Modules affectés
- `services/gateway/src/socketio/CallEventsHandler.ts`
- `services/gateway/src/routes/users/preferences.ts`
- `services/gateway/src/__tests__/unit/socketio/CallEventsHandler-avatar-resolution.test.ts` (nouveau)
- `services/gateway/src/__tests__/unit/routes/users/preferences-dashboard.test.ts` (+2 cas)

## Phases
1. **RED** — tests pilotant `call:check-active` (replay `call:initiated`) et le
   dashboard, asservissant l'ordre local-first + le traitement blanc-comme-absent.
2. **GREEN** — import de `resolveParticipantAvatar`, délégation aux 3 sites call +
   au transform dashboard, ajout du champ `avatar` (nullable) au response schema
   dashboard.
3. **VALIDATE** — `tsc --noEmit` (0 erreur), suites affectées + régression
   `CallEventsHandler`, mutation-check.

## Dépendances
Aucune. `resolveParticipantAvatar` déjà exporté depuis
`@meeshy/shared/utils/participant-helpers` et importé dans 5 fichiers frères.

## Risques estimés
Faible. Délégation à un helper testé ; seul comportement changé = ordre local-first
+ blanc-absent + livraison du champ dashboard (nullable, rétro-compatible).

## Stratégie de rollback
`git revert` du commit ; les deux changements source sont indépendants et sans
migration de données.

## Critères de validation
- 0 erreur `tsc`.
- 5 nouveaux cas verts (3 call + 2 dashboard) ; mutation-check rouge sur l'ancien
  code.
- `CallEventsHandler` 474/474 ; suites `preferences*` vertes.

## Statut de complétion
✅ Complété — code + tests + docs. Prêt pour commit/push.

## Suivi de progression
- [x] Recherche sous-agent (top-3 candidats, même classe SSOT-avatar)
- [x] Fix CallEventsHandler (3 sites) + import
- [x] Fix preferences.ts (transform + response schema)
- [x] Tests CallEventsHandler-avatar-resolution (3) + preferences-dashboard (+2)
- [x] Mutation-check des 4 sites
- [x] tsc 0 erreur + régression verte
- [x] Analyse + plan

## Améliorations futures
- Candidat #3 (Explore) : `generateDefaultConversationTitle`
  (packages/shared/utils/conversation-helpers.ts:270/280) inverse `username` et
  `firstName+lastName` vs la priorité canonique documentée — nécessiterait un
  résolveur de nom partagé (aucun aujourd'hui côté shared). À traiter dans une
  itération dédiée avec extraction d'un `resolveMemberDisplayName` partagé.
- Auditer les autres émetteurs Socket.IO (`MeeshySocketIOManager`) pour un
  rebranchement systématique sur `resolveParticipantAvatar` (aujourd'hui corrects
  mais réécrits à la main).
