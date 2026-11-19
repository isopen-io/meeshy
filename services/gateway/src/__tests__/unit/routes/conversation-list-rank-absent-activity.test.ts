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
import type { MongoDocument } from '../../helpers/mongo-where';
import { moteurDeRang } from '../../helpers/list-rank-engine';

const at = (iso: string) => new Date(iso);

const conversations: readonly (ListRankRow & MongoDocument)[] = [
  { id: 'recente', lastMessageAt: at('2026-09-30T10:00:00Z'), lastActivityAt: at('2026-10-01T10:00:00Z') },
  { id: 'messages-seulement', lastMessageAt: at('2026-09-20T10:00:00Z') },
  { id: 'activite-effacee', lastMessageAt: at('2026-09-19T10:00:00Z'), lastActivityAt: null },
  { id: 'activite-ancienne', lastMessageAt: at('2026-09-18T10:00:00Z'), lastActivityAt: at('2026-09-18T11:00:00Z') },
  { id: 'remontee-au-dessus', lastMessageAt: at('2026-09-17T10:00:00Z'), lastActivityAt: at('2026-09-29T10:00:00Z') },
];

const rank = (row: ListRankRow) => Math.max(row.lastMessageAt?.getTime() ?? 0, row.lastActivityAt?.getTime() ?? 0);

const page = (bound: Date, limit: number) => {
  const moteur = moteurDeRang(conversations as readonly MongoDocument[]);
  return loadRankedConversationPage({
    prisma: moteur.prisma as never,
    readRows: moteur.readRows as never,
    where: {},
    // Pas d'id : cette suite borne sur un INSTANT choisi, pas sur une ligne
    // existante. `boundOf` retombe alors sur la borne STRICTE — exactement ce
    // que cette suite garde depuis #8309, et ce que #19881 ne change pas.
    curseur: { genre: 'borne', rang: bound } as never,
    deltaOrder: false,
    limit,
    offset: 0,
  });
};

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
