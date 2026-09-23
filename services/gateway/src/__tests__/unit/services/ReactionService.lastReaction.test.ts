import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ReactionService } from '../../../services/ReactionService';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const REACTION_ID = '507f1f77bcf86cd799439044';

const makePrisma = () => {
  const conversationUpdate = jest.fn(async (_args: unknown) => ({}));
  const conversationUpdateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
  const prisma = {
    message: {
      findUnique: jest.fn(async () => ({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        deletedAt: null,
        messageType: 'text',
        conversation: { id: CONVERSATION_ID, isActive: true, closedAt: null, participants: [{ id: PARTICIPANT_ID }] },
      })),
      update: jest.fn(async () => ({})),
    },
    reaction: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
      upsert: jest.fn(async () => ({
        id: REACTION_ID,
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '❤️',
        createdAt: new Date('2026-09-23T10:00:00Z'),
        updatedAt: new Date('2026-09-23T10:00:00Z'),
      })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    conversation: { update: conversationUpdate, updateMany: conversationUpdateMany },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return { prisma, conversationUpdate, conversationUpdateMany };
};

describe('ReactionService — la dernière réaction de la conversation (#7545)', () => {
  it("un ajout réel devient la dernière réaction de la conversation", async () => {
    const { prisma, conversationUpdate } = makePrisma();
    const service = new ReactionService(prisma as unknown as PrismaClient);

    await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });

    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID },
      data: { lastReactionId: REACTION_ID },
    });
  });

  it("un ajout sans effet (emoji déjà posé) ne réécrit rien", async () => {
    const { prisma, conversationUpdate } = makePrisma();
    prisma.reaction.findFirst.mockResolvedValueOnce({ id: REACTION_ID, messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️', createdAt: new Date(), updatedAt: new Date() } as never);
    const service = new ReactionService(prisma as unknown as PrismaClient);

    await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });

    expect(conversationUpdate).not.toHaveBeenCalled();
  });

  it("l'échec de l'écriture dénormalisée ne fait pas échouer la réaction", async () => {
    const { prisma, conversationUpdate } = makePrisma();
    conversationUpdate.mockRejectedValueOnce(new Error('mongo down') as never);
    const service = new ReactionService(prisma as unknown as PrismaClient);

    const result = await service.addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });

    expect(result?.unchanged).toBe(false);
  });

  it("retirer la dernière réaction l'efface de la conversation, et seulement elle", async () => {
    const { prisma, conversationUpdateMany } = makePrisma();
    prisma.reaction.findFirst.mockResolvedValueOnce({ id: REACTION_ID, message: { conversationId: CONVERSATION_ID } } as never);
    const service = new ReactionService(prisma as unknown as PrismaClient);

    await service.removeReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });

    expect(conversationUpdateMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, lastReactionId: REACTION_ID },
      data: { lastReactionId: null },
    });
  });
});
