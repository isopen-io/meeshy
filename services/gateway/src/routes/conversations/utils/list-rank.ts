import type { Prisma } from '@meeshy/shared/prisma/client';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import type { CurseurDeListe } from '../list-cursor';

/**
 * **LA PAGE DE `GET /conversations`, TRIÉE PAR LE RANG DE LA LIGNE** (#9026).
 *
 * rang = max(`lastMessageAt`, `lastActivityAt`) — `listRankFromColumns`, la
 * règle de `packages/shared`, la MÊME pour tous les participants. Toute
 * activité (message, réaction, appel, épingle) remonte la ligne pour tout le
 * monde (directive porteur du 2026-10-01, qui remplace la règle PAR LECTEUR de
 * #7592).
 *
 * ## Pourquoi deux flux et pas un `orderBy`
 *
 * Un `max` de deux colonnes ne s'écrit pas en `orderBy` Prisma. Mais seules les
 * lignes qui portent une activité peuvent monter au-dessus de leur
 * `lastMessageAt`. D'où deux lectures bornées :
 *
 *   - A — toutes les lignes, par `lastMessageAt desc` ;
 *   - B — celles qui portent une activité, par `lastActivityAt desc` (index
 *     `[isActive, lastActivityAt]`).
 *
 * Le top-K par rang est inclus dans top-K(A) ∪ top-K(B) : une ligne de rang
 * `lastMessageAt` a moins de K lignes de `lastMessageAt` plus grand ; une
 * ligne REMONTÉE a moins de K lignes de B de `lastActivityAt` plus grand.
 *
 * ## Le chemin chaud reste à une lecture
 *
 * A (en lignes complètes, `skip`/`take` habituels) et B (clés seules) partent
 * en parallèle. Tant qu'aucune ligne de B n'est effectivement REMONTÉE (son
 * activité plus récente que son dernier message), A est déjà la bonne page.
 * Sinon seulement : les clés de A sur K = offset + limit, la fusion par rang,
 * et la lecture des lignes complètes qui manquent.
 *
 * ## Ce que la preuve EXIGE de la fenêtre (#19836)
 *
 * Les trois paramètres ci-dessous ne sont pas réglables : la preuve du top-K
 * tombe si l'un change. Témoin :
 * `__tests__/unit/routes/conversation-list-rank-window.test.ts`, qui ROUGIT sous
 * chacune des trois mutations (mesuré).
 *
 *   - **K vaut `offset + limit` sur les DEUX flux.** Lire `limit` clés suffit
 *     pour une première page et perd la suivante : sur `offset: 2, limit: 1`,
 *     `take: limit` sur A rend une page VIDE.
 *   - **Le flux B ne SKIPPE pas.** Son ordre est `lastActivityAt`, pas le rang :
 *     sauter `offset` lignes dans SON ordre jette des lignes qui appartiennent à
 *     la fenêtre du rang. `skip: offset` sur B sert la mauvaise ligne, exactement
 *     comme `take: limit` — c'est le même sinistre par l'autre bout.
 *   - **La borne de B porte sur les DEUX colonnes**, et c'est le point
 *     contre-intuitif : `{ lastMessageAt: { lt: bound } }` est logiquement
 *     REDONDANTE avec le filtre `isLifted` qui suit — une ligne dont
 *     `lastActivityAt < bound ≤ lastMessageAt` n'est jamais « remontée ». Elle ne
 *     l'est pas pour la FENÊTRE : sans elle, les K places de B se remplissent de
 *     lignes de la page 1, qu'`isLifted` écarte TROP TARD, et une ligne
 *     réellement remontée de la page 2 en est évincée — donc perdue pour de bon,
 *     la page suivante bornant plus bas qu'elle.
 *
 * Une clause logiquement redondante peut être indispensable à une BORNE DE
 * LECTURE : la redondance se juge sur le jeu de lignes RENDU, jamais sur le
 * verdict du filtre qui suit.
 *
 * ## Le curseur borne sur le RANG
 *
 * `rang < R` ⇔ `lastMessageAt < R` ET (`lastActivityAt < R` OU pas
 * d'activité). Jamais `NOT: { lastActivityAt: { gte: R } }` : sur MongoDB,
 * Prisma écarte de toute négation le document où la clé est ABSENTE (mesuré
 * contre `mongo:8`, #8309) — et c'est le cas de toute conversation sans
 * activité, que Prisma n'écrit pas. La page 2 perdait ainsi chaque
 * conversation qui n'avait connu que des messages.
 *
 * La borne est STRICTE et ne porte que le rang : **deux lignes de rang
 * IDENTIQUE à la frontière d'une page font perdre la seconde** (mesuré, #19881).
 * `resolveListCursor` tient l'id du curseur et le jette — le départage est donc
 * à portée, et c'est un lot à lui (les deux `orderBy` doivent départager aussi).
 *
 * ## La page delta garde son ordre
 *
 * L'ordre d'une page delta n'est pas cosmétique : il décide si une page
 * TRONQUÉE est rattrapable. Les deux clients avancent leur watermark au max des
 * `updatedAt` REÇUS ; triée par `updatedAt` croissant, les lignes coupées sont
 * exactement celles que l'appel suivant rend (`id` départage les égalités). Le
 * rang y est SERVI (`listRankAt`), jamais trié. Le curseur `before` garde la
 * main sur une page delta : il borne sur le rang, donc il en impose l'ordre.
 */

