# Iteration 231 — Plan : garde validate-before-stamp sur le handler audio ZMQ

## Objectives
Éliminer la perte silencieuse d'une re-livraison audio VALIDE (ZMQ at-least-once) en validant
`messageId` AVANT de consommer le slot de déduplication dans `handleAudioProcessCompleted`, par
symétrie stricte avec `handleTranslationCompleted`.

## Affected modules
- `services/gateway/src/services/zmq-translation/ZmqMessageHandler.ts` (production, 1 méthode)
- `services/gateway/src/__tests__/unit/services/ZmqMessageHandler.test.ts` (+2 tests)
- `docs/routine/analyses/2026-08-20-iteration-231-analyse.md`
- `docs/routine/plans/2026-08-20-iteration-231-plan.md`

## Implementation phases
1. **RED** — ajouter 2 tests dans le describe `audio_process_completed` :
   - garde `messageId` vide → no emit, `audioCompleted` reste 0 ;
   - frame malformée puis re-livraison valide sous même `taskId` → 1 seul emit, `messageId` correct.
   Prouver l'échec (2 rouges). ✅
2. **GREEN** — déplacer la validation avant `processedResults.add(resultKey)` : `if (!event.messageId)
   return;` + commentaire d'invariant miroir. ✅
3. **Validation** — suite ciblée + suite complète zmq-translation + `tsc --noEmit`. ✅

## Dependencies
Aucune. Setup CI-parité déjà en place (prisma generate + shared build).

## Estimated risks
Très faible — seul le traitement des frames sans `messageId` change (rejet propre au lieu d'un slot
consommé + emit inutile). Toute frame valide inchangée.

## Rollback strategy
`git revert` du commit unique. Aucune migration, aucun changement de contrat.

## Validation criteria
- RED : 2 tests rouges avant fix. ✅
- GREEN : `ZmqMessageHandler` 131/131 ; `zmq-translation` 196/196 ; `tsc --noEmit` = 0. ✅

## Completion status
**TERMINÉ.** Fix + tests + docs livrés, tous gates verts.

## Progress tracking
- [x] Analyse rédigée
- [x] Tests RED prouvés
- [x] Fix GREEN
- [x] Suite complète + typecheck verts
- [x] Commit + push

## Future improvements
- Extraire `stampIfValid(resultKey, validate)` partagé entre les handlers (SSOT de la règle
  at-least-once) — après retombée de la campagne `$-sequences`.
- Audit des handlers voice/progressive consommant `processedResults`.
