---
"@meeshy/gateway": patch
---

La pastille de non-lus bouge enfin quand un message arrive par lien de partage.

`conversation:unread-updated` est le seul signal live qui incrémente le compteur de non-lus
d'un destinataire. Les deux routes d'envoi par lien (`POST /links/:identifier/messages` et
son jumeau `/messages/auth`) ne l'émettaient pas : elles annoncent le message dans la room
puis l'enfilent pour les hors-ligne, et c'est tout.

Le handler web `link:message:new` remonte bien la conversation en tête de liste avec son
nouvel aperçu — mais il ne touche **pas** au compteur, et la liste tourne en
`staleTime: Infinity`. La conversation sautait donc en tête pendant que sa pastille
continuait d'afficher sa valeur d'avant : le badge ne devenait pas périmé, il mentait. Le
lien de partage étant le seul transport d'envoi d'un participant anonyme, tout ce trafic
produisait ce mensonge.

Racine, quatrième cycle consécutif sur la même : l'éventail destinataire existait en **deux**
implémentations — `MessageHandler._updateUnreadCounts` (`private`) et un bloc inline de
`MeeshySocketIOManager._broadcastNewMessage` — ne différant que par le prédicat d'exclusion de
l'expéditeur, c'est-à-dire par une valeur et non par un comportement. Aucune des deux n'était
atteignable depuis une route.

Correctif : une unité unique `emitUnreadCountsToRecipients` (`socketio/emitUnreadCountsToRecipients.ts`)
par laquelle passent désormais les trois transports d'envoi. Elle exclut l'auteur par ses
**deux** identités (`Participant.id` sur REST/ZMQ et lien, `User.id` sur WS — deux espaces
d'ObjectIds qui ne se recoupent jamais, donc élargir ne coûte aucun faux positif), adresse un
participant sans compte par son id de participant (la population même du transport lien), et
accepte une liste de participants préchargée pour ne pas ajouter d'aller-retour sur le chemin
le plus chaud du service. Best-effort : jamais dans le chemin de l'ACK, jamais un 500.

`conversation:updated` reste délibérément absent du chemin de lien, pour la raison inchangée
du cycle précédent — et c'est précisément l'argument qui ne tient PAS pour la pastille, que ce
handler n'applique jamais.