export const LIST_RANK_SELECT = {
  id: true,
  lastMessageAt: true,
  lastActivityAt: true,
} as const;

export interface ListRankRow {
  readonly id: string;
  readonly lastMessageAt?: Date | null;
  readonly lastActivityAt?: Date | null;
}

export interface RowsQuery {
  readonly where: Prisma.ConversationWhereInput;
  readonly orderBy: Prisma.ConversationOrderByWithRelationInput | Prisma.ConversationOrderByWithRelationInput[];
  readonly skip: number;
  readonly take: number;
}

export interface RankedPagePrisma {
  readonly conversation: {
    findMany(args: {
      where: Prisma.ConversationWhereInput;
      orderBy: Prisma.ConversationOrderByWithRelationInput | Prisma.ConversationOrderByWithRelationInput[];
      take: number;
      select: typeof LIST_RANK_SELECT;
    }): Promise<ListRankRow[]>;
  };
}

export interface RankedPageRequest<Row extends ListRankRow> {
  readonly prisma: RankedPagePrisma;
  /** Lit les lignes COMPLÈTES (le `select` de la route). */
  readonly readRows: (query: RowsQuery) => Promise<Row[]>;
  readonly where: Prisma.ConversationWhereInput;
  readonly curseur: Exclude<CurseurDeListe, { genre: 'refus' }>;
  readonly deltaOrder: boolean;
  readonly limit: number;
  readonly offset: number;
}

/** La ligne de bord : son rang, et son identité quand il y en a une à départager. */
interface Borne {
  readonly rang: Date;
  /** `null` pour la QUEUE du tri, qu'aucune ligne ne suit — rien à départager. */
  readonly id: string | null;
}

