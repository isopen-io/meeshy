# Iteration 42 — Plan d'implémentation (2026-07-03)

## Objectifs
Éliminer le fan-out push séquentiel qui laisse un token lent bloquer la livraison
aux autres appareils d'un utilisateur, et clarifier le contrat de résultat
(1 résultat par token, un push délivré reste un succès).

## Modules affectés
- `services/gateway/src/services/PushNotificationService.ts` (`sendToUser`)
- `services/gateway/src/__tests__/unit/services/PushNotificationService.test.ts`

## Phases
1. **RED** — Ajouter un test de concurrence (3 tokens APNS, compteur
   `maxInFlight`) attendant un fan-out parallèle, et un test d'isolation
   (un token rejette, les autres sont livrés). ✅
2. **GREEN** — Réécrire la boucle en `Promise.all(tokens.map(...))` ; durcir le
   chemin succès (bookkeeping best-effort en try/catch local). ✅
3. **Réconciliation des tests existants** — 3 tests reposaient sur l'exécution
   séquentielle intra-batch :
   - « update throws on success path » → réécrit : push livré reste `success`,
     `warn` émis (plus de 2e résultat fantôme). ✅
   - 2 tests circuit-breaker « bypass sur le 6e appel » → restructurés en **deux**
     `sendToUser` (1er ouvre le breaker sur 5 échecs, 2e est court-circuité) —
     teste le vrai contrat inter-appels du breaker. ✅

## Dépendances
Aucune (changement isolé, pas de migration schéma, pas de nouveau package).

## Risques & rollback
- Risque FAIBLE. Rollback trivial : revert du commit.
- Aucun changement de contrat externe ; l'ordre des résultats n'était pas
  exploité par les appelants.

## Critères de validation
- [x] `PushNotificationService.test.ts` 75/75 vert.
- [x] Suites notifications 165/165 vertes.
- [x] Aucun nouveau type-error attribuable au changement.
- [x] Parallélisation prouvée sûre (lignes distinctes, garde par tokenId,
      état breaker évalué à l'entrée).

## Statut
**Complété** — livré dans cette itération.

## Améliorations futures (backlog priorisé)
1. `CallEventsHandler.resolveActiveCallParticipantId` → requête `callParticipant`
   étroite (bénéficie à 8 handlers hot-path). Impact HAUT.
2. Dédup du double `notification.count({readAt:null})` par notification créée.
3. Faux `typing:stop` multi-appareils sur `disconnect`
   (`drainActiveTypingState`).
