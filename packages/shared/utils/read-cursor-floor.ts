/**
 * La DESCENTE ORDONNÉE du curseur de LECTURE — ses DEUX colonnes, dans
 * l'ordre, et rien d'autre (#19599, suivi de #19299).
 *
 * ─── CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ────────────────────────────
 *
 * Il porte la PREMIÈRE clause de la loi du plancher de lecture : *la POSITION
 * d'abord, l'HORLOGE en repli*. Il ne porte NI le cliquet d'horloge du gateway
 * (`readFloorOf`, § ci-dessous), NI le troisième rang `joinedAt` — qui
 * n'appartient pas au curseur mais au SITE qui compte (décision de #19299 sur
 * `unreadCountOfParticipant`, et elle vaut ici).
 *
 * | colonne | ce qu'elle dit |
 * |---|---|
 * | `lastReadMessageCreatedAt` | le `createdAt` du message que le curseur a ATTEINT — une POSITION |
 * | `lastReadAt` | l'heure à laquelle l'accusé de lecture a été TRAITÉ (`now`) — une HORLOGE |
 *
 * La position d'abord, parce qu'en mode exact le serveur pousse `lastReadAt` à
 * `now` même quand le curseur n'a franchi qu'un PRÉFIXE : la position reste
 * alors en arrière, et tout message vivant ENTRE les deux est un trou que
 * l'horloge exclut par construction. Le repli sur l'horloge, et non sur `null`,
 * parce qu'une ligne écrite avant l'introduction de la colonne n'a pas de
 * position : repartir de l'origine y re-litigerait un passé entier.
 *
 * ─── OÙ LA LOI VIT, ET POURQUOI CE MODULE EST DANS `shared` ─────────────────
 *
 * La question qu'instruit #19599, répondue ici plutôt que dans un journal.
 *
 * **La loi du gateway ne bouge pas.** `services/gateway/src/services/messaging/
 * readFloor.ts` garde `readFloorOf`, `READ_FLOOR_SELECT` et `ReadFloorCursor`,
 * côte à côte avec sa jumelle `deliveryFloor.ts` : ce qui a été partagé n'est
 * pas la loi, c'est sa première clause. Les jumelles restent donc adjacentes —
 * l'objection qui avait tenu cette consolidation hors de #19299 (« déplacer la
 * descente séparerait les jumelles ») ne porte plus sur ce découpage.
 *
 * **Ce module est dans `shared` parce que les DEUX COLONNES y sont déjà
 * déclarées** : elles traversent le fil (`ReadCursorBoundary`,
 * `packages/shared/types/conversation.ts`), et c'est là que le doc-comment de
 * `lastReadMessageCreatedAt` explique déjà pourquoi la position précède
 * l'horloge. Une descente vit où ses colonnes sont déclarées.
 *
 * **Seule la LECTURE traverse.** `deliveryFloorOf` ne compose pas ce module, et
 * ce n'est pas un oubli : le curseur de LIVRAISON ne sort jamais du serveur —
 * aucun client n'en descend les colonnes, donc il n'y a rien à partager. La
 * symétrie des deux jumelles est de STRUCTURE, pas de portée.
 *
 * ─── L'ARBITRAGE `??` CONTRE `min`, ET POURQUOI IL NE SE TRANSPOSE PAS ──────
 *
 * `readFloorOf` (gateway) ne rend PAS cette valeur : il la CLAMPE au minimum
 * des deux colonnes. Ce cliquet est une garde de NON-RÉGRESSION, pas une
 * correction : ses trois consommateurs étaient ancrés sur l'HORLOGE avant
 * #19299, et la position SEULE aurait pu rétrécir leur fenêtre sous ce qu'elle
 * couvrait — une régression introduite par le correctif lui-même.
 *
 * **Aucun lecteur de ce module n'a ce passé.** `firstUnreadBoundary` descend la
 * position d'abord depuis son origine (#7215) : le clamper au minimum
 * ABAISSERAIT son plancher, ce qui n'est pas neutre pour un SÉPARATEUR —
 * chaque message de l'intervalle `(horloge, position]` redeviendrait « non
 * lu » alors que la position, elle, affirme qu'il a été ATTEINT.
 *
 * Les deux formes ne diffèrent que sous `position > horloge` — impossible sur
 * donnée saine (un message est créé avant d'être lu), donc une dérive
 * d'horloge entre deux serveurs. Et là, la position reste la valeur
 * AUTORITATIVE de ce que le curseur a franchi : l'abaisser ferait remonter le
 * lecteur dans du déjà-lu sans qu'aucun non-lu ne soit en jeu. Le témoin de
 * dérive de `read-cursor-floor.test.ts` GÈLE ce verdict, et son jumeau de
 * `readFloor.test.ts` gèle le verdict opposé : un lot qui consoliderait les
 * deux en une seule forme fait tomber l'un des deux.
 *
 * ─── UNE SEULE GRAPHIE PAR LANGAGE ─────────────────────────────────────────
 *
 * L'idiome était retapé CINQ fois dans TROIS langages — ici, puis DEUX fois
 * dans chacun des deux miroirs natifs (`FirstUnreadBoundary.swift`,
 * `FirstUnreadBoundary.kt`), qui le recalculaient dans `resolve` ET dans leur
 * assembleur de candidats. Les miroirs ne peuvent pas importer ce module ;
 * ils n'en portent donc plus qu'UNE graphie chacun, et
 * `__tests__/read-cursor-floor-single-spelling.test.ts` tient l'inventaire à
 * VIDE : quand il tombe, la réparation est d'appeler la descente, jamais
 * d'ajouter une ligne d'inventaire.
 */

/**
 * Les deux colonnes du curseur de lecture. Elles sont REQUISES — nullables,
 * mais PRÉSENTES : c'est cette exigence, et non un commentaire, qui fait rougir
 * le compilateur sur un site qui ne tient que l'horloge. Même protection que
 * {@link ../../../services/gateway/src/services/messaging/readFloor.ReadFloorCursor},
 * portée au seul endroit que les clients peuvent atteindre.
 */
export type ReadCursorFloorSource = {
  readonly lastReadMessageCreatedAt: Date | null | undefined;
  readonly lastReadAt: Date | null | undefined;
};

/**
 * La borne BASSE de ce que le curseur de lecture a franchi, ou `null` pour
 * « aucune position connue » — ce que le site traduit ensuite par son propre
 * repli (`joinedAt`, l'origine de la conversation, un compte serveur).
 *
 * Ne JAMAIS retaper `lastReadMessageCreatedAt ?? lastReadAt` : la descente
 * exige de nommer les deux colonnes dans le bon ORDRE, et c'est exactement
 * l'inversion que trois lots ont retirée de la chaîne de livraison (#18701,
 * #18731, #19261) puis de celle de lecture (#19299).
 */
export const readCursorFloorOf = (
  cursor: ReadCursorFloorSource | null | undefined,
): Date | null => cursor?.lastReadMessageCreatedAt ?? cursor?.lastReadAt ?? null;
