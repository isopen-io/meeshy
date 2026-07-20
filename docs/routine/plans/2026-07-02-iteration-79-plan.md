# Iteration 79 — Plan d'implémentation (2026-07-02)

## Objectifs
Borner le 3e (et dernier) cache `identifier → ObjectId` non borné du gateway
(`resolveConversationId`), supprimant une fuite mémoire sur les routes REST de conversation.

## Modules affectés
- `services/gateway/src/utils/conversation-id-cache.ts` (prod, 1 fichier)
- `services/gateway/src/__tests__/unit/utils/conversation-id-cache.test.ts` (test d'éviction)

## Phases
1. **GREEN** — Ajouter `CONVERSATION_ID_CACHE_MAX = 2000` + éviction FIFO avant `set`, idiome
   identique à `socket-helpers.ts`.
2. **TEST** — Test d'éviction : remplir le cap + 1, vérifier que la plus ancienne entrée est
   re-query et qu'une entrée non évincée reste servie du cache.
3. **VALIDATION** — Suite `conversation-id-cache` + suites consommatrices (`MessageValidator`,
   `MessagingService`, `utils/`) vertes.

## Dépendances
Aucune. Fichier isolé, indépendant des PR récentes.

## Risques estimés
Faible. Fix strictement additif (éviction O(1) uniquement à ≥2000 entrées) ; données immuables
(identifier→ObjectId) donc aucune incohérence possible sur miss. Idiome prouvé en prod (iter 42).

## Stratégie de rollback
`git revert` du commit unique — fichier isolé, aucune migration ni changement d'API.

## Critères de validation
- [x] `conversation-id-cache.test.ts` 9/9.
- [x] 961/961 suites consommatrices, 0 régression.

## Statut de complétion
- [x] Implémenté
- [x] Validé (local)
- [ ] Mergé

## Améliorations futures
- F45 : sweep + borne pour `participant-lookup-cache.ts`.
- Unifier les 3 copies bornées du cache `conversationId` en 1 SSOT (touche la DI de `MeeshySocketIOManager`).
