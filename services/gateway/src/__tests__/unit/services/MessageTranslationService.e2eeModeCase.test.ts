/**
 * #14647 — le mode `e2ee` se reconnaît quelle que soit sa casse : un message
 * dont le serveur ne voit pas le clair ne part jamais vers le traducteur, même
 * étiqueté `E2EE` par un client ou une ligne héritée.
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

const makePrisma = () => ({
  conversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  message: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  messageTranslation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  participant: { findMany: jest.fn().mockResolvedValue([]) },
  userStats: { upsert: jest.fn() },
});

describe('MessageTranslationService — le mode e2ee, quelle que soit sa casse', () => {
  beforeEach(() => {
    mockZmqClient.sendTranslationRequest.mockReset();
  });

  it.each(['e2ee', 'E2EE', 'E2ee'])('un message %s n’est jamais envoyé au traducteur', async (mode) => {
    const service = new MessageTranslationService(makePrisma() as never);
    await service.initialize();

    const result = await service.handleNewMessage({
      id: '507f1f77bcf86cd799439051',
      conversationId: '507f1f77bcf86cd799439022',
      senderId: '507f1f77bcf86cd799439041',
      content: 'texte que le serveur ne doit pas lire',
      originalLanguage: 'fr',
      encryptionMode: mode,
      isEncrypted: true,
    });

    expect(result.status).toBe('e2ee_skipped');
    expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
  });
});
