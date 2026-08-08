# Cycle 18 — Un message envoyé par lien de partage ne notifie personne, et un expéditeur anonyme ne notifie personne nulle part

## Constat

Le cycle 17 a fermé la pastille de non-lus sur le chemin de lien, en énumérant sur la clé
« qu'est-ce que TOUT message committé doit à ses DESTINATAIRES ? ». Sa table listait six
obligations. Elle en oubliait une, et c'est la plus lourde : **la notification**.

| Obligation destinataire | Chemin WS | Chemin REST/ZMQ | Chemin lien |
|---|---|---|---|
| `message:new` / `link:message:new` (room live) | oui | oui | oui (cycle 15) |
| File hors ligne (rejeu à la reconnexion) | oui | oui | oui (cycle 15) |
| `conversation:unread-updated` (badge) | oui | oui | oui (cycle 17) |
| **Notification (push APNs/FCM + in-app + ligne DB)** | oui | oui | **non** |
| `conversation:updated` (aperçu + tri) | oui | oui | non — omission argumentée (cycle 15) |
| `mention:created` | oui | oui | non — la DONNÉE manque (cycle 17) |
| Accusé « delivered » auto | oui | oui | non — cf. Reste ouvert |

La leçon #1 du cycle 16 impose de relire un « reste ouvert » comme une hypothèse, jamais comme
un inventaire. Appliquée à la table du cycle 17 elle-même, elle produit cette ligne : les cinq
premières obligations sont des ÉVÉNEMENTS SOCKET, et l'énumération avait implicitement glissé
de « ce que le message doit à ses destinataires » vers « ce que le manager Socket.IO émet ».
La notification n'est pas un événement socket — c'est une ligne `Notification` en base, un push
APNs/FCM et un événement in-app — donc elle est tombée hors du champ de vision.

## Diagnostic

### D1 — un message envoyé par lien ne produit AUCUNE notification

`createMessageNotification` a exactement **un** appelant dans tout le service :
`MessageProcessor.triggerAllNotifications` (`services/messaging/MessageProcessor.ts:1148`),
`private`, atteinte uniquement par `handleMentionsAndNotifications` (`private`, `:881`),
elle-même appelée par `MessageProcessor.saveMessage` (`:657`). Idem pour
`createReplyNotification` et `createMentionNotificationsBatch`.

Les deux routes de lien de partage (`routes/links/messages.ts`) contournent
`MessagingService.handleMessage` — donc `MessageProcessor` en entier. Conséquence observable :
un message envoyé par lien de partage ne déclenche **ni push, ni notification in-app, ni ligne
`Notification`**. Un destinataire qui n'a pas l'application ouverte n'apprend jamais qu'il a
reçu un message. C'est le silence complet, pas une dégradation.

C'est la cinquième fois consécutive que la racine est la même — la formulation élargie de la
leçon #5 du cycle 17 : **toute obligation destinataire qui n'a pas de nom appelable est
inatteignable**. Ici elle est enfermée sous DEUX niveaux de `private`.

### D2 — et l'éventail, même atteint, se tait pour un expéditeur ANONYME

Extraire ne suffit pas : `triggerAllNotifications` sort en silence quand l'expéditeur n'a pas
de ligne `User`.

```ts
let senderUserId = data.senderId;                       // un Participant.id
const senderParticipant = await prisma.participant.findUnique({ where: { id: data.senderId } });
if (senderParticipant?.userId) senderUserId = senderParticipant.userId;   // null pour un anonyme
const [sender, conversation] = await Promise.all([
  prisma.user.findUnique({ where: { id: senderUserId } }),               // → null
  ...
]);
if (!sender || !conversation) return;                                    // ← tout s'arrête ici
```

Un participant anonyme a `userId: null` (`schema.prisma:497`). `senderUserId` reste donc le
`Participant.id`, et les espaces d'ObjectIds ne se recoupant jamais, la lecture `User` rend
`null`. L'éventail entier — réponse, mentions, message régulier — est abandonné.

Ce n'est pas un défaut du seul chemin de lien : **un anonyme qui envoie par le chemin nominal
(socket `message:send`, sa session étant authentifiée par `X-Session-Token`) ne notifie déjà
personne aujourd'hui.** Le défaut est en production, sur le chemin principal, pour toute la
population que les liens de partage servent.

Le même verrou existe une couche plus bas, recopié trois fois :
`createMessageNotification` (`:1278`), `createReplyNotification` (`:2643`) et
`createMentionNotification` (`:1399`) refont chacune `user.findUnique(senderId)` et rendent
`null` si rien. Trois copies de la même hypothèse « l'expéditeur est un utilisateur inscrit ».

### D3 — deux paramètres morts qui portaient déjà la réponse

`createMentionNotificationsBatch` reçoit `senderUsername` et `senderAvatar`
(`NotificationService.ts:1439-1440`) et **ne les lit jamais** : elle délègue à
`createMentionNotification`, qui recharge l'utilisateur. L'information nécessaire à servir un
acteur anonyme traversait déjà l'API — inutilisée.

