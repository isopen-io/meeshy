# Iteration 80 — Plan d'implémentation (2026-07-02)

## Objectifs
Borner le dernier cache in-process non borné du gateway (`participant-lookup-cache`, follow-up F45),
supprimant une fuite mémoire sur le chemin d'envoi de message.

## Modules affectés
- `services/gateway/src/utils/participant-lookup-cache.ts` (prod, 1 fichier)
- `services/gateway/src/__tests__/unit/utils/participant-lookup-cache.test.ts` (3 tests neufs)

## Phases
1. **GREEN** — `PARTICIPANT_LOOKUP_CACHE_MAX = 5000` + `evictForInsert` (no-op sous le cap / clé
   existante ; sinon sweep des expirées puis FIFO). Appel dans `cacheParticipant` avant `set`.
2. **TEST** — 3 cas : borne tient sous insertions distinctes soutenues ; réclamation des expirées
   avant éviction des vivantes ; mise à jour d'une clé existante n'évince pas.
3. **VALIDATION** — suite `participant-lookup-cache` + `utils/` + `MessagingService` vertes.

## Dépendances
Aucune. Fichier isolé, indépendant des PR récentes.

## Risques estimés
Faible. Chemin chaud intact (retour immédiat sous le cap) ; balayage O(n) seulement au franchissement
du cap ; éviction préfère les entrées expirées → aucune incohérence. Design timer-free (pas de
lifecycle ni d'open-handle en test). Sémantique TTL/invalidate/reset inchangée.

## Stratégie de rollback
`git revert` du commit unique — fichier isolé, aucune migration ni changement d'API public.

## Critères de validation
- [x] `participant-lookup-cache.test.ts` 12/12.
- [x] 906/906 suites consommatrices, 0 régression.

## Statut de complétion
- [x] Implémenté
- [x] Validé (local)
- [ ] Mergé

## Améliorations futures
- Unifier les 3 copies bornées du cache `conversationId` en 1 SSOT.
