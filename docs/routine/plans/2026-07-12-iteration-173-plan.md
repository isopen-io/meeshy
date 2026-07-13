# Iteration 173 — Plan d'implémentation (2026-07-12)

## Objectives
Empêcher `CallManager.handleCallEnded` d'empiler une offre « Réessayer »
(`pendingRetry`) sur la sonnerie entrante promue quand l'appel ACTIF tombe
(raison transitoire) alors qu'un appel est en attente (call-waiting busy-path).

## Affected modules
- `apps/web/components/video-call/CallManager.tsx` (prod, `handleCallEnded`).
- `apps/web/__tests__/components/video-call/CallManager.callWaiting.test.tsx`
  (2 tests + `clearCallRetry()` dans `beforeEach`).

## Implementation phases
1. **RED** — 2 tests call-waiting : promotion sur end (existant, vert) +
   suppression du retry sur end transitoire pendant attente (échec : `pendingRetry`
   posé). → 1 échec.
2. **GREEN** — garde `!waitingCall &&` sur le bloc `isRetryableCallFailure`. → vert.
3. **REFACTOR** — aucun (garde minimale, commentaire explicatif ajouté).

## Dependencies
Aucune. Isolé au composant web `CallManager` + son test. Aucun changement
gateway/shared/SDK/iOS.

## Estimated risks
Très faibles. Le chemin retry hors call-waiting est inchangé (garde `false` quand
`waitingCall` est `null`) — couvert par `CallManager.callEndedRetry.test.tsx`.

## Rollback strategy
Revert du commit unique. Aucun état persisté impacté.

## Validation criteria
- [x] RED : le test retry-suppression échoue avant le fix
      (`pendingRetry = {conversationId:'conv-active', type:'video'}`).
- [x] GREEN : 8/8 call-waiting + 8/8 callEndedRetry verts après le fix.
- [x] `__tests__/components/video-call/` : 11 suites / 49 tests verts.
- [x] `tsc --noEmit` : aucune nouvelle erreur (baseline pristine identique).

## Completion status
**COMPLETE** — implémenté, testé (RED→GREEN), documenté. Prêt à pousser sur
`claude/brave-archimedes-a3glpl`.

## Progress tracking
- Analyse : `docs/routine/analyses/2026-07-12-iteration-173-analyse.md`.
- Commit unique regroupant prod + test + docs routine.

## Future improvements
- **iOS parité** : vérifier que `CallManager` iOS (busy-path
  `endCurrentAndAnswerPending` + retry) n'a pas la même interaction retry↔promotion
  (non testable ici, pas de toolchain Swift). À auditer lors d'une itération iOS.
- **P1 backlog device-log** (`tasks/2026-07-12-device-log-priorities.md`) : #5/#6/#8
  restent iOS-side (batcher engagement, chunk presence) — hors périmètre TS.
