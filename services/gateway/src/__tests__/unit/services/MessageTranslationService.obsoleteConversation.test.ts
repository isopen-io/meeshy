/**
 * #14643 — le chemin qui ÉCRIT un message hors de `MessagingService`
 * (`saveTranslationPathMessage`, appelé par `MessageTranslationService.handleNewMessage`) porte le second verrou
 * de l'obsolescence : dans une conversation obsolète, le message naît effacé,
 * ne repousse pas l'horloge de la liste, ne part pas au traducteur.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

class MockZMQClient extends EventEmitter {
  sendTranslationRequest = jest.fn();
  healthCheck = jest.fn();
  close = jest.fn();
  testReception = jest.fn();
}

const mockZmqClient = new MockZMQClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(mockZmqClient) },
}));
jest.mock('../../../services/EncryptionService', () =>
  jest.requireActual<typeof import('../../helpers/server-key-stub')>('../../helpers/server-key-stub').serverKeyStub(),
);

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439051';

const makePrisma = (deletedAt: Date | null) => ({
  conversation: {
    findFirst: jest.fn().mockResolvedValue({ id: CONVERSATION_ID }),
    findUnique: jest.fn().mockResolvedValue({ deletedAt }),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  message: {
    findFirst: jest.fn().mockResolvedValue({ id: MESSAGE_ID, conversationId: CONVERSATION_ID }),
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: MESSAGE_ID, conversationId: CONVERSATION_ID }),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  messageTranslation: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  participant: { findMany: jest.fn().mockResolvedValue([]) },
  userStats: { upsert: jest.fn() },
});

const newMessage = (content: string) => ({
  conversationId: CONVERSATION_ID,
  senderId: '507f1f77bcf86cd799439041',
  content,
  originalLanguage: 'fr',
});

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('MessageTranslationService — un message écrit dans une conversation obsolète', () => {
  beforeEach(() => {
    mockZmqClient.sendTranslationRequest.mockReset();
  });

  it.each(['bonjour à tous', '👍', 'https://meeshy.me'])(
    'naît effacé à la date de l’obsolescence, sans repousser lastMessageAt (%s)',
    async (content) => {
      const obsoletedAt = new Date('2026-11-02T10:00:00.000Z');
      const prisma = makePrisma(obsoletedAt);
      const service = new MessageTranslationService(prisma as never);
      await service.initialize();

      const result = await service.handleNewMessage(newMessage(content));
      await settle();

      expect(result.status).toBe('conversation_obsoleted');
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: MESSAGE_ID }),
        data: { deletedAt: obsoletedAt },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
    },
  );

  it('reste vivant et repousse lastMessageAt dans une conversation ouverte', async () => {
    const prisma = makePrisma(null);
    const service = new MessageTranslationService(prisma as never);
    await service.initialize();

    const result = await service.handleNewMessage(newMessage('👍'));

    expect(result.status).toBe('emoji_only_skipped');
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CONVERSATION_ID } }),
    );
  });
});
