# Le statut SERVI de la livraison suit la bascule du suivi exact (2026-11-15, #18701)

## Contexte

`resolveReceivedAt` arbitrait entre trois sources, dans cet ordre :

```ts
frozenReceivedAt ?? frozenDeliveredAt ?? cursorDeliveredAt ?? readAt
```

et les quatre lecteurs de statut (`getMessageReadStatus`,
`getConversationReadStatuses`, `getMessageStatusDetails`,
`getLatestMessageSummary`) dérivaient chacun le troisième terme à la main :

```ts
cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
  ? cursor.lastDeliveredAt
  : null;
```

Or `ConversationReadCursor.lastDeliveredAt` est posé à `now` par
`_advanceCursor` : **c'est l'heure à laquelle un accusé a été TRAITÉ**, jamais
la position du dernier message réellement livré. La comparer à
`message.createdAt` confronte une horloge MURALE à une POSITION, et le verdict
est POSITIF pour tout message antérieur au traitement.

## Pourquoi c'est devenu faux

La prémisse du lot du 2026-07-24 — « Livré = récupéré », donc « tout message
récupéré par le client a bien été livré » — était vraie tant que le gel était
SUR-INCLUSIF : `freezeMessageStatus` gravait une entrée pour tout message de la
fenêtre, livré ou non, et le repli curseur ne servait que des lignes héritées.

#18614 a rétréci le gel aux messages **réellement** livrés. Ce qui est GRAVÉ est
devenu juste — et c'est exactement ce qui a fait tomber les autres sur le repli.
Deux déclencheurs, dont le second n'exige **aucune panne** :

- une émission qui lève pendant le drain ;
- le plafond de 500 de `RedisDeliveryQueue` (`LTRIM`), dont les arrivées
  évincées ne sont jamais drainées mais restent dans la fenêtre.

Mesuré : M1 (10:00) évincé, M2 (10:05) livré, drain à 11:00 ⇒ curseur à 11:00 ⇒
`11:00 >= 10:00` ⇒ **l'auteur de M1 voit ✓✓ pour un message que personne n'a
reçu**. Et `_emitDeliveryForDrainedMessages` pousse `getLatestMessageSummary`
dans `READ_STATUS_UPDATED` douze lignes après avoir refusé d'écrire la ligne :
le drain refuse la livraison, puis annonce la remise, dans le même tour de
boucle.

## Décision

**La livraison suit la discipline que la lecture a reçue le 2026-07-24** :
passé `EXACT_READ_TRACKING_SINCE`, l'absence de gel VEUT DIRE l'absence de
livraison. Le repli curseur n'est plus consenti que pour les messages
**antérieurs** à la bascule — eux n'ont jamais eu l'occasion d'être gelés, et
les en priver les ferait tous basculer en « jamais remis ».

Site unique : `resolveCursorDeliveredAt` (`utils/read-exactness.ts`), appelée
par les quatre lecteurs. La borne au message est conservée telle quelle.

Ce qui ne change pas :

- **le gel prime toujours**, dans les deux colonnes ;
- **la lecture reste le dernier repli** de la réception (« on ne lit pas ce
  qu'on n'a pas reçu »), et elle est elle-même gelée passé la bascule, donc
  exacte — l'escalade « `readCount > deliveredCount` deviendrait atteignable »
  a été mesurée FAUSSE dans #18701 et le reste ici ;
- **`cutover: null` conserve le comportement historique à l'identique.** La
  bascule s'arme par la composition (staging et production : `2026-09-22`), pas
  par le fait de livrer ce code.

## Ce que la décision COÛTE, et pourquoi c'est le bon sens de l'erreur

Les deux sites qui avancent le curseur de livraison figent dans le même
mouvement, mais **hors transaction**. Un processus qui meurt entre l'avance et
le gel laisse un curseur en avance sans entrées, et ces messages-là seront
désormais servis « non remis » — `freezeMessageStatus` partant de
`since: prevDeliveredAt`, le trou ne se rattrape pas.

C'est assumé : **une coche manquante se rattrape, une coche qui ment ne se
rattrape pas.** Un faux « remis » est une affirmation que le produit fait à
l'auteur sur quelqu'un d'autre ; un faux « non remis » est une réserve sur
nous-mêmes. Signal et WhatsApp penchent du même côté.

## Ce que la décision NE tranche PAS

Le repli reste, **avant la bascule**, borné par l'horloge murale, et un TROU
ANTÉRIEUR au dernier message livré reste couvert même après elle quand le
message est pré-bascule. Faire du curseur le **préfixe CONTIGU** de la livraison
(ce que `computeContiguousReadPrefix` fait déjà de la lecture) est le lot
suivant, et il porte sur l'ÉCRITURE, pas sur la lecture : il est consigné en
**#18731** plutôt que bâclé ici.

## Gardes

| garde | ce qu'elle tient |
|---|---|
| `CursorDeliveredAt` (type marqué) | passer `cursor.lastDeliveredAt` brut à `resolveReceivedAt` **ne compile pas** (`TS2322`, mesuré) |
| `delivery-cursor-fallback-sweep.test.ts` | aucun site de production ne redérive le repli à la main — la porte qu'un type ne peut pas fermer, celle qui sert un AUTRE champ |
| `MessageReadStatusService.servedDeliveryExactness.test.ts` | le statut **SERVI** des quatre lecteurs après un drain à émission PARTIELLE |

Le cliquet de type ferme la porte ; le balayage ferme le contournement. Les deux
sont nécessaires : `getMessageStatusDetails` dérivait le repli pour servir
`deliveredAt`, un champ qui ne passe par aucune des deux fonctions arbitres et
qui gouverne le filtre « delivered ». C'est par là que le défaut voyageait à
côté de celui qu'on corrigeait.
