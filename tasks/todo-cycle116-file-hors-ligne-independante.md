# Cycle 116 — la garantie DURABLE ne doit pas dépendre de la synchro COSMÉTIQUE

## Le défaut, en une phrase

Sur les DEUX producteurs de `message:new`, l'enfilage hors ligne — la seule voie
par laquelle un destinataire déconnecté reçoit jamais ce message — est placé
EN AVAL de la synchro de liste de conversations, et partage son sort.

## Les deux moitiés mesurées

1. **REST/ZMQ (`MeeshySocketIOManager._broadcastNewMessage`)** — l'enfilage est
   la DERNIÈRE instruction d'un `try` dont tout le reste est cosmétique
   (`conversation:updated` par destinataire, badges non-lus), et dont le `catch`
   journalise « non-bloquant ». Un `emit` qui lève (adaptateur/encodeur en
   défaut) annule le rejeu durable pour TOUS les absents.
2. **WS (`MessageHandler.broadcastNewMessage`)** — l'échec de la requête
   SUPERSET (`PREVIEW_PRISM_PARTICIPANT_SELECT + joinedAt`, dont seule la
   cosmétique a besoin) laisse `sharedParticipants = []`, et `[] ?? requête`
   garde `[]` : l'unité partagée n'enfile RIEN, alors qu'elle n'a besoin que de
   `{id, userId}` et sait faire sa propre requête. Le journal annonce
   « skipping CONVERSATION_UPDATED + unread » et tait la troisième perte.

## Ce qui rend le second invisible

`enqueueForOfflineParticipants` traite `participants: []` comme « voici la
liste » et non comme « je ne sais pas » — exactement l'ambiguïté que le dépôt a
déjà tranchée ailleurs (`bridgeComputed` / `bridgeNotComputed`).

## Lot

- [x] RED sur les deux producteurs (harnais de parité, deux productions réelles)
- [x] REST : requête dans son propre `try`, enfilage DURABLE d'abord, via
      `_enqueueForOfflineParticipants` (dernier appelant direct de
      `deliveryQueue.enqueue` du dépôt, et son cast `as Record<string, unknown>`)
- [x] WS : `sharedParticipants` devient `| undefined` ; l'enfilage remonte avant
      la cosmétique et transmet `undefined` quand la liste est inconnue
- [x] Cliquet de parité sur ce que les deux producteurs ENFILENT
- [x] Gates : gateway `tsc`, suites gateway, shared

## Suivis (instruits, non exécutés)

- [ ] REST : `if (senderId)` englobe l'enfilage — un message sans expéditeur
      (agent/système) n'est jamais rejoué aux absents. Élargir demande de
      mesurer les producteurs de messages sans `senderId`.
- [ ] WS : sous échec de la requête participants, `resolveForwardSourceForBroadcast`
      reçoit une liste de lecteurs VIDE ⇒ aucun lecteur masqué ⇒ la provenance
      de transfert part à des lecteurs qui l'ont refusée. Fail-open d'une règle
      de confidentialité sur panne de base — antérieur à ce lot, non touché.
- [ ] REST : aucun équivalent de `resolvePayloadForReader`
      (`forwardSourceHiddenUserIds`) — le retrait par LECTEUR n'existe que sur le
      chemin WS.
