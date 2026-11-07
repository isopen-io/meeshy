/**
 * **LA FENÊTRE DE CURSEUR DU FIL — UNE LOI, UN SITE** (#16684).
 *
 * `GET /conversations/:id/messages` paginait sur une clé **NON UNIQUE** bornée
 * par une inégalité **STRICTE** :
 *
 * ```ts
 * orderBy: { createdAt: 'desc' }
 * whereClause.createdAt = { lt: beforeMessage.createdAt }
 * nextCursor = la DERNIÈRE ligne de la page
 * ```
 *
 * `Message.createdAt` est un BSON Date, donc à la **MILLISECONDE**. Quand la
 * frontière d'une page tombe DANS un groupe de messages qui partagent leur
 * milliseconde, la page suivante exclut `createdAt < T` — donc **les membres du
 * groupe qui n'ont pas tenu sur la page**. Aucune page ne les rend jamais : ils
 * disparaissent de l'historique sans erreur et sans trace. Et l'ordre DANS une
 * égalité n'étant pas défini sous un tri mono-clé, la pagination par `offset`
 * de la première page pouvait resservir ou sauter une ligne entre deux
 * requêtes, sans qu'aucune égalité soit visible dans la réponse.
 *
 * La réparation n'est pas une borne plus large — ce serait des doublons au lieu
 * de pertes. C'est un **ordre TOTAL** : la clé de la vue, puis `id` comme clé de
 * RUPTURE, et une fenêtre qui exprime ce même ordre total.
 *
 * `id` est `String @id @db.ObjectId` et `MessageWhereInput.id` est un
 * `StringFilter` : `lt`/`gt` y sont typés, et l'ordre BSON d'un ObjectId est
 * celui de son hexadécimal — la clé de rupture donne donc le MÊME ordre au
 * `orderBy` et à la fenêtre, ce qui est la seule chose qu'une pagination keyset
 * exige (la clé de rupture n'a pas à être SIGNIFIANTE, elle doit être TOTALE).
 *
 * ## La clé se DÉRIVE de la vue, elle ne se redéclare pas par mode
 *
 * C'est le second défaut de la même famille, et il ne demandait aucune égalité
 * de milliseconde pour mordre : `view=pinned` **TRIE** sur `pinnedAt` (« la
 * dernière épingle posée d'abord, jamais le dernier message écrit ») et le
 * curseur **PAGINAIT** sur `createdAt`. Clé de tri ≠ clé de curseur ⇒ la page
 * suivante perd ET double. Un curseur dont la clé est écrite en dur ne peut pas
 * suivre une vue ; {@link messageOrderKeyOf} la lit donc dans `vue.orderBy`,
 * qui est déjà la seule source de l'ordre.
 *
 * ## Ce que cette loi ne couvre PAS
 *
 * Le filigrane AVANT (`?after=`, {@link buildAfterWatermarkClause}) porte la
 * même égalité de milliseconde et n'est **pas** réparable ici : le client
 * n'envoie qu'un horodatage, sans identifiant sur lequel rompre l'égalité. Suivi
 * à part.
 */

import type { Prisma } from '@meeshy/shared/prisma/client';

export type MessageOrderDirection = 'asc' | 'desc';

/** La clé de tri d'une vue : son champ et son sens, lus dans `vue.orderBy`. */
export type MessageOrderKey = {
  readonly field: string;
  readonly direction: MessageOrderDirection;
};

/** La clé de RUPTURE de l'ordre total — l'identifiant, seul champ UNIQUE de la ligne. */
export const MESSAGE_ORDER_TIE_BREAK_FIELD = 'id' as const;

/**
 * La clé de tri d'une vue. Un `orderBy` à plusieurs clés rend la PREMIÈRE :
 * c'est elle que le curseur doit borner, les suivantes ne départageant que des
 * égalités de celle-là.
 *
 * Un `orderBy` VIDE ne se devine pas (`createdAt` serait un défaut plausible et
 * faux pour `view=pinned`) : il rend `null`, et l'appelant sert alors sa page
 * sans fenêtre plutôt que d'en fabriquer une sur la mauvaise colonne.
 */
export function messageOrderKeyOf(
  orderBy: Readonly<Record<string, MessageOrderDirection>> | undefined,
): MessageOrderKey | null {
  const entries = Object.entries(orderBy ?? {});
  const first = entries[0];
  if (first === undefined) return null;
  return { field: first[0], direction: first[1] };
}

