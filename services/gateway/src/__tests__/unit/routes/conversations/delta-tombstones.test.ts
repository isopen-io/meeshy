/**
 * Tests — pierres tombales du delta `GET /conversations?updatedSince=`.
 *
 * Le delta est UPSERT-ONLY : son `whereClause` exige `isActive: true` et un
 * participant actif sans `deletedForMe`. Une conversation fermée, quittée,
 * supprimée-pour-moi depuis un autre appareil, ou dont l'utilisateur a été
 * banni pendant sa coupure ne sort donc JAMAIS du delta — elle reste en cache
 * local jusqu'à la réconciliation complète (24 h sur les deux plateformes).
 *
 * Ces gardes verrouillent la sortie manquante : trois lectures ids-only,
 * cappées, qui ne partent QUE sur une page delta.
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  CONVERSATION_TOMBSTONE_LIMIT,
  loadConversationTombstones,
} from '../../../../routes/conversations/utils/delta-tombstones';

const USER_ID = '507f1f77bcf86cd799439022';
const SINCE = new Date('2026-08-01T00:00:00.000Z');

type PrismaStub = {
  conversation: { findMany: jest.Mock };
  participant: { findMany: jest.Mock };
};

const makePrisma = (over: {
  closed?: Array<{ id: string }>;
  deletedForMe?: Array<{ conversationId: string }>;
  leftOrBanned?: Array<{ conversationId: string }>;
} = {}): PrismaStub => {
  const participantFindMany = jest
    .fn<any>()
    .mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.deletedForMe ? over.deletedForMe ?? [] : over.leftOrBanned ?? [],
      ),
    );
  return {
    conversation: { findMany: jest.fn<any>().mockResolvedValue(over.closed ?? []) },
    participant: { findMany: participantFindMany },
  };
};

describe('loadConversationTombstones', () => {
  it('returns the id of a conversation closed after `since`', async () => {
    const prisma = makePrisma({ closed: [{ id: 'c-closed' }] });

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(result.ids).toEqual(['c-closed']);
    expect(result.truncated).toBe(false);
  });

  it('does NOT filter the closed lookup on an ACTIVE participant', async () => {
    // Un utilisateur banni a `isActive: false` sur son participant. Le filtrer
    // ici lui cacherait justement la fermeture qu'il doit voir : sa ligne
    // resterait affichée à vie, sans aucun autre canal pour la contredire.
    const prisma = makePrisma();

    await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    const where = prisma.conversation.findMany.mock.calls[0]![0]!.where as {
      participants: { some: Record<string, unknown> };
    };
    expect(where.participants.some).toEqual({ userId: USER_ID });
  });

  it('returns a conversation deleted-for-me from another device', async () => {
    const prisma = makePrisma({ deletedForMe: [{ conversationId: 'c-dfm' }] });

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(result.ids).toEqual(['c-dfm']);
  });

  it('returns conversations the user left or was banned from', async () => {
    // Un leave/ban n'écrit QUE la ligne Participant — `Conversation.updatedAt`
    // ne bouge pas. Interroger la conversation ne les verrait donc jamais.
    const prisma = makePrisma({ leftOrBanned: [{ conversationId: 'c-left' }, { conversationId: 'c-ban' }] });

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect([...result.ids].sort()).toEqual(['c-ban', 'c-left']);
  });

  it('bounds every stream strictly after `since`', async () => {
    const prisma = makePrisma();

    await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(prisma.conversation.findMany.mock.calls[0]![0]!.where.closedAt).toEqual({ gt: SINCE });
    const participantWheres = prisma.participant.findMany.mock.calls.map((c: any) => c[0].where);
    const deletedForMeWhere = participantWheres.find((w: any) => w.deletedForMe);
    const leftWhere = participantWheres.find((w: any) => w.OR);
    expect(deletedForMeWhere).toEqual({ userId: USER_ID, deletedForMe: { gt: SINCE } });
    expect(leftWhere).toEqual({
      userId: USER_ID,
      OR: [{ leftAt: { gt: SINCE } }, { bannedAt: { gt: SINCE } }],
    });
  });

  it('dedupes an id that appears in more than one stream', async () => {
    // Quitter une conversation puis la voir fermée produit la même id deux
    // fois : le client n'a rien à faire d'un doublon.
    const prisma = makePrisma({
      closed: [{ id: 'c-same' }],
      leftOrBanned: [{ conversationId: 'c-same' }],
    });

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(result.ids).toEqual(['c-same']);
  });

  it('flags truncation with a cap+1 probe rather than an equality on the cap', async () => {
    // Une égalité sur le cap ne prouve rien : une fenêtre de très exactement
    // `LIMIT` tombstones est COMPLÈTE. Seule la ligne surnuméraire tranche.
    const overflow = Array.from({ length: CONVERSATION_TOMBSTONE_LIMIT + 1 }, (_, n) => ({ id: `c${n}` }));
    const prisma = makePrisma({ closed: overflow });

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(result.truncated).toBe(true);
    expect(result.ids).toHaveLength(CONVERSATION_TOMBSTONE_LIMIT);
    expect(prisma.conversation.findMany.mock.calls[0]![0]!.take).toBe(CONVERSATION_TOMBSTONE_LIMIT + 1);
  });

  it('does not flag truncation on a window of exactly the cap', async () => {
    const exact = Array.from({ length: CONVERSATION_TOMBSTONE_LIMIT }, (_, n) => ({ id: `c${n}` }));
    const prisma = makePrisma({ closed: exact });

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(result.truncated).toBe(false);
    expect(result.ids).toHaveLength(CONVERSATION_TOMBSTONE_LIMIT);
  });

  it('reads ids only — no conversation body is fetched for a tombstone', async () => {
    const prisma = makePrisma();

    await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(prisma.conversation.findMany.mock.calls[0]![0]!.select).toEqual({ id: true });
    for (const call of prisma.participant.findMany.mock.calls) {
      expect((call as any)[0].select).toEqual({ conversationId: true });
    }
  });

  it('degrades to "cannot assert completeness" when a lookup throws', async () => {
    // Poser `truncated: true` plutôt que de faire échouer la lecture : le
    // client escalade vers la réconciliation complète, qui est exactement le
    // recours dont il dispose. Faire échouer la LISTE parce qu'on n'a pas su
    // calculer une purge serait l'inverse du compromis (montrer la
    // conversation est le produit ; la retirer est une courtoisie).
    const prisma = makePrisma();
    prisma.conversation.findMany.mockRejectedValue(new Error('mongo down'));

    const result = await loadConversationTombstones(prisma as never, { userId: USER_ID, since: SINCE });

    expect(result.ids).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('issues no query at all for an anonymous caller (owns none of these rows)', async () => {
    const prisma = makePrisma();

    const result = await loadConversationTombstones(prisma as never, { userId: null, since: SINCE });

    expect(result).toEqual({ ids: [], truncated: false });
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});
