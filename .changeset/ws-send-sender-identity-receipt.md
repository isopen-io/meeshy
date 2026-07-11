---
"@meeshy/gateway": patch
---

Reçus de livraison : l'expéditeur n'est plus compté comme destinataire de son propre message sur le chemin WebSocket `message:send`, éliminant un faux ✓✓ (« delivered ») et un compteur `deliveredCount` gonflé.

`MessagingService.createSuccessResponse` normalise `senderId` vers le `User.id` de l'expéditeur (les clients comparent à leur propre userId), alors que le chemin REST/ZMQ conserve `senderId` = `Participant.id` brut. Les trois filtres d'exclusion de l'expéditeur de `MessageHandler` (`autoDeliverToOnlineRecipients`, `_updateUnreadCounts`, l'enqueue hors-ligne) comparaient `p.id === senderId` — vrai en permanence quand `senderId` est un `User.id`, puisqu'un `Participant.id` ne l'égale jamais. L'expéditeur, toujours en ligne au moment du broadcast, passait donc le filtre : `markMessagesAsReceived` était appelé sur son propre participant, `getLatestMessageSummary` remontait `deliveredCount ≥ 1` et un `read-status:updated` était émis vers l'expéditeur — son UI affichait « delivered » alors qu'aucun destinataire n'avait reçu le message. En groupe, chaque envoi WS gonflait `deliveredCount` de 1 ; une déconnexion juste après l'ACK pouvait aussi ré-enqueuer à l'expéditeur son propre message (bulle dupliquée au reconnect).

L'exclusion passe désormais par un prédicat unique `_isSender(p, senderId)` qui matche `p.id === senderId` OU `p.userId === senderId`. Les `Participant.id` et `User.id` n'entrent jamais en collision, donc l'expéditeur est correctement exclu sur les deux transports sans jamais écarter un destinataire légitime ; les expéditeurs anonymes (sans `userId`) restent matchés par `p.id`. Comportement du chemin REST/ZMQ inchangé. Aucun changement de schéma, d'API ni de migration.
