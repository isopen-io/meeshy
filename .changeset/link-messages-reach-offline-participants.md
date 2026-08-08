---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

Un message envoyé par lien de partage atteint désormais les participants hors ligne.

`POST /links/:identifier/messages` et son jumeau authentifié `/messages/auth` créaient le
message puis l'annonçaient par une seule ligne :
`io.to(conversation:<id>).emit(LINK_MESSAGE_NEW)`. Cette room ne contient que les sockets
**connectées**. Aucun des deux chemins n'enfilait quoi que ce soit dans
`RedisDeliveryQueue`, donc un participant hors ligne à cet instant ne recevait rien à la
reconnexion — `_drainPendingMessages` n'avait rien à rejouer, et le client web ne refetch
pas (`staleTime: Infinity`). Le message n'apparaissait qu'au prochain refetch complet et
sans rapport de la conversation.

C'est la classe d'événement la plus grave à laquelle ce trou pouvait rester ouvert : pas un
compteur de réactions périmé mais un **message entier**, sur le seul transport d'envoi dont
dispose un participant anonyme.

Correctif : un diffuseur unique `broadcastLinkMessage` nommant les **deux** audiences
(room live + file hors ligne) par lequel passent les deux routes, un nouvel `eventType`
`'link-message'` rejoué en `link:message:new` par le drain, et — pour que la prochaine
famille d'événements soit un appel plutôt qu'une sixième copie — une implémentation unique
de la troisième audience (`offlineParticipantQueue`) à laquelle délèguent désormais les
cinq fan-out jusqu'ici recopiés dans `MessageHandler`, `MeeshySocketIOManager`,
`reactionOfflineQueue` et `AttachmentReactionHandler`.
