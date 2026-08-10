---
'@meeshy/gateway': patch
---

Le budget d'un message à vue unique se dépense enfin par SPECTATEUR, et non par ouverture.

`POST /conversations/:id/messages/:messageId/consume` incrémentait `Message.viewOnceCount` à chaque
appel, sans condition et sans clé d'idempotence. Le compteur mesurait donc des OUVERTURES, alors que
tout ce qui le lit — `isFullyConsumed`, l'annonce `message:consumed` diffusée à la room, la
disparition du média chez les clients — le lit comme un nombre de SPECTATEURS.

Dans un groupe où l'émetteur a posé `maxViewOnceCount: 2`, le premier destinataire qui rouvre la
photo deux fois portait `isFullyConsumed` à vrai ; la route l'annonçait à toute la conversation, et
le second destinataire perdait un média qu'il n'avait jamais ouvert. Un simple rejeu de la requête —
file hors-ligne, double tap, retry réseau — produisait le même effet à lui seul.

**La donnée qui rend le compte exact était déjà écrite par ce même gestionnaire, deux instructions
plus bas** : `MessageStatusEntry.viewedOnceAt`, par participant. Écrite, jamais relue. Elle devient
la revendication (`services/messaging/recordViewOnceConsumption.ts`), et l'incrément n'en est plus
que la conséquence.

La revendication est GARDÉE côté base plutôt que décidée après une lecture : deux ouvertures
simultanées du même spectateur liraient toutes deux « pas encore vu ». C'est l'`updateMany` filtré
qui tranche, et quand il n'apparie rien, c'est la création qui distingue l'entrée absente (première
consommation) de l'entrée déjà estampillée (conflit `@@unique([messageId, participantId])`). Son
prédicat apparie les DEUX états « pas encore vu » — colonne absente autant que présente-et-nulle —
parce qu'une entrée créée par la livraison n'écrit jamais `viewedOnceAt` et que
`{ viewedOnceAt: null }` seul ne l'apparie pas sur le connecteur MongoDB de Prisma.

Deux corollaires :

- **Un spectateur anonyme laisse enfin sa trace.** `authContext.userId` porte un jeton de session
  pour un anonyme : la recherche par `userId` ne trouvait jamais sa ligne, si bien qu'il dépensait
  le budget sans qu'aucune entrée de statut l'enregistre — et pouvait donc le dépenser
  indéfiniment. La résolution suit désormais l'ordre de `canAccessConversation`, dont le succès
  garantit qu'une ligne de participant existe.
- **L'annonce ne part plus sur un rejeu.** Rediffuser un compte identique à toute la room ne dit
  rien à personne et ferait clignoter chez les pairs un événement qui ne correspond à aucune
  ouverture nouvelle.

La route emploie enfin `ROOMS.conversation()` et `SERVER_EVENTS.MESSAGE_CONSUMED` au lieu d'un nom
de room et d'un nom d'événement écrits à la main — même valeur, une source de moins à tenir à jour.
