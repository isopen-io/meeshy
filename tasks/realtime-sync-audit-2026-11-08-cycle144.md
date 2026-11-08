# Cycle 144 — une exclusion de blocage qui n'existe pas, et une qui s'éteint sur une panne

**Issues visées** : #16745 (lot A, `LocationHandler`) et #16752 (lot B,
`ConversationViewingHandler`).
**Branche** : `claude/exciting-planck-4nctmx`. **Milestone** : à poser.

## Réservation (doctrine de la branche poussée tôt, #5243)

Ce commit réserve les fichiers du lot AVANT d'écrire la logique :

- `services/gateway/src/socketio/handlers/LocationHandler.ts`
- `services/gateway/src/socketio/handlers/ConversationViewingHandler.ts`
- `services/gateway/src/socketio/MeeshySocketIOManager.ts` (câblage `userSockets`)
- `services/gateway/src/socketio/handlers/ConversationHandler.ts` (le rejeu devient asynchrone)

Relevé au démarrage : aucune branche vivante n'écrit les deux handlers ; la PR
#16769 (cycle 143) tient `offlineParticipantQueue.ts`, `RedisDeliveryQueue.ts`
et la file hors ligne du SDK — d'où le choix de ce périmètre, qui ne la croise
pas.

Le détail des deux lots et leur preuve viennent avec le code.
