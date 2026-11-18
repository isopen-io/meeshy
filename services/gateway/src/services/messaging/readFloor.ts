/**
 * Le PLANCHER du curseur de LECTURE — la POSITION du curseur, et jamais son
 * horloge murale (#19299). Jumelle de {@link ./deliveryFloor}, et l'ordre dans
 * lequel les deux sont arrivées est la mesure du lot : trois lots ont retiré la
 * confusion horloge/position de la chaîne de LIVRAISON — #18701 de ce qui est
 * SERVI, #18731 du BALAYAGE de contiguïté, #19261 de la fenêtre du GEL — et la
 * chaîne de LECTURE, qui a exactement la même structure et les mêmes deux
 * colonnes, n'avait reçu aucun des deux derniers.
 *
 * ─── LES DEUX COLONNES ──────────────────────────────────────────────────────
 *
 * | colonne | ce qu'elle dit |
 * |---|---|
 * | `lastReadAt` | l'heure à laquelle un accusé de lecture a été TRAITÉ (`now`) |
 * | `lastReadMessageCreatedAt` | le `createdAt` du message que le curseur a ATTEINT |
 *
 * Les trois consommateurs du plancher comparent leur borne à
 * `Message.createdAt` : c'est donc une POSITION qu'ils attendent, et l'horloge
 * y est une catégorie de type différente portant la même unité.
 *
 * ─── L'ARBITRAGE, QUI NE SE TRANSPOSE PAS DE LA LIVRAISON ───────────────────
 *
 * #19261 a tranché « élargir est sûr » pour la livraison en une ligne : le gel
 * est write-once, et un message sous le plancher est un message que le curseur
 * DÉCLARE remis. **Cet argument-là ne vaut pas ici**, et le dépôt écrit
 * lui-même l'inverse du confort pour la lecture — « sans élargir d'un seul
 * message l'ensemble déclaré LU » (`MarkReadBodySchema.caughtUpToMessageId`),
 * et la borne `until` de #16744 : **un message gravé lu à tort l'est pour
 * toujours.** Transposer par analogie serait la faute du cycle 107, une
 * symétrie LEXICALE prise pour une symétrie de fond.
 *
 * Il faut donc l'instruire par CONSOMMATEUR, et les trois répondent — par trois
 * raisons DIFFÉRENTES, ce qui est précisément ce qu'une transposition aurait
 * manqué :
 *
 * 1. **La fenêtre du GEL** (`freezeMessageStatus({ since, until, field:
 *    'readAt' })`). Descendre le plancher de l'horloge à la position n'AJOUTE
 *    aucune affirmation : le compte de non-lus dérive du curseur par
 *    `createdAt > lastReadAt`, donc tout message vivant dans
 *    `(position, horloge]` était DÉJÀ compté lu par le badge. Le gel ne fait
 *    que rendre la vérité DURABLE par message conforme à ce que l'index
 *    affirmait déjà. Et la borne HAUTE ne bouge pas : `until = caughtUpAt`
 *    reste la frontière RAPPORTÉE, si bien que rien au-dessus de ce que le
 *    lecteur déclare n'est jamais gravé. **Ce n'est pas « élargir est sûr »,
 *    c'est « les deux moitiés de l'état cessent de se contredire ».**
 *
 * 2. **Le BALAYAGE de contiguïté** (`_computeExactReadCursorTarget`).
 *    Descendre l'ancre est strictement CONSERVATEUR : la fenêtre voit PLUS de
 *    candidats, et un trou y BLOQUE l'avance. C'est l'argument même de #18731 —
 *    un balayage ancré sur l'horloge part AU-DESSUS du trou, donc le compte
 *    comme « rien à franchir » et laisse le curseur avancer par-dessus. La
 *    contiguïté est la seule propriété capable de voir un trou ANTÉRIEUR, et
 *    l'ancrer sur l'horloge la calcule sur une fenêtre qui exclut le trou par
 *    construction.
 *
 * 3. **Le GEL en mode EXACT** (`freezeMessageStatus({ since, messageIds })`).
 *    `since` y est INERTE — la liste ÉTANT la borne. Il reçoit quand même la
 *    position : une valeur fausse mais inexploitée est un piège armé, pas une
 *    économie (règle du cycle 84). Même traitement qu'au site EXACT de
 *    livraison, et pour la même raison.
 *
 * ─── CE QU'UN TROU QUI NE SE REFERME PAS COÛTE, ICI ─────────────────────────
 *
 * Plus cher que pour la livraison, et il faut le dire : le compte de non-lus
 * dérive du curseur de LECTURE, donc un curseur bloqué derrière un trou laisse
 * un badge non nul. Deux raisons de l'accepter quand même :
 *
 * - le balayage s'arrête DÉJÀ au premier trou (c'est sa raison d'être) ;
 *   descendre son ancre ne crée pas le blocage, il rend VISIBLE un trou qui
 *   l'était déjà mais que la borne masquait ;
 * - le RATTRAPAGE le délie : `caughtUpToMessageId` fait sauter le curseur et
 *   remet le compte à zéro (`resetUnreadCount: true`) SANS regarder les trous,
 *   sur les deux modes. Un badge bloqué se vide à la première lecture
 *   rapportée — un message gravé lu à tort, lui, ne se dégrave jamais.
 *
 * ─── POURQUOI UN MODULE, ET PAS SIX REMPLACEMENTS DE VARIABLE ───────────────
 *
 * Parce que la descente exige DEUX choses, et qu'aucun site ne les tient
 * ensemble tout seul : la forme du `select` ({@link READ_FLOOR_SELECT}) et la
 * résolution ({@link readFloorOf}). L'idiome était retapé SIX fois en
 * production, chaque fois avec son commentaire expliquant que
 * « `lastReadMessageCreatedAt` est le vrai plancher » — la définition d'une
 * règle qu'un site finira par ne pas avoir, et deux sites ne l'avaient
 * effectivement pas : le dépôt SAVAIT, et les deux sites qui comptaient ne le
 * savaient pas.
 *
 * {@link ReadFloorCursor} le rend STRUCTUREL plutôt que disciplinaire : les
 * deux champs sont REQUIS, donc un site dont le `select` omet la colonne de
 * position ne compile pas. Un module partagé DÉPLACE la discipline — il faut
 * penser à l'appeler ; un type qui EXIGE la lecture la supprime.
 */

