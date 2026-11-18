## 2026-11-18 : La DESCENTE du curseur de lecture est partagée ; le cliquet d'horloge du gateway ne l'est pas (#19599)

**Statut** : Accepté (lot #19599, suivi de #19299).

**Contexte** : #19299 a ramené cinq sites du gateway sur une loi du plancher de lecture (`services/gateway/src/services/messaging/readFloor.ts`) et a laissé une copie dans `packages/shared/utils/first-unread.ts`, hors de portée du TYPE qui est la protection de cette loi. Le relevé du 2026-11-18 mesure que cette « sixième copie » en était **cinq, dans trois langages** : `first-unread.ts` (1), `FirstUnreadBoundary.swift` (2) et `FirstUnreadBoundary.kt` (2) — les deux miroirs natifs recalculant l'idiome dans `resolve` **et** dans leur assembleur de candidats, dans la même unité.

Trois questions étaient à instruire avant la première ligne, et l'issue les posait : où la loi vit-elle, `min` ou `??` pour un résolveur client, et que fait-on du troisième rang `joinedAt`.

**Décisions** :

- **Ce qui est partagé est la PREMIÈRE CLAUSE de la loi, pas la loi.** `packages/shared/utils/read-cursor-floor.ts` porte `readCursorFloorOf()` — la descente ordonnée des deux colonnes du curseur, la POSITION (`lastReadMessageCreatedAt`) d'abord, l'HORLOGE (`lastReadAt`) en repli. Elle vit dans `shared` parce que les deux colonnes y sont **déjà déclarées** : elles traversent le fil (`ReadCursorBoundary`, `types/conversation.ts`), et c'est là que le doc-comment de `lastReadMessageCreatedAt` explique déjà pourquoi la position précède l'horloge. Une descente vit où ses colonnes sont déclarées.

- **La loi du gateway ne bouge pas.** `readFloor.ts` garde `readFloorOf`, `READ_FLOOR_SELECT` et `ReadFloorCursor`, côte à côte avec sa jumelle `deliveryFloor.ts` — l'objection qui avait tenu cette consolidation hors de #19299 (« déplacer la descente séparerait les jumelles ») ne porte plus sur ce découpage. `readFloorOf` **compose** la descente partagée et ne porte plus que son cliquet d'horloge (`clampToClock`).

- **Le `min` du gateway est un cliquet de NON-RÉGRESSION, et il ne se transpose pas.** Ses trois consommateurs étaient ancrés sur l'HORLOGE avant #19299 : la position seule aurait pu rétrécir leur fenêtre sous ce qu'elle couvrait, une régression introduite par le correctif lui-même. **Aucun lecteur de la descente partagée n'a ce passé** — `firstUnreadBoundary` descend la position d'abord depuis son origine (#7215). Les deux formes ne diffèrent que sous `position > horloge`, impossible sur donnée saine, donc une dérive d'horloge entre deux serveurs ; et là, la position reste la valeur AUTORITATIVE de ce que le curseur a franchi. L'abaisser ferait redevenir « non lu » chaque message de `(horloge, position]` : un séparateur qui fait remonter le lecteur dans du déjà-lu, sans qu'aucun non-lu ne soit en jeu. **Les clients gardent donc `??`.**

- **Seule la LECTURE traverse.** `deliveryFloorOf` ne compose pas le module partagé, et ce n'est pas un oubli : le curseur de LIVRAISON ne sort jamais du serveur, aucun client n'en descend les colonnes. La symétrie des deux jumelles est de STRUCTURE, pas de portée.

- **Le troisième rang `joinedAt` reste au SITE.** Il n'appartient pas au curseur, il appartient au comptage — décision de #19299 sur `unreadCountOfParticipant`, et elle vaut ici.

**Conséquences** :

- Les deux verdicts opposés sont gelés par deux témoins qui se répondent : `readFloor.test.ts` (« prend le MINIMUM sous une dérive d'horloge ») et `read-cursor-floor.test.ts` (« garde la POSITION sous une dérive d'horloge »). Un lot qui consoliderait les deux formes en une fait tomber l'un des deux. Les deux miroirs natifs portent le même témoin.
- Les miroirs Swift et Kotlin ne peuvent pas importer la loi TS : ils n'en portent plus qu'**une** graphie chacun, dans un helper que leur propre `resolve` appelle. Cliquet : `packages/shared/utils/read-cursor-floor-single-spelling.test.ts`, inventaire des graphies tolérées **VIDE**, commentaires dépouillés. Quand il tombe, la réparation est d'appeler la descente du langage, jamais d'ajouter une ligne d'inventaire.
- Aucun comportement de production ne change : les deux formes coïncident sur toute donnée saine, et l'arbitrage retenu est celui déjà en place des deux côtés.
