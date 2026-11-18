import { describe, it, expect, jest } from '@jest/globals';
import { ACTIVE_CALL_SELECT, loadConversationListActivity, resolveActiveCall } from '../list-activity';
import { matchesMongoWhere } from '../../../../__tests__/helpers/mongo-where';

const NOW = new Date('2026-09-23T12:00:00Z');

const reactionRow = {
  id: 'r1',
  emoji: '👍',
  createdAt: new Date('2026-09-23T11:00:00Z'),
  participantId: 'p-alice',
  participant: { id: 'p-alice', userId: 'u-alice', displayName: 'Alice', user: null },
  message: { id: 'm1', senderId: 'p-bob', createdAt: new Date('2026-09-23T10:00:00Z'), deletedAt: null, content: 'Salut', originalLanguage: 'fr', translations: null, sender: { userId: 'u-bob' } },
};

const callRow = {
  id: 'call-1',
  conversationId: 'c2',
  status: 'active',
  startedAt: new Date('2026-09-23T11:55:00Z'),
  metadata: { type: 'video' },
  _count: { participants: 3 },
};

const makePrisma = () => ({
  reaction: { findMany: jest.fn(async (_args: unknown) => [reactionRow] as unknown[]) },
  callSession: { findMany: jest.fn(async (_args: unknown) => [callRow] as unknown[]) },
});

const reader = { viewerLanguages: ['fr'], historyFloorFor: () => null };

describe('loadConversationListActivity (#7545)', () => {
  it('une page = deux lectures batchées, quelle que soit sa taille', async () => {
    const prisma = makePrisma();
    await loadConversationListActivity(
      prisma,
      [
        { id: 'c1', lastReactionId: 'r1', activeCallId: null },
        { id: 'c2', lastReactionId: null, activeCallId: 'call-1' },
        { id: 'c3', lastReactionId: 'r-gone', activeCallId: 'call-gone' },
      ],
      reader,
      NOW,
    );
    expect(prisma.reaction.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.callSession.findMany).toHaveBeenCalledTimes(1);
  });

  it('résout la dernière réaction et l’appel en cours de chaque ligne', async () => {
    const activity = await loadConversationListActivity(
      makePrisma(),
      [
        { id: 'c1', lastReactionId: 'r1', activeCallId: null },
        { id: 'c2', lastReactionId: null, activeCallId: 'call-1' },
      ],
      reader,
      NOW,
    );
    expect(activity.get('c1')?.lastReaction).toMatchObject({ emoji: '👍', reactorName: 'Alice', targetSenderUserId: 'u-bob', excerpt: 'Salut' });
    expect(activity.get('c1')?.activeCall).toBeNull();
    expect(activity.get('c2')?.activeCall).toEqual({ id: 'call-1', kind: 'video', participantCount: 3, startedAt: '2026-09-23T11:55:00.000Z' });
    expect(activity.get('c2')?.lastReaction).toBeNull();
  });

  it('une lecture qui échoue rend null pour sa moitié, jamais une erreur', async () => {
    const prisma = makePrisma();
    prisma.reaction.findMany.mockRejectedValueOnce(new Error('mongo down') as never);
    const activity = await loadConversationListActivity(prisma, [{ id: 'c1', lastReactionId: 'r1', activeCallId: 'call-1' }], reader, NOW);
    expect(activity.get('c1')?.lastReaction).toBeNull();
    expect(activity.get('c1')?.activeCall).not.toBeNull();
  });

  it('le plancher du lecteur s’applique conversation par conversation', async () => {
    const activity = await loadConversationListActivity(
      makePrisma(),
      [{ id: 'c1', lastReactionId: 'r1', activeCallId: null }],
      { viewerLanguages: ['fr'], historyFloorFor: (id) => (id === 'c1' ? new Date('2026-09-23T10:30:00Z') : null) },
      NOW,
    );
    expect(activity.get('c1')?.lastReaction).toBeNull();
  });
});

describe('resolveActiveCall', () => {
  it('une session close n’est pas un appel en cours', () => {
    expect(resolveActiveCall({ ...callRow, status: 'ended' })).toBeNull();
  });

  it('un appel sans type déclaré est vocal', () => {
    expect(resolveActiveCall({ ...callRow, metadata: null })?.kind).toBe('audio');
  });
});

/**
 * #19690 — la pastille « N en appel » compte les participations VIVANTES, et une
 * participation vivante a DEUX formes en base : `leftAt` à `null`, ou `leftAt`
 * ABSENT (les lignes d'avant l'écriture explicite de l'audit C5). Le `where` du
 * `_count` portait `leftAt: null` NU, une égalité qui n'apparie pas une clé
 * absente : la seconde forme était sous-comptée.
 *
 * Le témoin ÉVALUE la clause contre des documents (`matchesMongoWhere`) au lieu
 * de la comparer à sa propre copie — une comparaison de clause passe aussi bien
 * avec la clause juste qu'avec la fausse.
 */
describe('le compte des participants d’un appel actif (#19690)', () => {
  const clause = () =>
    (ACTIVE_CALL_SELECT as unknown as { _count: { select: { participants: { where: Record<string, unknown> } } } })
      ._count.select.participants.where;

  it.each([
    ['la ligne nominale, sans clé leftAt', { id: 'cp-1' }],
    ['la ligne dont leftAt est remis à zéro', { id: 'cp-2', leftAt: null }],
  ])('compte %s', (_forme, row) => {
    expect(matchesMongoWhere(row, clause())).toBe(true);
  });

  it('ne compte pas une participation terminée', () => {
    expect(matchesMongoWhere({ id: 'cp-3', leftAt: new Date('2026-09-23T11:58:00Z') }, clause())).toBe(false);
  });
});
