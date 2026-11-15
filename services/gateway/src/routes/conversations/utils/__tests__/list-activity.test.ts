import { describe, it, expect, jest } from '@jest/globals';
import { loadConversationListActivity, resolveActiveCall } from '../list-activity';

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
