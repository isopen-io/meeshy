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
 * ## Le curseur borne sur le RANG
 *
 * `rang < R` ⇔ `lastMessageAt < R` ET NON(`lastActivityAt ≥ R`). Le `NOT`
 * reste juste sur un champ ABSENT (document antérieur à #9026) : la condition
 * y est fausse, sa négation vraie — aucune ligne héritée ne disparaît.
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
      orderBy: Prisma.ConversationOrderByWithRelationInput;
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

/** Borne `rang < R`, en deux clauses — une par flux. */
function rankBound(bound: Date): {
  readonly byMessage: Prisma.ConversationWhereInput[];
  readonly byActivity: Prisma.ConversationWhereInput[];
} {
  return {
    byMessage: [{ lastMessageAt: { lt: bound } }, { NOT: { lastActivityAt: { gte: bound } } }],
    byActivity: [{ lastActivityAt: { lt: bound } }, { lastMessageAt: { lt: bound } }],
  };
}

function boundOf(curseur: RankedPageRequest<ListRankRow>['curseur']): Date | null {
  if (curseur.genre === 'borne') return curseur.rang;
  // Les rangs nuls sortent en QUEUE d'un tri `desc` : rien ne suit une
  // conversation sans message (voir `list-cursor.ts`).
  if (curseur.genre === 'queue') return new Date(0);
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

/** Les ids de la page, fusionnés par rang décroissant (A d'abord à égalité, ordre stable). */
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
    .sort((a, b) => rankMillis(b) - rankMillis(a))
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
  const byMessageOrder = { lastMessageAt: 'desc' } as const;

  const [firstRows, withActivity] = await Promise.all([
    readRows({ where: byMessageWhere, orderBy: byMessageOrder, skip: offset, take: limit }),
    prisma.conversation.findMany({
      where: byActivityWhere,
      orderBy: { lastActivityAt: 'desc' },
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
