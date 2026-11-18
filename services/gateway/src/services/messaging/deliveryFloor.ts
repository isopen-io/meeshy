/**
 * Le PLANCHER de la fenêtre du gel de livraison — la POSITION du curseur, et
 * jamais son horloge murale (#19261).
 *
 * ─── LA TROISIÈME HORLOGE ───────────────────────────────────────────────────
 *
 * `ConversationReadCursor` porte deux colonnes qui se ressemblent et ne disent
 * pas la même chose :
 *
 * | colonne | ce qu'elle dit |
 * |---|---|
 * | `lastDeliveredAt` | l'heure à laquelle un accusé a été TRAITÉ (`now`) |
 * | `lastDeliveredMessageCreatedAt` | le `createdAt` du message que le curseur a ATTEINT |
 *
 * `freezeMessageStatus` compare son `since` à `Message.createdAt` : c'est donc
 * une POSITION qu'il attend, et l'horloge y est une catégorie de type différente
 * portant la même unité. Trois lots ont retiré cette confusion d'un étage
 * chacun — #18701 de ce qui est SERVI, #18731 de ce que le CURSEUR écrit, et
 * celui-ci de la borne BASSE du GEL, la dernière.
 *
 * ─── POURQUOI UN MODULE, ET PAS TROIS REMPLACEMENTS DE VARIABLE ─────────────
 *
 * Parce que la descente exige DEUX choses, et qu'aucun site ne les tient
 * ensemble tout seul : la forme du `select` ({@link DELIVERY_FLOOR_SELECT}) et
 * la résolution ({@link deliveryFloorOf}). Des trois sites qui posent cette
 * borne, le troisième — la cascade « lu ⇒ remis » de `markMessagesAsRead` — ne
 * demandait PAS `lastDeliveredMessageCreatedAt` à sa requête : un correctif qui
 * se contente d'y changer la variable passée est un no-op MUET, et aucun témoin
 * de verdict ne le dirait. C'est la forme exacte de la leçon 276
 * (`utils/recipient-language.ts`) : **c'est la PROJECTION trop étroite, pas
 * l'appel manquant, qui rend une descente impossible en aval sans qu'aucun
 * témoin ne rougisse.**
 *
 * {@link DeliveryFloorCursor} le rend STRUCTUREL plutôt que disciplinaire : le
 * paramètre EXIGE la colonne de position, donc un site dont le `select` l'omet
 * ne compile pas. Une règle qu'il faut retaper à chaque site est une règle
 * qu'un site finira par ne pas avoir.
 */

/**
 * La projection MINIMALE d'où une position de livraison se résout. À répandre
 * dans le `select` de tout site qui appellera {@link deliveryFloorOf} — jamais
 * à retaper, et jamais à réduire.
 */
export const DELIVERY_FLOOR_SELECT = {
  lastDeliveredAt: true,
  lastDeliveredMessageCreatedAt: true,
} as const;

/**
 * Ce qu'il faut AVOIR LU pour pouvoir répondre. Les deux champs sont REQUIS —
 * nullables, mais présents : c'est cette exigence, et non un commentaire, qui
 * fait rougir le compilateur sur un site qui n'a chargé que l'horloge.
 */
export type DeliveryFloorCursor = {
  readonly lastDeliveredAt: Date | null;
  readonly lastDeliveredMessageCreatedAt: Date | null;
};

/**
 * La borne BASSE de la fenêtre du gel `deliveredAt`, ou `null` pour « depuis
 * l'origine de la conversation ».
 *
 * Trois décisions la portent, et chacune est un arbitrage :
 *
 * - **la POSITION d'abord.** Un accusé de remise qui ne fige qu'un SOUS-ENSEMBLE
 *   de sa fenêtre pousse quand même l'horloge à `now` (chemin EXACT, #18614) :
 *   la position reste alors en arrière, et tout message vivant ENTRE les deux
 *   est un trou que l'horloge exclut par construction. Scénario mesuré : M1
 *   (10:00) et M3 (10:10) remis par un drain de 11:00, M2 (10:05) évincé au
 *   plafond de `RedisDeliveryQueue` ⇒ curseur `{ position: 10:00, horloge:
 *   11:00 }`, et une fenêtre partant de 11:00 ne reverra JAMAIS M2.
 *
 * - **le repli sur l'horloge, pas sur `null`.** Une ligne écrite avant
 *   l'introduction de la colonne n'a pas de position ; repartir de l'origine y
 *   re-litigerait un passé dont le repli curseur de `resolveReceivedAt` rend
 *   déjà compte. La fenêtre démarre alors trop TARD — c'est l'ancien
 *   comportement, donc une non-régression, jamais une correction.
 *
 * - **le MINIMUM des deux, et non la position seule.** L'invariant attendu est
 *   `position <= horloge` (un message est créé avant d'être remis), si bien que
 *   les deux formes coïncident sur toute donnée saine. Elles divergent sous une
 *   dérive d'horloge entre deux serveurs — et là, la position seule RÉTRÉCIRAIT
 *   la fenêtre sous ce qu'elle couvrait avant ce lot. Le minimum ne peut que
 *   l'ÉLARGIR, et élargir est sûr : le gel est write-once, donc ré-ouvrir un
 *   intervalle déjà gravé n'écrit rien, et un message situé sous le plancher
 *   est un message que le curseur DÉCLARE déjà remis.
 */
export const deliveryFloorOf = (
  cursor: DeliveryFloorCursor | null | undefined,
): Date | null => {
  const position = cursor?.lastDeliveredMessageCreatedAt ?? null;
  const clock = cursor?.lastDeliveredAt ?? null;
  if (!position) return clock;
  if (!clock) return position;
  return position.getTime() <= clock.getTime() ? position : clock;
};
