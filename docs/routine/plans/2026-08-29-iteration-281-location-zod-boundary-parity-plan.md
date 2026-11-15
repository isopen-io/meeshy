# Plan — Itération 281 : frontière Zod de `LocationHandler` (douzième famille)

Issue : #4245. Statut : **livré**.

## Objectifs

Porter la douzième et dernière famille socket (partage de position en direct)
sur la même frontière de validation Zod que ses onze jumelles, et donner à
`location:live-stop` la borne de frontière qu'il n'avait pas.

## Modules affectés

- `services/gateway/src/validation/socket-event-schemas.ts` (ajout de 3 schémas)
- `services/gateway/src/socketio/handlers/LocationHandler.ts` (frontière ×3,
  retrait de `_validateCoordinates`)
- `services/gateway/src/socketio/handlers/__tests__/LocationHandler.test.ts`
- `services/gateway/src/__tests__/unit/handlers/LocationHandler.test.ts`

## Phases

1. **RED** — mettre à jour les deux fichiers de tests pour asserter le message de
   frontière (`'Validation failed: Invalid coordinates'` /
   `'Validation failed: Invalid duration (must be 1-480 minutes)'`) au lieu des
   messages manuscrits, et ajouter un témoin « `live-stop` sans conversationId
   refusé ». Prouver le ROUGE contre la production actuelle.
2. **GREEN** — ajouter `SocketLocationLiveStartSchema` /
   `SocketLocationLiveUpdateSchema` / `SocketLocationLiveStopSchema`, câbler
   `validateSocketEvent` en tête des trois verbes, remplacer `data.*` par
   `validated.*`, retirer `_validateCoordinates` et la garde de durée manuscrite.
3. **REFACTOR / validation** — `tsc --noEmit`, suite complète du gateway.

## Dépendances

Aucune. `validateSocketEvent` préexiste ; les bornes sont exprimables en Zod pur.

## Risques & rollback

Risque faible (frontière strictement alignée sur les onze jumelles ; bornes
préservées au réel, y compris la durée non entière). Rollback = revert du
commit ; aucune migration, aucun changement de contrat de fil, aucun changement
de schéma de réponse. Les types `LocationLive*Data` (`@meeshy/shared`) restent
la source du contrat client→serveur ; les schémas Zod en sont la garde
d'exécution, non un doublon de type.

## Critères de validation

- Suite gateway complète verte.
- `tsc --noEmit` exit 0.
- ROUGE prouvé sur les témoins de frontière.

## Statut / suite

Livré. L'arc des frontières socket (279→280→281) est SOLDÉ : les douze familles
valident par Zod. `_validateCoordinates` retiré (plus d'appelant).