/**
 * L'ordre **TOTAL** d'une vue : sa clé, puis `id` DANS LE MÊME SENS. Le même
 * sens n'est pas un détail d'esthétique — une clé de rupture qui descend quand
 * la clé principale monte produirait un ordre que la fenêtre ci-dessous ne
 * décrit pas, et une pagination keyset dont l'ordre et la fenêtre divergent
 * saute des lignes exactement comme celle qu'on répare.
 *
 * Une vue qui départage DÉJÀ par `id` est rendue telle quelle : on ne pose pas
 * deux fois la même clé.
 */
export function totalMessageOrderBy(
  orderBy: Readonly<Record<string, MessageOrderDirection>> | undefined,
): ReadonlyArray<Readonly<Record<string, MessageOrderDirection>>> {
  const entries = Object.entries(orderBy ?? {});
  const clauses = entries.map(([field, direction]) => ({ [field]: direction }));
  const primary = entries[0];
  if (primary === undefined) return clauses;
  if (entries.some(([field]) => field === MESSAGE_ORDER_TIE_BREAK_FIELD)) return clauses;
  return [...clauses, { [MESSAGE_ORDER_TIE_BREAK_FIELD]: primary[1] }];
}

/**
 * De quel CÔTÉ de son curseur vit la page SUIVANTE, dans l'ordre de la vue. Un
 * tri descendant avance vers les valeurs plus PETITES, un tri ascendant vers
 * les plus GRANDES — et c'est la seule raison pour laquelle le `lt` d'origine
 * avait l'air juste : il était correct pour le sens de la vue nominale, et
 * aurait été faux pour toute vue ascendante.
 */
export function nextPageSide(direction: MessageOrderDirection): KeysetSide {
  return direction === 'desc' ? 'lower' : 'higher';
}

/** Le côté d'un curseur dans l'ordre total : valeurs plus petites, ou plus grandes. */
export type KeysetSide = 'lower' | 'higher';

export type MessageKeysetCursor = {
  readonly field: string;
  readonly side: KeysetSide;
  /** La valeur du curseur sur la clé de tri. `null` ⇒ aucune fenêtre (voir plus bas). */
  readonly value: Date | null;
  readonly id: string;
};

/**
 * Les lignes **strictement** d'un côté du curseur, dans l'ordre total
 * `(field, id)` :
 *
 * ```
 * field < v   OU   (field = v ET id < curseur)        — côté 'lower'
 * field > v   OU   (field = v ET id > curseur)        — côté 'higher'
 * ```
 *
 * La fenêtre sort sous `AND`, **jamais** en écrasant un filtre de champ. Deux
 * raisons, toutes deux mesurées sur la route : le plancher d'historique d'un
 * lien de partage vit sur `createdAt` (`{ gte: … }`) et un `OR` ne s'y fond pas,
 * et les modes `around` / `view=search` occupent déjà la case `id`
 * (`{ in: [...] }`) qu'une fenêtre posée au premier niveau remplacerait en
 * silence.
 *
 * **Une valeur de curseur `null` ne rend AUCUNE fenêtre**, et c'est le
 * comportement déjà documenté de la route pour un `before` inconnu : « un
 * `before` INCONNU laisse la fenêtre INTACTE ». Le cas se produit pour de vrai —
 * un `before` qui désigne un message NON ÉPINGLÉ sous `view=pinned` n'a pas de
 * `pinnedAt` — et fabriquer une fenêtre sur `null` paginerait sur une valeur que
 * la collection ne porte pas.
 */
export function messageKeysetWindow(cursor: MessageKeysetCursor): Prisma.MessageWhereInput | null {
  const { field, side, value, id } = cursor;
  if (value === null) return null;
  const operator = side === 'lower' ? 'lt' : 'gt';
  return {
    OR: [
      { [field]: { [operator]: value } },
      { AND: [{ [field]: value }, { [MESSAGE_ORDER_TIE_BREAK_FIELD]: { [operator]: id } }] },
    ],
  } as Prisma.MessageWhereInput;
}

/**
 * Ajoute une fenêtre au `AND` d'une clause, en PRÉSERVANT ce qui y est déjà.
 * Écraser `AND` est la même faute que d'écraser `createdAt` : elle ne se voit
 * pas, parce que la clause reste valide et la requête réussit.
 */
export function withKeysetWindow(
  where: Prisma.MessageWhereInput,
  window: Prisma.MessageWhereInput | null,
): Prisma.MessageWhereInput {
  if (window === null) return where;
  const existing = where.AND;
  const priors = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [...priors, window] };
}
