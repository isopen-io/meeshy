---
"@meeshy/gateway": patch
---

Un participant sans compte voit enfin sa liste de conversations se retrier — et une conversation neuve y apparaître.

Le cycle précédent avait réuni **trois** copies de l'éventail d'accusés de lecture derrière
`emitToConversationParticipants`, en énonçant la règle qui les corrigeait toutes : un participant
est adressé par `userId ?? id`, parce que `AuthHandler` nomme la room personnelle d'une socket
anonyme d'après son `Participant.id`. Il laissait une piste, littérale : « la règle vaut pour tout
émetteur personnel, et rien ne garantit que les autres la respectent. À instruire par une recherche
sur `ROOMS.user(` plutôt que par déduction. »

La recherche en a trouvé **cinq** autres, et la plus lourde n'était pas un accusé de lecture.

## `conversation:updated` ne parvenait à aucun anonyme, sur aucun des trois chemins d'envoi

C'est le seul signal qui fait remonter une conversation en tête de liste, et le seul par lequel une
conversation **toute neuve** entre dans la liste d'un client déjà connecté. `message:new` ne suffit
pas : il n'atteint que les sockets déjà dans `conversation:<id>`, que le client sur sa liste a
justement quittée. Les trois émetteurs le sautaient de la même façon :

| chemin | émetteur |
|---|---|
| envoi WS | `MessageHandler.broadcastNewMessage` |
| envoi REST/ZMQ | `MeeshySocketIOManager._broadcastNewMessage` |
| édition / suppression | `emitConversationPreviewUpdate` |

Pour un invité de lien partagé — le mode d'entrée principal du produit — la liste des conversations
était donc **figée** : pas de re-tri à la réception d'un message, pas de rafraîchissement de l'aperçu
après une édition ou une suppression, et un fil créé après sa connexion n'apparaissait pas du tout,
jusqu'au prochain refetch manuel. `emitConversationPreviewUpdate` documentait même le manque comme
une intention (« anonymous participants are skipped, exactly as the send path does ») : la phrase
était exacte sur les deux moitiés, et fausse sur les deux.

## Deux copies de l'éventail d'accusés avaient survécu au regroupement

`POST /messages/:id/status` (quatrième copie verbatim, jamais recensée) et le rejeu de remise à la
reconnexion (`_emitDeliveryForDrainedMessages`) portaient encore le filtre sur `userId` seul. Un
expéditeur sans compte restait donc bloqué sur un unique tic « envoyé », y compris quand son
destinataire revenait en ligne et vidait sa file — le moment même où l'accusé existe.

## Correctif — `participantUserRooms`

Les deux familles d'émetteurs ne partagent pas une forme d'émission : les accusés **chaînent** la
room de conversation avec les rooms personnelles (livraison au plus une fois par socket), tandis que
`conversation:updated` n'adresse **que** les rooms personnelles — en doubler une copie vers la room
de conversation serait inutile pour qui regarde déjà le fil. Ce qu'elles ont en commun est la liste
de rooms, et c'est exactement la ligne que chaque copie ratait. Elle est donc extraite seule,
`participantUserRooms(participants, seed?)`, et `emitToConversationParticipants` s'appuie dessus.

Une garde s'y ajoute que les copies n'avaient pas : un participant ne portant **ni** `userId` **ni**
`id` ne nomme aucune room. Deux des sites corrigés ici sélectionnaient `{ userId: true }` seul ;
sans cette garde, la même erreur de `select` commise demain n'aurait plus rien sauté du tout — elle
aurait déversé le trafic de toutes les conversations dans l'unique room `user:undefined`.

Aucun changement de contrat client : les cinq sites émettent les mêmes événements avec les mêmes
charges utiles, à davantage de destinataires. Un participant enregistré est adressé exactement comme
avant.