import {
  readCursorFloorOf,
  type ReadCursorFloorSource,
} from '@meeshy/shared/utils/read-cursor-floor';

/**
 * La projection MINIMALE d'où une position de lecture se résout. À répandre
 * dans le `select` de tout site qui appellera {@link readFloorOf} — jamais à
 * retaper, et jamais à réduire.
 */
export const READ_FLOOR_SELECT = {
  lastReadAt: true,
  lastReadMessageCreatedAt: true,
} as const;

/**
 * Ce qu'il faut AVOIR LU pour pouvoir répondre. Les deux champs sont REQUIS —
 * nullables, mais présents : c'est cette exigence, et non un commentaire, qui
 * fait rougir le compilateur sur un site qui n'a chargé que l'horloge.
 */
export type ReadFloorCursor = ReadCursorFloorSource;

/**
 * La borne BASSE de ce que le curseur de lecture a déjà franchi, ou `null` pour
 * « depuis l'origine de la conversation ».
 *
 * Trois décisions la portent, et les deux premières sont celles de
 * {@link ./deliveryFloor.deliveryFloorOf} — même structure, même donnée :
 *
 * - **la POSITION d'abord.** En mode exact, `lastReadAt` est posé à `now` par
 *   `_advanceCursor` même quand le curseur n'a franchi qu'un préfixe : la
 *   position reste alors en arrière, et tout message vivant ENTRE les deux est
 *   un trou que l'horloge exclut par construction.
 *
 * - **le repli sur l'horloge, pas sur `null`.** Une ligne écrite avant
 *   l'introduction de la colonne n'a pas de position ; repartir de l'origine y
 *   re-litigerait un passé entier. La fenêtre démarre alors trop TARD — c'est
 *   l'ancien comportement, donc une non-régression, jamais une correction.
 *
 * - **le MINIMUM des deux, et non la position seule** — la SEULE clause que
 *   cette unité porte encore en propre depuis #19599, les deux premières
 *   étant la descente partagée ({@link readCursorFloorOf}). L'invariant attendu est
 *   `position <= horloge` (un message est créé avant d'être lu), si bien que les
 *   deux formes coïncident sur toute donnée saine. Elles divergent sous une
 *   dérive d'horloge entre deux serveurs — et là, la position seule
 *   RÉTRÉCIRAIT le plancher sous ce qu'il couvrait avant ce lot, une régression
 *   introduite par le correctif lui-même. Le minimum ne peut que l'ABAISSER, et
 *   abaisser est la direction sûre des TROIS consommateurs : le balayage voit
 *   plus de trous (donc avance moins), le gel reste borné en haut par la
 *   frontière rapportée, et un compte de non-lus trop HAUT se vide à la
 *   première lecture quand un compte trop BAS cache un message pour toujours.
 */
/**
 * Le CLIQUET d'horloge, et il est à nous SEULS (#19599).
 *
 * `readCursorFloorOf` rend la descente — la position, l'horloge en repli. Ce
 * qui suit la clampe au MINIMUM des deux colonnes, et c'est une garde de
 * NON-RÉGRESSION, pas une correction : les trois consommateurs du plancher
 * étaient ancrés sur l'HORLOGE avant #19299, donc la position seule aurait pu
 * RÉTRÉCIR leur fenêtre sous ce qu'elle couvrait — une régression introduite
 * par le correctif lui-même. Abaisser, en revanche, est la direction sûre des
 * trois : le balayage voit plus de trous (donc avance moins), le gel reste
 * borné en haut par la frontière rapportée, et un compte de non-lus trop HAUT
 * se vide à la première lecture quand un compte trop BAS cache un message pour
 * toujours.
 *
 * **Il ne se transpose à AUCUN lecteur de la descente partagée**, et le
 * doc-comment de `read-cursor-floor.ts` en porte la raison : un SÉPARATEUR
 * (`firstUnreadBoundary`) descend la position d'abord depuis son origine, donc
 * n'a pas ce passé — l'abaisser y ferait remonter le lecteur dans du déjà-lu
 * sans qu'aucun non-lu ne soit en jeu. Les deux témoins de dérive se
 * répondent : `readFloor.test.ts` gèle le minimum, `read-cursor-floor.test.ts`
 * gèle la position, et un lot qui consoliderait les deux formes en une fait
 * tomber l'un des deux.
 */
const clampToClock = (floor: Date | null, clock: Date | null): Date | null => {
  if (!floor || !clock) return floor;
  return floor.getTime() <= clock.getTime() ? floor : clock;
};

export const readFloorOf = (
  cursor: ReadFloorCursor | null | undefined,
): Date | null => clampToClock(readCursorFloorOf(cursor), cursor?.lastReadAt ?? null);
