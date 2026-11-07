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
 * ## La fenêtre n'est PAS définie ici — elle l'était déjà
 *
 * `utils/keyset-cursor.ts` porte la loi keyset de la passerelle, et son
 * doc-comment énonce mot pour mot l'invariant de ce défaut : « sans elle, deux
 * lignes nées dans la même milliseconde se re-servent l'une l'autre
 * indéfiniment, ou se sautent ». Le FIL était la seule liste à ne pas l'appeler.
 * Ce module n'ajoute donc aucune fenêtre : il apporte ce que la loi partagée ne
 * pouvait pas savoir — **quelle colonne la VUE trie** — et #16684 a généralisé
 * `keysetClause` pour recevoir cette colonne (`keysetBeforeClause` en est
 * désormais une projection). Écrire la fenêtre une seconde fois ici aurait été
 * la jumelle que `cursor-pagination-single-law-guard.test.ts` est là pour
 * empêcher.
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
import { applyHistoryFloor } from '../../services/historyFloor';
import { applyPersonalHistoryHiding, type PersonalHistoryHiding } from '../../services/personalHistoryFilter';
import {
  KEYSET_TIE_BREAK_FIELD,
  keysetClause,
  type KeysetSide,
  type KeysetWhereClause,
} from '../../utils/keyset-cursor';

export type MessageOrderDirection = 'asc' | 'desc';

/** La clé de tri d'une vue : son champ et son sens, lus dans `vue.orderBy`. */
export type MessageOrderKey = {
  readonly field: string;
  readonly direction: MessageOrderDirection;
};

/** La clé de RUPTURE de l'ordre total — l'identifiant, seul champ UNIQUE de la ligne. */
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
): Prisma.MessageOrderByWithRelationInput[] {
  const entries = Object.entries(orderBy ?? {});
  // Le champ vient de `vue.orderBy`, donc d'une CLÉ CALCULÉE : un objet à clé
  // dynamique s'infère `{ [x: string]: … }`, que le type Prisma n'accepte pas.
  // L'assertion est au même titre et pour la même raison que celle de
  // {@link messageKeysetWindow} — et c'est le type de RETOUR, exact, qui tient
  // le contrat à la frontière plutôt qu'un cast chez chaque appelant.
  const clauses = entries.map(([field, direction]) => ({ [field]: direction }) as Prisma.MessageOrderByWithRelationInput);
  const primary = entries[0];
  if (primary === undefined) return clauses;
  if (entries.some(([field]) => field === KEYSET_TIE_BREAK_FIELD)) return clauses;
  return [...clauses, { [KEYSET_TIE_BREAK_FIELD]: primary[1] }];
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

/**
 * La fenêtre de la page suivante pour une VUE : la loi partagée
 * ({@link keysetClause}), appelée avec la colonne que la vue trie et le côté où
 * son tri avance. Ce module ne construit aucune clause — il résout la QUESTION
 * que la loi partagée ne peut pas poser seule.
 */
export function messageKeysetWindow(cursor: {
  readonly field: string;
  readonly side: KeysetSide;
  readonly value: Date | null;
  readonly id: string;
}): KeysetWhereClause | null {
  return keysetClause(cursor);
}

/**
 * Ajoute une fenêtre au `AND` d'une clause, en PRÉSERVANT ce qui y est déjà.
 *
 * La fenêtre sort sous `AND`, **jamais** en écrasant un filtre de champ. Deux
 * raisons, toutes deux mesurées sur la route : le plancher d'historique d'un
 * lien de partage vit sur `createdAt` (`{ gte: … }`) et un `OR` ne s'y fond pas,
 * et les modes `around` / `view=search` occupent déjà la case `id`
 * (`{ in: [...] }`) qu'une fenêtre posée au premier niveau remplacerait en
 * silence. Écraser `AND` serait la même faute : elle ne se voit pas, parce que
 * la clause reste valide et la requête réussit.
 */
export function withKeysetWindow(
  where: Prisma.MessageWhereInput,
  window: KeysetWhereClause | null,
): Prisma.MessageWhereInput {
  if (window === null) return where;
  const existing = where.AND;
  const priors = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [...priors, window as Prisma.MessageWhereInput] };
}

/**
 * LA FENÊTRE `around` — les identifiants d'une page CENTRÉE sur un message.
 *
 * Extraite de `messages-list.ts` (#16684) pour deux raisons, et la seconde est
 * la vraie : le handler franchissait le seuil de 1 000 lignes du budget, et
 * cette fenêtre est le seul autre site de la route qui RÉSOUT un curseur — elle
 * appartient donc au module de la loi, pas au handler qui l'appelle.
 *
 * Les deux moitiés se bornent sur l'ordre TOTAL `(createdAt, id)` : sous un
 * `lt` / `gt` de la seule date, un message écrit dans la MÊME milliseconde que
 * la cible n'était dans AUCUNE des deux, et le saut vers un résultat de
 * recherche ouvrait un fil dont les voisins immédiats manquaient.
 *
 * Chaque moitié est filtrée ICI et pas seulement à la fin : sans cela,
 * `take: halfLimit` remplirait sa moitié de messages masqués que la
 * soustraction finale retirerait, et la fenêtre rendrait moins de messages que
 * demandé sans jamais le dire.
 *
 * Rend `null` quand la cible n'est pas LISIBLE — sous le plancher d'historique,
 * `around` se comporte comme un identifiant inconnu.
 */
export async function resolveAroundWindowIds(params: {
  /** Structurel, pour qu'un double de test n'ait pas à porter tout le client. */
  readonly prisma: {
    readonly message: {
      findFirst: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<unknown>;
    };
  };
  readonly conversationId: string;
  readonly around: string;
  readonly limit: number;
  readonly historyStartDate: Date | null | undefined;
  /** Le masquage PERSONNEL du lecteur — appliqué aux DEUX moitiés, jamais à la fin. */
  readonly personalHiding: PersonalHistoryHiding;
}): Promise<string[] | null> {
  const { prisma, conversationId, around, limit, historyStartDate } = params;

  const target = await prisma.message.findFirst({
    where: applyHistoryFloor({ id: around, conversationId }, historyStartDate),
    select: { id: true, createdAt: true }
  }) as { id: string; createdAt: Date } | null;
  if (!target) return null;

  const halfLimit = Math.floor(limit / 2);
  const cursor = { value: target.createdAt, id: String(target.id) } as const;
  const floorOnly: Prisma.MessageWhereInput = historyStartDate ? { createdAt: { gte: historyStartDate } } : {};

  const half = (side: KeysetSide, direction: MessageOrderDirection) => prisma.message.findMany({
    where: applyPersonalHistoryHiding(
      withKeysetWindow({ conversationId, deletedAt: null, ...floorOnly }, keysetClause({ field: 'createdAt', side, ...cursor })),
      params.personalHiding
    ),
    orderBy: totalMessageOrderBy({ createdAt: direction }),
    take: halfLimit,
    select: { id: true }
  }) as Promise<Array<{ id: string }>>;

  const [older, newer] = await Promise.all([half('lower', 'desc'), half('higher', 'asc')]);
  return [...older.map((row) => row.id), around, ...newer.map((row) => row.id)];
}
