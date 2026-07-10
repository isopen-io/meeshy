---
"@meeshy/gateway": patch
---

Reçus de livraison : le chemin de broadcast REST/ZMQ marque désormais « delivered » les destinataires en ligne mais hors de la conversation, à parité avec le chemin WebSocket `message:send`.

`MeeshySocketIOManager._broadcastNewMessage` (emprunté par `broadcastMessage`, appelé par la route REST `POST /conversations/:id/messages` et par le rejeu ZMQ) émettait `message:new` uniquement vers `conversation:<id>`, faisait la synchro liste (`conversation:updated` / `conversation:unread-updated`) et l'enqueue hors-ligne, mais n'appelait jamais `markMessagesAsReceived` pour un destinataire connecté qui consulte un autre écran. L'expéditeur restait bloqué sur un simple ✓ (« sent ») jusqu'à ce que le destinataire ouvre réellement la conversation — alors que le chemin WS `message:send` upgrade immédiatement en ✓✓ via `MessageHandler._autoDeliverToOnlineRecipients`.

La logique d'auto-livraison est désormais exposée en source unique (`MessageHandler.autoDeliverToOnlineRecipients`) et le chemin REST/ZMQ y délègue (mêmes instances `io` / `connectedUsers` / services read-status + privacy), garantissant un comportement de reçu identique quel que soit le transport. Respecte toujours la préférence `showReadReceipts` par destinataire. Aucun changement de schéma, d'API ni de migration.
