---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

Un message envoyé par lien de partage n'arrivait en temps réel sur aucun client mobile.

`link:message:new` n'a jamais eu qu'un seul auditeur : le web. iOS
(`MeeshySDK/Sockets/MessageSocketManager.swift`) et Android
(`sdk-core/socket/MessageSocketManager.kt`) n'enregistrent qu'un listener de création,
`message:new`. Or l'envoi par lien est le **seul** transport d'envoi dont dispose un participant
anonyme : un invité qui écrivait dans une conversation partagée n'apparaissait donc chez aucun
membre iOS ou Android — ni en direct par la room, ni au reconnect par la file hors ligne, qui
rejouait ce même event unique. Le message ne surgissait qu'au prochain refetch complet, que rien
ne déclenchait.

Les deux diffuseurs — la room live (`broadcastLinkMessage`) et le rejeu hors ligne
(`MeeshySocketIOManager._drainPendingMessages`) — passent désormais par un seul point d'appel
public, `linkMessageEmissions`, qui met les **deux** events sur le fil, chacun dans sa forme :
`link:message:new` garde son enveloppe `{ message }`, `message:new` transporte le message
lui-même. Rejouer l'enveloppe sous `message:new` aurait donné aux clients mobiles un payload sans
`conversationId` au premier niveau, donc non routable.

Additif, jamais substitutif : le web continue de recevoir l'event qu'il écoute déjà. Les deux
copies portent le même `id` et les deux gestionnaires web dédupent dessus, donc le second arrivé
est un no-op quel que soit l'ordre ; la pastille de non-lus ne se déduit d'aucun des deux (valeur
absolue de `conversation:unread-updated`), il n'y a rien à double-compter.
