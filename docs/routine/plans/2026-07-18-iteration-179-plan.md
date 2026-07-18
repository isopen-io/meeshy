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
