## Le curseur de livraison est le PRÉFIXE CONTIGU de la remise (2026-11-17, #18731)

**Contexte**

#18701 a corrigé ce que la livraison **SERT** : le repli curseur ne confronte
plus une horloge MURALE à une POSITION, et passé `EXACT_READ_TRACKING_SINCE` il
n'est plus consenti du tout. Ce qu'elle **ÉCRIT** n'avait pas changé, et sa note
de clôture le disait : « insuffisant seul, un trou ANTÉRIEUR au dernier livré
reste sous la borne ».

L'asymétrie n'était pas entre deux modules : elle était **interne à
`markMessagesAsReceived`, entre deux écritures du même appel**.

| écriture | périmètre, depuis #18614 |
|---|---|
| `freezeMessageStatus({ messageIds })` | l'ensemble EXACT des messages remis |
| `_advanceCursor({ messageId })` | le plus RÉCENT de l'accusé, sans regarder ce qu'il franchit |

Le gel était donc déjà exact ; le curseur affirmait un préfixe qu'il n'avait pas
vérifié. Et `resolveReceivedAt` lit le curseur **en repli du gel** : pour un
message sans entrée figée, c'est l'approximation qui décidait.

Le scénario n'exige **aucune panne** : le `LTRIM` à 500 de `RedisDeliveryQueue`
évince les arrivées les plus anciennes AVANT le drain, qui ne les voit jamais.
M1 (10:00) est évincé, M2 (10:05) part, drain à 11:00 ⇒ le curseur porte la
position de M2, POSTÉRIEURE à M1. **Le trou est sous la borne, quelle que soit
la borne choisie** — horloge, position, bascule. Seule la contiguïté le voit.

**Décision**

En périmètre EXACT — quand l'appelant NOMME ce qu'il a remis, c'est-à-dire le
rejeu hors ligne et lui seul — le curseur de livraison n'avance plus que
jusqu'au **dernier message du préfixe contigu des entrées FIGÉES**. C'est la
symétrie que la lecture avait déjà (`_computeExactReadCursorTarget`,
`computeContiguousPrefix`, `EXACT_CURSOR_SCAN_LIMIT`) et que la livraison
n'avait pas.

Trois conséquences qui sont le lot, et pas des détails d'implémentation :

1. **L'ordre s'inverse : le gel d'abord, le curseur ensuite.** `if (!advanced)
   return 0` faisait dépendre l'écriture DURABLE du verdict de fraîcheur de son
   INDEX — un accusé que la garde écarte ne gravait rien, y compris les
   messages qu'il était le seul à nommer. Le gel est l'autorité que la lecture
   consulte en premier ; le curseur n'en est que l'index rapide.

2. **Ce qui PROUVE est l'entrée figée, jamais la liste rapportée.** Le balayage
   tourne APRÈS le gel et interroge la base. Deux raisons, et aucune n'est
   théorique : une liste déclarée est un sous-ensemble strict du réel (un
   message remis par un autre chemin porte son entrée sans figurer dans la
   liste) ; et le gel est best-effort — il rend `0` sans jeter — si bien que
   faire confiance à la liste ferait avancer le curseur sur une preuve qui n'a
   pas été écrite. **Fail-CLOSED sur l'index, jamais sur la donnée durable.**

3. **La fenêtre s'ancre sur la POSITION, pas sur l'horloge murale.**
   `lastDeliveredMessageCreatedAt` quand le curseur la porte, `lastDeliveredAt`
   en repli. Ancrer sur l'horloge rouvrirait exactement le trou qu'on ferme :
   M1 (10:00) est sous un `lastDeliveredAt` de 11:00. Le repli sur l'horloge
   pour une ligne héritée fait démarrer la fenêtre trop TARD, donc ne re-litige
   pas un passé dont le repli curseur rend déjà compte.

Les quatre appelants EN LIGNE (`receipts.ts`, `messages-list.ts`,
`autoDeliverToOnlineRecipients`, la cascade « lu ⇒ remis ») gardent la FENÊTRE,
inchangés : chez eux, tout ce qui précède EST arrivé, et le discriminant reste
`options?.messageIds` — la distinction `bridgeComputed` / `bridgeNotComputed`,
jamais une longueur.

**Ce que la décision NE tranche PAS**

- **Un curseur qui n'avance plus sert une réponse plus PAUVRE, jamais FAUSSE.**
  Quand le trou est en tête de fenêtre, le curseur reste en place et les
  entrées figées répondent seules — c'est le régime POST-bascule, obtenu sans
  la bascule. Il est monotone : rien de ce qu'il affirmait déjà n'est retiré, et
  le chemin EN LIGNE le fait repartir dès que le lecteur revient dans le fil.
- **Un trou qui ne se referme pas se repaie à chaque drain** : la fenêtre
  repart de la même position, bornée à 500. Le coût est deux requêtes par
  (participant, conversation) sur le chemin de reconnexion, et seulement en
  périmètre exact.
- **Un participant SANS curseur balaie depuis le début de la conversation.** Les
  messages antérieurs à son arrivée y sont des trous permanents, donc son
  curseur de livraison ne démarre pas par le drain. Il démarre par le chemin EN
  LIGNE, qui est le chemin nominal de sa première réception. Ancrer sur
  `Participant.joinedAt` ou sur le plancher d'historique (`historyFloorFor`)
  coûterait une lecture de plus et une dépendance à une loi d'accès
  fail-closed ; ce n'est pas ce que l'issue demande.
- **La valeur 500 du plafond de la file et sa politique d'éviction ne sont pas
  touchées.** #18733 a posé la trace qui permettra de les instruire ; personne
  n'a encore la mesure.
- **L'avance et le gel ne sont toujours pas dans une transaction**, et ce lot ne
  le prétend pas. Il en réduit la portée : un processus qui meurt entre les deux
  laisse désormais le GEL écrit et le curseur en retard — l'inverse exact de
  l'ancien ordre, où il laissait un curseur en avance sans entrées.

**Preuve**

`src/__tests__/unit/services/MessageReadStatusService.contiguousDeliveryCursor.test.ts`
— 10 témoins, dont celui que l'issue exige (trou ANTÉRIEUR au dernier livré,
statut SERVI négatif, bascule NON armée), prouvés rouges avant implémentation
et rouges sous sept mutations : ancrage sur l'horloge, avance jusqu'au message
rapporté, preuve figée non exigée, balayage non borné, messages du lecteur
inclus, contiguïté remplacée par « le plus récent prouvé », et le rétablissement
de l'ancien ordre.