/**
 * Borne `(rang, id) < (R, C)` — l'ordre LEXICOGRAPHIQUE de la clé de tri
 * globale, en clauses par flux (#19881).
 *
 * ## Pourquoi l'id, et pourquoi il ne coûte rien
 *
 * `rang < R` seul PERD une ligne : deux conversations de rang identique
 * encadrant une frontière de page, et celle qui n'était pas sur la page 1 est
 * écartée de la page 2 par la borne stricte, puis la page 3 borne plus bas que
 * son rang. Elle n'apparaît sur AUCUNE page (mesuré). Atteignable —
 * `lastMessageAt` est `DateTime @default(now())` et `messagePostSaveEffects` y
 * écrit `new Date()` — et davantage depuis #19800, le rang d'une ligne REMONTÉE
 * pouvant valoir exactement le `lastMessageAt` d'une autre.
 *
 * L'identité n'est pas calculée : `beforeCursor` EST un `Conversation.id`, que
 * `resolveListCursor` a déjà lu et autorisé dans le scope du lecteur. Aucun
 * format de curseur ne change, donc rien à instruire côté rétrocompatibilité.
 *
 * ## Pourquoi l'ordre sur l'id est le MÊME des deux côtés
 *
 * MongoDB compare un ObjectId octet par octet, ce qui est exactement l'ordre
 * lexicographique de son hexadécimal : `{ id: { lt: C } }` et
 * `orderBy: { id: 'desc' }` s'accordent. C'est de cet accord que dépend le
 * départage, et c'est pourquoi les deux `orderBy` le portent.
 *
 * ## Ce que les clauses supposent
 *
 * Jamais de `NOT` : sur MongoDB, Prisma écarte de toute négation le document où
 * la clé est ABSENTE (#8309), et c'est le cas de `lastActivityAt` sur toute
 * conversation sans activité. Chaque `OR` qui doit apparier l'absence porte donc
 * ses deux branches POSITIVES (`null` et `isSet: false`) SŒURS.
 *
 * `lastMessageAt`, lui, est tenu pour PRÉSENT — le schéma le déclare
 * `DateTime @default(now())`, non nullable, donc Prisma l'écrit à chaque
 * création. Les clauses `lte` / `lt` qui le portent n'apparieraient pas un
 * document sans la clé ; aucun chemin n'en produit, et l'ancienne borne faisait
 * la même hypothèse.
 */
function rankBound({ rang, id }: Borne): {
  readonly byMessage: Prisma.ConversationWhereInput[];
  readonly byActivity: Prisma.ConversationWhereInput[];
} {
  const activiteSous: Prisma.ConversationWhereInput = {
    OR: [{ lastActivityAt: { lt: rang } }, { lastActivityAt: null }, { lastActivityAt: { isSet: false } }],
  };
  const rangStrict = {
    byMessage: [{ lastMessageAt: { lt: rang } }, activiteSous] as Prisma.ConversationWhereInput[],
    byActivity: [{ lastActivityAt: { lt: rang } }, { lastMessageAt: { lt: rang } }] as Prisma.ConversationWhereInput[],
  };
  if (id === null) return rangStrict;

  const activiteAuPlus: Prisma.ConversationWhereInput = {
    OR: [{ lastActivityAt: { lte: rang } }, { lastActivityAt: null }, { lastActivityAt: { isSet: false } }],
  };
  return {
    byMessage: [
      { lastMessageAt: { lte: rang } },
      { OR: [{ AND: rangStrict.byMessage }, { AND: [{ id: { lt: id } }, activiteAuPlus] }] },
    ],
    byActivity: [
      { lastActivityAt: { lte: rang } },
      { lastMessageAt: { lte: rang } },
      { OR: [{ AND: rangStrict.byActivity }, { id: { lt: id } }] },
    ],
  };
}

function boundOf(curseur: RankedPageRequest<ListRankRow>['curseur']): Borne | null {
  // `?? null` n'est pas une politesse : Prisma IGNORE un champ `undefined`, donc
  // `{ id: { lt: undefined } }` apparierait TOUT et la branche de départage
  // admettrait la page précédente en entier. Un id absent retombe donc sur la
  // borne STRICTE — le comportement d'avant #19881, qui perd le départage et
  // jamais la borne.
  if (curseur.genre === 'borne') return { rang: curseur.rang, id: curseur.id ?? null };
  // Les rangs nuls sortent en QUEUE d'un tri `desc` : rien ne suit une
  // conversation sans message (voir `list-cursor.ts`). Aucune ligne à départager,
  // donc aucune identité à porter.
  if (curseur.genre === 'queue') return { rang: new Date(0), id: null };
  return null;
}