## Plan
- [x] T1 — RED : `notifyMessageRecipients`, unité appelable de l'éventail de notifications
- [x] T2 — RED : résolution d'identité expéditeur à trois branches (inscrit / anonyme / id déjà utilisateur)
- [x] T3 — RED : `senderProfile` pré-résolu accepté par les trois créateurs de notification
- [x] T4 — GREEN : `services/messaging/messageNotificationFanOut.ts`
- [x] T5 — `MessageProcessor.triggerAllNotifications` délègue à l'unité
- [x] T6 — les deux routes de lien appellent l'unité
- [x] T7 — gates : suite gateway complète + `tsc --noEmit`
- [x] T8 — changeset + CHANGELOG + lessons
- [x] T9 — PR, CI vert, merge sur main

## Revue

### La clé d'énumération avait glissé, et c'est ça qui a caché la notification

Le cycle 17 énumérait « ce que TOUT message doit à ses DESTINATAIRES » et sa table listait six
lignes. Les six sont des **événements Socket.IO**. La clé annoncée était produit, la clé
réellement appliquée était technique : « qu'est-ce que le manager Socket.IO émet ». La
notification — ligne en base, push APNs/FCM, événement in-app — ne passe par aucun de ces
émetteurs, donc elle n'était pas dans le champ de vision, et son absence ne pouvait pas se
voir dans une table dont chaque ligne était un `SERVER_EVENTS.*`.

C'est plus grave que les cinq autres réunies : la room, la file hors ligne et la pastille ne
parlent qu'à un client **déjà ouvert**. La notification est le seul canal qui atteigne
quelqu'un qui ne regarde pas.

### Deux défauts, une racine — et le second n'apparaît qu'en essayant de corriger le premier

Extraire l'éventail aurait réparé la seule route de lien AUTHENTIFIÉE. La route anonyme —
celle qui porte tout le trafic pour lequel les liens de partage existent — serait restée
muette, parce que l'éventail lui-même bute sur `if (!sender) return` dès que l'expéditeur n'a
pas de ligne `User`. On ne le découvre pas en lisant le site d'appel : il faut lire le corps
de ce qu'on s'apprête à rendre appelable. **Rendre une unité atteignable ne suffit pas si elle
porte une hypothèse sur qui l'appelle.**

Et ce second défaut n'était pas un défaut du chemin de lien : il était déjà en production sur
le chemin nominal. Un anonyme envoyant par socket ne notifiait personne. La correction
dépasse donc largement la route qui l'a révélée.

### `senderProfile` n'est pas du plomberie, c'est la suppression de N lectures

Les trois créateurs rechargeaient l'expéditeur par destinataire, alors que l'appelant venait
de le résoudre une fois pour tout l'éventail. Le paramètre qui rend un acteur anonyme
nommable est exactement celui qui supprime ces lectures — la correction de correctness et
l'optimisation sont le même changement, ce qui est le signe qu'on a trouvé le bon endroit.

### Deux paramètres morts portaient déjà la réponse

`createMentionNotificationsBatch` recevait `senderUsername` et `senderAvatar` et ne les lisait
jamais. L'information nécessaire à servir un acteur sans compte traversait l'API depuis
toujours, inutilisée, pendant que la méthode appelée rechargeait l'utilisateur. Un paramètre
mort n'est pas seulement du bruit : c'est parfois la trace d'une intention qu'une refonte a
perdue en route.

### Reste ouvert après ce cycle

- **`mention:created` et les mentions du chemin de lien** — inchangé depuis le cycle 17 : ce
  n'est pas l'émission qui manque mais la DONNÉE. `Message.validatedMentions` n'est écrit que
  par `MessageProcessor.processMentionsInDB` (`services/messaging/MessageProcessor.ts`) après
  extraction, résolution des usernames, validation des permissions et création des lignes
  `Mention`. L'unité de ce cycle accepte `validatedMentionUserIds` optionnel précisément pour
  que le jour où l'extraction existera sur ce chemin, le câblage soit un argument et non une
  réécriture.
- **Accusé « delivered » automatique** — `MessageHandler.autoDeliverToOnlineRecipients` est
  publique et prend un `Message` Prisma complet, que les routes de lien ont en main ; elle
  n'est atteignable que depuis `MessageHandler`, et `LinkMessageManager` ne l'expose pas.
  Conséquence observable inchangée : l'indicateur de l'expéditeur d'un message par lien ne
  passe jamais de « envoyé » à « remis ». Noter que sa sélection de destinataires
  (`!!p.userId && connectedUsers.has(p.userId)`) exclut par construction les participants
  anonymes — le câblage devra décider si c'est voulu.
- **`createMentionNotification` pour un acteur anonyme sur le chemin NOMINAL** — servi par ce
  cycle (le lot transmet `senderProfile`), mais aucun appelant ne lui passe encore de mentions
  émises par un anonyme, l'extraction ne tournant que sur `MessageProcessor`. Verrouillé par
  test, pas encore exercé en production.
- Aucun client iOS n'écoute `link:message:new` — les conversations par lien restent une
  fonctionnalité web (hérité du cycle 15).
- Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio (hérité du cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
