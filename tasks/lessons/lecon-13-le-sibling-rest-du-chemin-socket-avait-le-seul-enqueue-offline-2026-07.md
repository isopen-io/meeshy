## Leçon 13 — Le sibling REST du chemin socket avait le seul enqueue offline (2026-07-03)
`services/gateway/src/socketio/handlers/MessageHandler.ts#broadcastNewMessage` (le chemin
`message:send`/`message:send-with-attachments`, DOMINANT selon ce même CLAUDE.md) n'appelait
JAMAIS `RedisDeliveryQueue.enqueue()` pour les destinataires hors-ligne — seul le sibling REST
`MeeshySocketIOManager._broadcastNewMessage` (utilisé par `POST /conversations/:id/messages`
et par les messages système de fin d'appel) le faisait. Un commentaire présent dans le code
documentait même le fait sans le signaler comme un bug (« le chemin principal `message:send`
n'enqueue pas offline » — `MeeshySocketIOManager.ts:1852-1858`), ce qui l'a laissé vivre sans
alerte. **Conséquence concrète** : un message envoyé via le composer normal (WS) à un
destinataire hors-ligne n'était jamais rejoué à sa reconnexion (`_drainPendingMessages`) et ne
déclenchait jamais l'avancement du reçu expéditeur de "envoyé" à "distribué" — jusqu'à ce que
le destinataire ouvre spécifiquement cette conversation. Variante du thème Leçon 7 (fonctionnalité
testée+câblée sur UN chemin, mais absente du chemin qui compte le plus) : ici pas un hook non
monté, mais un service partagé (`RedisDeliveryQueue`) jamais injecté dans le second des deux
constructeurs qui en avaient besoin. **Règle : quand un service in-memory/partagé (queue, cache,
compteur) est injecté via un setter post-construction (`setXxx()`) sur une classe qui elle-même
construit un sous-handler dans SON PROPRE constructeur, vérifier que le setter forward bien vers
CE sous-handler — sinon le sous-handler reste sur sa valeur d'init (`null`) pour toute sa vie,
même si le service parent est correctement configuré.** Fix : `MessageHandler` reçoit
`deliveryQueue` (optionnel au constructeur + `setDeliveryQueue()`), et
`MeeshySocketIOManager.setDeliveryQueue()` forwarde désormais la même instance à
`this.messageHandler.setDeliveryQueue()`. Enqueue utilise `broadcastPayload` (déjà
cid-stripped, cohérent avec ce que les autres participants reçoivent en direct). Tests :
`MessageHandler.test.ts` (3 cas) + `MeeshySocketIOManager.test.ts` (forwarding).
