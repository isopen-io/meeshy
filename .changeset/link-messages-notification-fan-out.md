---
"@meeshy/gateway": patch
---

Un message envoyé par lien de partage notifie enfin ses destinataires — et un expéditeur
anonyme cesse d'être invisible partout.

Deux défauts distincts, la même racine.

**1. Le chemin de lien ne notifiait personne du tout.** `createMessageNotification`,
`createReplyNotification` et `createMentionNotificationsBatch` n'avaient qu'un appelant :
`MessageProcessor.triggerAllNotifications`, `private`, atteinte uniquement par
`handleMentionsAndNotifications` — `private` elle aussi. Les deux routes d'envoi par lien
(`POST /links/:identifier/messages` et son jumeau `/messages/auth`) contournent
`MessagingService.handleMessage`, donc `MessageProcessor` en entier : ni push APNs/FCM, ni
notification in-app, ni ligne `Notification`. Un destinataire qui n'avait pas l'application
au premier plan n'apprenait jamais qu'il avait reçu un message. Silence complet, pas une
dégradation. Cinquième cycle consécutif sur la même racine : une obligation destinataire sans
nom appelable est inatteignable.

**2. L'éventail se taisait pour tout expéditeur ANONYME, y compris sur le chemin nominal.**
`triggerAllNotifications` résolvait l'expéditeur par `user.findUnique({ id: senderId })` et
sortait en silence sur `null`. Un participant anonyme a `Participant.userId = null`, donc
`senderId` restait un `Participant.id` et la lecture ne rendait jamais rien : réponse,
mentions et messages réguliers étaient tous abandonnés. Le défaut valait aussi pour un
anonyme envoyant par socket `message:send` — il ne notifiait déjà personne en production. Le
même verrou était recopié une couche plus bas dans les trois créateurs de notification.

Correctif : une unité unique `notifyMessageRecipients`
(`services/messaging/messageNotificationFanOut.ts`), appelée par `MessageProcessor` comme par
les deux routes de lien. Sa résolution d'identité a trois branches et aucune impasse —
participant inscrit, participant anonyme (nommé par son `displayName`/`avatar`, la seule
identité qui existe pour lui), ou id déjà utilisateur (le participant synthétique de la
conversation globale `meeshy`). L'identité résolue descend jusqu'aux créateurs via
`senderProfile`, ce qui sert deux choses à la fois : nommer un acteur absent de `User`, et
supprimer une lecture `User` **par destinataire** sur le chemin le plus chaud du service.
`createMentionNotificationsBatch` voit ses paramètres `senderUsername`/`senderAvatar` —
qu'elle recevait sans jamais les lire — remplacés par ce profil.

Best-effort de bout en bout : l'unité ne lève jamais, reste hors du chemin de l'ACK, et une
panne de notification ne transforme pas un envoi réussi en 500.

Reste hors de portée et documenté : les mentions du chemin de lien, dont la donnée
(`Message.validatedMentions`) n'est écrite que par `MessageProcessor` — l'unité accepte donc
une liste de mentions vide sans que réponse ni message régulier n'en souffrent.
