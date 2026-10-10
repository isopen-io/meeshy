/**
 * La page 2 de la liste des conversations garde les conversations sans
 * activité (#8309).
 *
 * `lastActivityAt` (#9026) n'est écrit qu'à la première réaction, au premier
 * appel ou à la première épingle : une conversation qui n'a connu que des
 * messages n'en porte PAS la clé. Le curseur bornait le flux « par message »
 * avec `NOT: { lastActivityAt: { gte } }`, que Prisma, sur MongoDB, n'apparie
 * jamais quand la clé est absente — chaque page au-delà de la première perdait
 * ces conversations. Le double évalue le `where` avec les sémantiques MESURÉES
 * (`helpers/mongo-where.ts`).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { loadRankedConversationPage, type ListRankRow, type RowsQuery } from '../../../routes/conversations/utils/list-rank';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

const at = (iso: string) => new Date(iso);

const conversations: readonly (ListRankRow & MongoDocument)[] = [
  { id: 'recente', lastMessageAt: at('2026-09-30T10:00:00Z'), lastActivityAt: at('2026-10-01T10:00:00Z') },
  { id: 'messages-seulement', lastMessageAt: at('2026-09-20T10:00:00Z') },
  { id: 'activite-effacee', lastMessageAt: at('2026-09-19T10:00:00Z'), lastActivityAt: null },
  { id: 'activite-ancienne', lastMessageAt: at('2026-09-18T10:00:00Z'), lastActivityAt: at('2026-09-18T11:00:00Z') },
  { id: 'remontee-au-dessus', lastMessageAt: at('2026-09-17T10:00:00Z'), lastActivityAt: at('2026-09-29T10:00:00Z') },
];

const rank = (row: ListRankRow) => Math.max(row.lastMessageAt?.getTime() ?? 0, row.lastActivityAt?.getTime() ?? 0);

const read = (where: MongoDocument, take: number, skip = 0) =>
  conversations
    .filter((row) => matchesMongoWhere(row, where))
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
    .slice(skip, skip + take);

const prisma = {
  conversation: {
    findMany: async (args: { where: MongoDocument; orderBy: Record<string, 'asc' | 'desc'>; take: number }) => {
      const key = Object.keys(args.orderBy)[0] as 'lastMessageAt' | 'lastActivityAt';
      return conversations
        .filter((row) => matchesMongoWhere(row, args.where))
        .sort((a, b) => (b[key]?.getTime() ?? 0) - (a[key]?.getTime() ?? 0))
        .slice(0, args.take);
    },
  },
};

const page = (bound: Date, limit: number) =>
  loadRankedConversationPage({
    prisma: prisma as never,
    readRows: async (query: RowsQuery) => read(query.where as MongoDocument, query.take, query.skip),
    where: {},
    curseur: { genre: 'borne', rang: bound } as never,
    deltaOrder: false,
    limit,
    offset: 0,
  });

describe('le curseur de la liste borne sur le rang sans perdre les conversations sans activité (#8309)', () => {
  it('sert, après la borne, la conversation qui ne porte pas la clé lastActivityAt', async () => {
    const ids = (await page(at('2026-09-25T00:00:00Z'), 10)).map((row) => row.id);
    expect(ids).toContain('messages-seulement');
  });

  it('sert toutes les conversations de rang inférieur à la borne, dans l’ordre du rang', async () => {
    const bound = at('2026-09-25T00:00:00Z');
    const expected = conversations
      .filter((row) => rank(row) < bound.getTime())
      .sort((a, b) => rank(b) - rank(a))
      .map((row) => row.id);

    expect((await page(bound, 10)).map((row) => row.id)).toEqual(expected);
  });

  it('n’y remet pas une conversation remontée au-dessus de la borne par son activité', async () => {
    const ids = (await page(at('2026-09-25T00:00:00Z'), 10)).map((row) => row.id);
    expect(ids).not.toContain('remontee-au-dessus');
    expect(ids).not.toContain('recente');
  });
});
