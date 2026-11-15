/**
 * L'axe « réaction » (#8906) : le RÉACTEUR est crédité, dans la conversation
 * du message, une fois par réaction réellement posée.
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ReactionService } from '../../../services/ReactionService';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const REACTOR_USER_ID = '507f1f77bcf86cd799439077';

function makePrisma(options: { reactorUserId?: string | null; alreadyReacted?: boolean } = {}) {
  const reactorUserId = options.reactorUserId === undefined ? REACTOR_USER_ID : options.reactorUserId;
  const prisma = {
    message: {
      findUnique: jest.fn(async () => ({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        senderId: 'author-participant',
        sender: { userId: 'author-user' },
        deletedAt: null,
        messageType: 'text',
        conversation: {
          id: CONVERSATION_ID,
          isActive: true,
          closedAt: null,
          participants: [{ id: PARTICIPANT_ID, userId: reactorUserId }],
        },
      })),
      update: jest.fn(async () => ({})),
    },
    reaction: {
      findFirst: jest.fn(async () =>
        options.alreadyReacted
          ? { id: 'r-0', messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️', createdAt: new Date(), updatedAt: new Date() }
          : null,
      ),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({
        id: 'r-1',
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '❤️',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    conversation: { update: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return prisma as unknown as PrismaClient;
}

const makeEngagement = () => ({
  recordActivity: jest.fn(async (_userId: string, _axisKey: string, _options?: { conversationId?: string }) => undefined),
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ReactionService — crédit tool.reaction', () => {
  it('crédite le réacteur, dans la conversation du message, quand la réaction est posée', async () => {
    const engagement = makeEngagement();
    const service = new ReactionService(makePrisma(), engagement);

    await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });
    await flush();

    expect(engagement.recordActivity).toHaveBeenCalledTimes(1);
    expect(engagement.recordActivity).toHaveBeenCalledWith(REACTOR_USER_ID, 'tool.reaction', {
      conversationId: CONVERSATION_ID,
    });
  });

  it('ne crédite rien quand la réaction était déjà posée (no-op)', async () => {
    const engagement = makeEngagement();
    const service = new ReactionService(makePrisma({ alreadyReacted: true }), engagement);

    const result = await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });
    await flush();

    expect(result?.unchanged).toBe(true);
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien au retrait', async () => {
    const engagement = makeEngagement();
    const service = new ReactionService(makePrisma(), engagement);

    await service.removeReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' }).catch(() => undefined);
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite rien pour un participant anonyme', async () => {
    const engagement = makeEngagement();
    const service = new ReactionService(makePrisma({ reactorUserId: null }), engagement);

    await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });
    await flush();

    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it('un crédit en panne ne fait pas échouer la réaction', async () => {
    const engagement = { recordActivity: jest.fn(async () => { throw new Error('engagement down'); }) };
    const service = new ReactionService(makePrisma(), engagement);

    const result = await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });
    await flush();

    expect(result?.unchanged).toBe(false);
  });
});