function rankMillis(row: ListRankRow): number {
  return listRankFromColumns(row)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function isLifted(row: ListRankRow): boolean {
  const rank = listRankFromColumns(row);
  if (rank === null) return false;
  return !row.lastMessageAt || rank.getTime() > row.lastMessageAt.getTime();
}

/** `id` décroissant — l'ordre que MongoDB rend sur un ObjectId, donc celui des deux `orderBy`. */
function compareIdDesc(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

/**
 * Les ids de la page, fusionnés par `(rang desc, id desc)`.
 *
 * Le départage est EXPLICITE depuis #19881. Il s'appuyait avant sur la stabilité
 * du tri, c'est-à-dire sur l'ordre des DEUX lectures qui alimentent cette
 * fusion — un ordre que rien ne garantissait, les deux `orderBy` n'ayant pas de
 * clé de départage. Deux lignes de rang égal pouvaient donc sortir dans un ordre
 * et être bornées dans l'autre.
 */
export function mergeByRank(
  byMessage: readonly ListRankRow[],
  lifted: readonly ListRankRow[],
  window: { readonly offset: number; readonly limit: number },
): string[] {
  const seen = new Set<string>();
  const unique = [...byMessage, ...lifted].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return [...unique]
    .sort((a, b) => rankMillis(b) - rankMillis(a) || compareIdDesc(a.id, b.id))
    .slice(window.offset, window.offset + window.limit)
    .map((row) => row.id);
}

export async function loadRankedConversationPage<Row extends ListRankRow>(
  request: RankedPageRequest<Row>,
): Promise<Row[]> {
  const { prisma, readRows, where, curseur, limit, offset } = request;

  if (request.deltaOrder && curseur.genre === 'absent') {
    return readRows({ where, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], skip: offset, take: limit });
  }

  const bound = boundOf(curseur);
  const clauses = bound ? rankBound(bound) : { byMessage: [], byActivity: [] };
  const byMessageWhere: Prisma.ConversationWhereInput = clauses.byMessage.length
    ? { AND: [where, ...clauses.byMessage] }
    : where;
  const byActivityWhere: Prisma.ConversationWhereInput = {
    AND: [where, { lastActivityAt: { not: null } }, ...clauses.byActivity],
  };
  const window = offset + limit;
  // Les deux ordres départagent sur `id` (#19881) : sans clé de départage,
  // l'ordre des ex aequo rendu par MongoDB n'est pas spécifié, donc le top-K des
  // deux lectures d'une MÊME requête peut ne pas s'accorder — et la borne du
  // curseur, qui départage désormais, s'accorderait avec un ordre que la lecture
  // ne rend pas.
  const byMessageOrder: Prisma.ConversationOrderByWithRelationInput[] = [{ lastMessageAt: 'desc' }, { id: 'desc' }];
  const byActivityOrder: Prisma.ConversationOrderByWithRelationInput[] = [{ lastActivityAt: 'desc' }, { id: 'desc' }];

  const [firstRows, withActivity] = await Promise.all([
    readRows({ where: byMessageWhere, orderBy: byMessageOrder, skip: offset, take: limit }),
    prisma.conversation.findMany({
      where: byActivityWhere,
      orderBy: byActivityOrder,
      take: window,
      select: LIST_RANK_SELECT,
    }),
  ]);

  const lifted = withActivity.filter(isLifted);
  if (lifted.length === 0) return firstRows;

  const byMessageKeys = await prisma.conversation.findMany({
    where: byMessageWhere,
    orderBy: byMessageOrder,
    take: window,
    select: LIST_RANK_SELECT,
  });
  const pageIds = mergeByRank(byMessageKeys, lifted, { offset, limit });

  const loaded = new Map(firstRows.map((row) => [row.id, row] as const));
  const missing = pageIds.filter((id) => !loaded.has(id));
  const extraRows = missing.length
    ? await readRows({ where: { AND: [where, { id: { in: missing } }] }, orderBy: byMessageOrder, skip: 0, take: missing.length })
    : [];
  for (const row of extraRows) loaded.set(row.id, row);

  return pageIds.flatMap((id) => {
    const row = loaded.get(id);
    return row ? [row] : [];
  });
}
