import type { Prisma } from '@meeshy/shared/prisma/client';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import type { CurseurDeListe } from '../list-cursor';

/**
 * **LA PAGE DE `GET /conversations`, TRIÉE PAR LE RANG DU LECTEUR** (#7592).
 *
 * rang = max(`lastMessageAt`, `lastReactionAt` quand `lastReactionTargetKey`
 * est le lecteur) — `listRankFromColumns`, la règle de `packages/shared`. Une
 * réaction à MON message remonte ma ligne ; une réaction entre tiers ne
 * réordonne rien.
 *
 * ## Pourquoi deux flux et pas un `orderBy`
 *
 * Un rang PAR LECTEUR ne s'écrit pas en `orderBy` Prisma. Mais seules les
 * lignes dont la dernière réaction vise le lecteur peuvent monter au-dessus de
 * leur `lastMessageAt`. D'où deux lectures bornées :
 *
 *   - A — toutes les lignes, par `lastMessageAt desc` ;
 *   - B — celles dont `lastReactionTargetKey` est le lecteur, par
 *     `lastReactionAt desc` (index `[lastReactionTargetKey, lastReactionAt]`).
 *
 * Le top-K par rang est inclus dans top-K(A) ∪ top-K(B) : une ligne de rang
 * `lastMessageAt` a moins de K lignes de `lastMessageAt` plus grand ; une
 * ligne REMONTÉE a moins de K lignes de B de `lastReactionAt` plus grand.
 *
 * ## Le chemin chaud reste à une lecture
 *
 * A (en lignes complètes, `skip`/`take` habituels) et B (clés seules) partent
 * en parallèle. Tant qu'aucune ligne de B n'est effectivement REMONTÉE (sa
 * réaction plus récente que son dernier message), A est déjà la bonne page.
 * Sinon seulement : les clés de A sur K = offset + limit, la fusion par rang,
 * et la lecture des lignes complètes qui manquent.
 *
 * ## Le curseur borne sur le RANG
 *
 * `rang < R` ⇔ `lastMessageAt < R` ET NON(la réaction vise le lecteur ET
 * `lastReactionAt ≥ R`). Le `NOT` d'une conjonction reste juste sur un champ
 * ABSENT (document antérieur à #7592) : la conjonction y est fausse, sa
 * négation vraie — aucune ligne héritée ne disparaît.
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
  lastReactionAt: true,
  lastReactionTargetKey: true,
} as const;

export interface ListRankRow {
  readonly id: string;
  readonly lastMessageAt?: Date | null;
  readonly lastReactionAt?: Date | null;
  readonly lastReactionTargetKey?: string | null;
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
  /** `User.id` d'un compte, `Participant.id` d'un invité — la clé des rooms `user:<clé>`. */
  readonly viewerKey: string;
  readonly curseur: Exclude<CurseurDeListe, { genre: 'refus' }>;
  readonly deltaOrder: boolean;
  readonly limit: number;
  readonly offset: number;
}

/** Borne `rang < R` du lecteur, en deux clauses — une par flux. */
function rankBound(viewerKey: string, bound: Date): {
  readonly byMessage: Prisma.ConversationWhereInput[];
  readonly byReaction: Prisma.ConversationWhereInput[];
} {
  return {
    byMessage: [
      { lastMessageAt: { lt: bound } },
      { NOT: { lastReactionTargetKey: viewerKey, lastReactionAt: { gte: bound } } },
    ],
    byReaction: [{ lastReactionAt: { lt: bound } }, { lastMessageAt: { lt: bound } }],
  };
}

function boundOf(curseur: RankedPageRequest<ListRankRow>['curseur']): Date | null {
  if (curseur.genre === 'borne') return curseur.rang;
  // Les rangs nuls sortent en QUEUE d'un tri `desc` : rien ne suit une
  // conversation sans message (voir `list-cursor.ts`).
  if (curseur.genre === 'queue') return new Date(0);
  return null;
}

function rankMillis(row: ListRankRow, viewerKey: string): number {
  return listRankFromColumns(row, viewerKey)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function isLifted(row: ListRankRow, viewerKey: string): boolean {
  const rank = listRankFromColumns(row, viewerKey);
  if (rank === null) return false;
  return !row.lastMessageAt || rank.getTime() > row.lastMessageAt.getTime();
}

/** Les ids de la page, fusionnés par rang décroissant (A d'abord à égalité, ordre stable). */
export function mergeByRank(
  byMessage: readonly ListRankRow[],
  lifted: readonly ListRankRow[],
  viewerKey: string,
  window: { readonly offset: number; readonly limit: number },
): string[] {
  const seen = new Set<string>();
  const unique = [...byMessage, ...lifted].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  return [...unique]
    .sort((a, b) => rankMillis(b, viewerKey) - rankMillis(a, viewerKey))
    .slice(window.offset, window.offset + window.limit)
    .map((row) => row.id);
}

export async function loadRankedConversationPage<Row extends ListRankRow>(
  request: RankedPageRequest<Row>,
): Promise<Row[]> {
  const { prisma, readRows, where, viewerKey, curseur, limit, offset } = request;

  if (request.deltaOrder && curseur.genre === 'absent') {
    return readRows({ where, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], skip: offset, take: limit });
  }

  const bound = boundOf(curseur);
  const clauses = bound ? rankBound(viewerKey, bound) : { byMessage: [], byReaction: [] };
  const byMessageWhere: Prisma.ConversationWhereInput = clauses.byMessage.length
    ? { AND: [where, ...clauses.byMessage] }
    : where;
  const byReactionWhere: Prisma.ConversationWhereInput = {
    AND: [where, { lastReactionTargetKey: viewerKey }, ...clauses.byReaction],
  };
  const window = offset + limit;
  const byMessageOrder = { lastMessageAt: 'desc' } as const;

  const [firstRows, reactedToViewer] = await Promise.all([
    readRows({ where: byMessageWhere, orderBy: byMessageOrder, skip: offset, take: limit }),
    prisma.conversation.findMany({
      where: byReactionWhere,
      orderBy: { lastReactionAt: 'desc' },
      take: window,
      select: LIST_RANK_SELECT,
    }),
  ]);

  const lifted = reactedToViewer.filter((row) => isLifted(row, viewerKey));
  if (lifted.length === 0) return firstRows;

  const byMessageKeys = await prisma.conversation.findMany({
    where: byMessageWhere,
    orderBy: byMessageOrder,
    take: window,
    select: LIST_RANK_SELECT,
  });
  const pageIds = mergeByRank(byMessageKeys, lifted, viewerKey, { offset, limit });

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
