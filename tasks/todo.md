# Cycle 19 — La coche d'un message par lien ne bouge jamais, et l'accusé de livraison ne voit pas les anonymes

Suivi direct du premier point laissé ouvert par le cycle 18 :
« **Accusé "delivered" automatique** — `MessageHandler.autoDeliverToOnlineRecipients` est
publique et prend un `Message` Prisma complet, que les routes de lien ont en main ; elle n'est
atteignable que depuis `MessageHandler`, et `LinkMessageManager` ne l'expose pas. Conséquence
observable : l'indicateur de l'expéditeur d'un message par lien ne passe jamais de "envoyé" à
"remis". Noter que sa sélection de destinataires (`!!p.userId && connectedUsers.has(p.userId)`)
exclut par construction les participants anonymes — le câblage devra décider si c'est voulu. »

Vérifié : réel, et la parenthèse était le vrai sujet. Câbler l'unité sans la corriger aurait
produit un accusé qui, sur une conversation par lien, ne peut structurellement rien acquitter.

## D1 (racine) — l'unité existe, publique, et aucune route ne peut l'appeler

`autoDeliverToOnlineRecipients` marque le message `received` pour chaque destinataire connecté
puis émet le `read-status:updated` consolidé — le SEUL signal qui fasse passer la coche de
l'expéditeur de « envoyé » à « remis ». Elle est déjà `public` et déjà partagée par les deux
transports nominaux (`broadcastNewMessage` côté WS, `_broadcastNewMessage` côté REST/ZMQ).

Mais c'est une **méthode de `MessageHandler`** : elle a besoin de `io`, `connectedUsers`, du
service de statut de lecture et de celui de confidentialité. Une route n'en voit aucun.
`public` ne veut pas dire atteignable — c'est la nuance que les cycles 15 à 18 documentaient
sur des méthodes `private`, et qui se rejoue ici sur une méthode qui ne l'est pas.

Portée : les deux routes de lien. Le lien de partage étant le seul transport d'envoi dont
dispose un participant anonyme, tout ce trafic produisait une coche morte.

## D2 (même famille, plus large) — la sonde de présence ne peut pas être vraie pour un anonyme

```
!this._isSender(p, senderId) && !!p.userId && this.connectedUsers.has(p.userId)
```

`AuthHandler._registerUser` reçoit `user.id` pour un inscrit et **`participant.id` pour un
anonyme** — la seule identité qu'il possède, n'ayant pas de ligne `User`. Le prédicat
ci-dessus ne peut donc jamais être vrai pour un anonyme : exclusion par **construction**, pas
par circonstance. Rien dans la lecture du prédicat ne le signale ; il faut aller lire sous
quelle clé la carte a été remplie.

Ce n'est pas neutre pour l'expéditeur. `getLatestMessageSummary` compte TOUT participant actif
par `Participant.id` dans `totalMembers`. Un anonyme siégeant au dénominateur et inatteignable
au numérateur rend « remis à tous » **impossible pour la conversation entière** — soit la forme
de toute conversation ouverte par lien. Et le défaut vaut déjà sur le chemin nominal : un
anonyme connecté par socket ne renvoyait aucun accusé en production.

## D3 (corollaire) — les préférences se lisaient sous une clé qui n'existe pas

`getPreferencesForUsers([{ id, isAnonymous }])` sert les défauts sans requête dès que
`isAnonymous`. L'appel déclarait `isAnonymous: false` pour tout le monde ; inclure les anonymes
sans le corriger aurait envoyé un `Participant.id` à `fetchManyFromDatabase` comme s'il
s'agissait d'un `User.id` — une requête payée pour rien, dont le vide serait mis en cache
pendant 5 min sous un id qui n'est pas un utilisateur.

## Plan
- [x] T1 — RED : un anonyme connecté est marqué reçu (`markMessagesAsReceived` sur son `Participant.id`)
- [x] T2 — RED : ses préférences sont résolues avec `isAnonymous: true`
- [x] T3 — RED : la charge utile diffusée porte `userId: null`, et aucune user room n'est ciblée pour lui
- [x] T4 — verrous : anonyme déconnecté hors du lot, expéditeur anonyme exclu de son propre accusé (verts avant ET après)
- [x] T5 — GREEN : `_presenceKey` (= `userId ?? id`) pour la présence ET les préférences
- [x] T6 — paramètre ramené à `{ id, senderId }` (les deux seuls champs lus)
- [x] T7 — RED : les deux routes de lien acquittent la livraison (`links-messages.test.ts`)
- [x] T8 — GREEN : quatrième obligation dans `broadcastLinkMessage` + relais public du manager
- [x] T9 — verrous : les quatre canaux mutuellement indépendants, aucune panne ne quitte le 201
- [x] T10 — `ReadStatusUpdatedEventData.userId: string | null` + note iOS
- [x] T11 — gates : suite gateway 599/599 (15 570 tests), `tsc --noEmit` propre
- [x] T12 — changeset + CHANGELOG + ce relevé

