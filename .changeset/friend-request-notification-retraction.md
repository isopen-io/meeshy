---
'@meeshy/gateway': patch
---

Supprimer une demande d'amitié laissait sa notification derrière, sans destination.

`DELETE /friend-requests/:id` retire la ligne `FriendRequest` **inconditionnellement** — que
l'expéditeur annule, ou que le destinataire écarte sans répondre. Il émettait bien
`friend_request:cancelled` à l'autre partie pour que sa liste d'attente s'invalide, mais il ne
touchait pas la seule chose durable que la demande avait produite : la notification
« X vous a envoyé une demande d'amitié », écrite par `createFriendRequestNotification` dans l'inbox
du destinataire.

Rien ne l'en retirait. `Notification.context` est un blob JSON, pas une clé étrangère : aucun
`onDelete: Cascade` ne peut se déclencher sur `context.friendRequestId`. Et son unique voie de
consommation — `markFriendRequestNotificationsAsRead`, appelée par la route soeur `PATCH` — devient
inatteignable au moment même où la ligne part : on ne peut plus répondre à une demande qui n'existe
plus. La notification restait donc **non lue indéfiniment**, à compter dans la cloche et dans le
badge, avec un `metadata.action: accept_or_reject_contact` qui n'ouvre plus qu'un écran de demande
répondant 404.

Quatrième occurrence du même mécanisme après les `TrackingLink`, les `Mention` et les
`Notification` d'un message rappelé : une ligne dénormalisée survit au retrait de son référent
parce que le retrait ne l'a jamais nommée.

**Retrait, pas marquage** — et c'est ce qui distingue cette route de sa voisine. Répondre
(accept/reject) laisse la ligne `FriendRequest` en place : la notification est *consommée*, donc
lue. Supprimer emporte la ligne : la notification n'a plus rien à afficher **et** rien où mener.
Même arbitrage, pour la même raison, que le rappel d'un message (`retractMessageNotifications`) — et
même geste, le seul que les clients savent déjà recevoir (`notification:deleted`, écouté par le web
et par le SDK iOS), doublé d'un `notification:counts` sans lequel la cloche resterait sur un
compteur incluant des lignes que le serveur vient de supprimer.

Trois conséquences du caractère inconditionnel de la suppression, chacune verrouillée par un test :

- **Aucun filtre `isRead`**, seule différence de prédicat avec le marquage. Une notification déjà
  lue est tout aussi morte qu'une non lue ; la laisser garderait dans la liste une ligne sans
  destination.
- **Le destinataire est toujours `receiverId`**, quel que soit celui des deux qui a appelé la
  route : `createFriendRequestNotification` ne notifie que lui. Le scope `userId` reste la garde
  anti-IDOR que porte déjà le marquage.
- **`context.friendRequestId` n'appartient qu'à `friend_request`** — le `friend_accepted` de
  l'expéditeur porte `context.conversationId`, jamais cette clé, donc le retrait ne peut pas
  l'emporter au passage.

La lecture passe par `$runCommandRaw` pour la raison déjà établie par le marquage (Prisma ne filtre
pas les chemins JSON sur MongoDB), mais la suppression porte sur les ids **relus**, pas sur le
prédicat : l'ensemble supprimé et l'ensemble annoncé sont alors identiques par construction, et
aucune ligne ne peut disparaître sans son `notification:deleted`. `singleBatch` ferme le curseur
côté serveur plutôt que de le laisser ouvert.

L'écriture ne dépend pas du câblage socket et l'échec n'est jamais fatal : la suppression est déjà
committée quand le retrait s'exécute, et un retrait qui échoue ne doit pas transformer une
suppression réussie en 500 — le test le verrouille, y compris sur le fait que le signal temps réel à
l'autre partie n'est pas emporté par cet échec.

Couvert (RED→GREEN, rouges observés sur les deux surfaces) par 6 tests neufs sur le service et 3 sur
la route, dont un témoin d'ordonnancement : l'annonce vient **après** l'écriture durable, sans quoi
les compteurs qu'elle recalcule liraient la base d'avant le retrait.
