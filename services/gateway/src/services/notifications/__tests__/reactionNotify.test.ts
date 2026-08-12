import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { notifyReactionAdded } from '../reactionNotify';

const makeNotificationService = () => ({
  createReactionNotification: jest.fn(),
});

type MockPrismaOptions = {
  message?: { senderId: string | null; conversationId: string } | null;
  authorParticipant?: { userId: string } | null;
  reactorParticipant?: { userId: string } | null;
};

const makePrisma = ({
  message = { senderId: 'participant-author', conversationId: 'conv-1' } as { senderId: string | null; conversationId: string } | null,
  authorParticipant = { userId: 'user-author' } as { userId: string } | null,
  reactorParticipant = { userId: 'user-reactor' } as { userId: string } | null,
}: MockPrismaOptions = {}) => ({
  message: {
    findUnique: jest.fn().mockResolvedValue(message),
  },
  participant: {
    findUnique: jest.fn()
      .mockResolvedValueOnce(authorParticipant)
      .mockResolvedValueOnce(reactorParticipant),
  },
});

const BASE_PARAMS = {
  messageId: 'msg-001',
  reactorParticipantId: 'participant-reactor',
  emoji: '👍',
  isAnonymous: false,
};

describe('notifyReactionAdded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('anonymous reactor', () => {
    it('returns immediately without any DB calls', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        { ...BASE_PARAMS, isAnonymous: true },
      );
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('message not found', () => {
    it('returns without participant lookup or notification when message is null', async () => {
      const prisma = makePrisma({ message: null });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.message.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });

    it('returns without participant lookup when message.senderId is null', async () => {
      const prisma = makePrisma({ message: { senderId: null, conversationId: 'conv-1' } });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.participant.findUnique).not.toHaveBeenCalled();
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('participant resolution failures', () => {
    it('returns without notification when author participant is not found', async () => {
      const prisma = makePrisma({ authorParticipant: null });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.participant.findUnique).toHaveBeenCalledTimes(2);
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });

    it('returns without notification when reactor participant is not found', async () => {
      const prisma = makePrisma({ reactorParticipant: null });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('self-reaction', () => {
    it('returns without notification when author and reactor are the same user', async () => {
      const prisma = makePrisma({
        authorParticipant: { userId: 'user-same' },
        reactorParticipant: { userId: 'user-same' },
      });
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(notificationService.createReactionNotification).not.toHaveBeenCalled();
    });
  });

  describe('valid notification', () => {
    it('calls createReactionNotification with resolved user IDs', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(notificationService.createReactionNotification).toHaveBeenCalledTimes(1);
      expect(notificationService.createReactionNotification).toHaveBeenCalledWith({
        messageAuthorId: 'user-author',
        reactorUserId: 'user-reactor',
        messageId: 'msg-001',
        conversationId: 'conv-1',
        reactionEmoji: '👍',
      });
    });

    it('looks up message by the provided messageId', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        { ...BASE_PARAMS, messageId: 'msg-xyz' },
      );
      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: 'msg-xyz' },
        select: { senderId: true, conversationId: true },
      });
    });

    it('resolves both participants in parallel', async () => {
      const prisma = makePrisma();
      const notificationService = makeNotificationService();
      await notifyReactionAdded(
        { prisma: prisma as any, notificationService: notificationService as any },
        BASE_PARAMS,
      );
      expect(prisma.participant.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
