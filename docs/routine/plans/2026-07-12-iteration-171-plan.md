# Iteration 171 — Plan d'implémentation (2026-07-12)

## Objectives
Fermer la fenêtre de relais de signal WebRTC (CVE-001) sur le chemin d'erreur des handlers
terminaux d'appel, en honorant l'invariant « tout write de `CallParticipant.leftAt` évince
`signalSessionCache` » dans le helper de récupération partagé.

## Affected modules
- `services/gateway/src/socketio/CallEventsHandler.ts` — helper
  `forceEndOrphanedCallAfterOptimisticBroadcast` (production, 1 ligne).
- `services/gateway/src/__tests__/unit/socketio/CallEventsHandler-signal-cache-invalidation.test.ts`
  — 1 test de régression + mock `forceEndOrphanedCallSession`.

## Implementation phases
1. **RED** — ajouter le test « call:end error-recovery still evicts the cached session »
   (endCall reject → forceEndOrphanedCallSession résout → cache évincé). Confirmer l'échec sans fix.
2. **GREEN** — ajouter `this.invalidateSignalSession(callId);` après `if (!forceEnded) return;`.
3. **REFACTOR** — aucun (correction ponctuelle, invariant déjà factorisé dans
   `invalidateSignalSession`).

## Dependencies
Aucune. Pré-requis test (déjà satisfaits) : `prisma generate` + `shared build` + `bun install`.

## Estimated risks
Très faibles. Appel idempotent, gardé par `if (!forceEnded) return;`. Contrats socket inchangés.

## Rollback strategy
Retirer la ligne ajoutée + le test. Aucune migration, aucun state persistant impacté.

## Validation criteria
- `jest CallEventsHandler-signal-cache-invalidation` : 5/5 (4 existants + 1 nouveau) verts.
- Suite gateway complète : aucune régression.
- `tsc` gateway : aucune nouvelle erreur.

## Completion status
- [x] Analyse rédigée
- [x] Plan rédigé
- [x] RED test ajouté (RED confirmé : 1 failed sans fix / GREEN avec fix)
- [x] Fix appliqué
- [x] Suite ciblée verte (5/5)
- [x] Suite gateway verte (`CallEventsHandler` : 24 suites / 461 tests) ; tsc gateway 347 erreurs
      pré-existantes identiques avant/après (0 régression)
- [ ] Commit + push + merge main
- [ ] Branche supprimée

## Future improvements
- `updateCallStatus` : aligner l'ancrage `duration` sur `answeredAt` comme les writers frères
  (incohérence latente, non déclenchée en prod). Candidat itération future.