## Revue

### « Public » n'est pas « atteignable », et c'est une racine distincte de celle des cycles 15-18

Les quatre cycles précédents butaient sur des méthodes `private`. Celui-ci bute sur une méthode
`public`, documentée comme « source unique partagée par les DEUX émetteurs ». Le mot *deux*
était la trace du défaut : il y en a trois. Ce qui la rendait inatteignable n'est pas sa
visibilité mais ses **dépendances** — elle vit sur l'objet qui détient `io` et `connectedUsers`,
et une route ne détient ni l'un ni l'autre. Le remède n'est donc pas d'élargir une visibilité
mais de poser un relais là où les dépendances existent déjà : un passe-plat public sur le
manager, qui délègue au lieu de ré-implémenter. Trois transports qui émettraient chacun leur
accusé dériveraient en silence — c'est exactement ce que le passe-plat interdit.

### Le paramètre était la moitié du verrou

L'unité demandait un `Message` Prisma complet et n'en lisait que `id` et `senderId`. Une route
de lien ne construit pas cette entité : le contrat exigeait, pour être honoré, un objet que
l'appelant légitime n'a pas. Ramené aux deux champs lus, il devient appelable par construction.
Même forme et même raison que `PostSaveMessage` au cycle 16 — quand une unité est inatteignable,
regarder ce qu'elle **exige** avant de regarder qui l'expose.

### La parenthèse du cycle 18 valait plus que la ligne principale

Le point ouvert nommait D1 et signalait D2 entre parenthèses, « le câblage devra décider si
c'est voulu ». La décision se tranche seule dès qu'on regarde le dénominateur :
`getLatestMessageSummary` compte les anonymes dans `totalMembers`. Les exclure du numérateur
n'est pas un arbitrage produit, c'est une incohérence interne — le résumé promet un rapport
dont il rend le numérateur inatteignable. Il n'y avait rien à décider, seulement à voir.

### `userId: null` n'est pas un élargissement de contrat, c'est une déclaration devenue vraie

Le type partagé annonçait `userId: string`. Aucun émetteur ne pouvait le garantir dès que
l'acteur est anonyme — le champ était déjà nullable en fait, et seul le type l'ignorait. iOS le
décode en `String?` depuis toujours et le web ne le lit pas : la déclaration rattrape la
réalité, sans qu'un seul client ait à changer. Le gate `userId == currentUserId` de la synchro
multi-appareils garde le bon comportement — `null` ne correspond à personne, ce qui est
exactement ce qu'on veut d'un acteur qui n'est pas un utilisateur.

Vérification par mutation (leçon 2026-07-31 #5) : les 5 tests portants ont été vus ROUGES avant
le correctif (3 sur l'unité, 2 sur les routes). Les verrous — anonyme déconnecté, expéditeur
anonyme, résilience des quatre canaux — sont verts avant ET après : c'est leur rôle, interdire
au correctif d'élargir le lot ou de raccourcir le chemin du 201.

### Reste ouvert après ce cycle

- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on
  vient d'acquitter.** L'accusé émis porte donc un `summary` qui décrit `latestMessage`, ce qui
  est correct tant que le message acquitté EST le dernier — vrai sur les trois transports au
  moment où l'accusé part. Deux envois quasi simultanés dans la même conversation peuvent
  toutefois faire décrire au premier accusé le second message. Inchangé par ce cycle (le
  chemin de lien hérite du comportement des deux transports nominaux), relevé pour mémoire.
  À noter que la déduplication 2 s de `markMessagesAsReceived` ne joue aucun rôle ici : sa clé
  inclut le `messageId` (`${participantId}:${conversationId}:received:${messageId}`), donc deux
  messages distincts ne se masquent jamais.
- **`mention:created` et les mentions du chemin de lien** — inchangé depuis le cycle 17 : ce
  n'est pas l'émission qui manque mais la DONNÉE. `Message.validatedMentions` n'est écrit que
  par `MessageProcessor.processMentionsInDB`. `notifyMessageRecipients` accepte déjà
  `validatedMentionUserIds` pour que le câblage soit un argument le jour venu.
- **Aucun client iOS n'écoute `link:message:new`** — les conversations par lien restent une
  fonctionnalité web (hérité du cycle 15). L'accusé de ce cycle passe, lui, par
  `read-status:updated`, que iOS écoute — donc la coche avance pour un auteur iOS dont le
  message est parti par une route de lien.
- **Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio** (cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
