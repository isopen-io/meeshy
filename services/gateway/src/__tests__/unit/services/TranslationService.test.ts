/**
 * Unit tests for TranslationService
 *
 * Tests:
 * - Message handling (new messages and retranslations)
 * - Translation processing and language extraction
 * - Database operations (save messages, translations)
 * - Error handling and edge cases
 * - Statistics tracking
 * - Health check functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Use any type to avoid TypeScript strict mode issues with jest.fn()
type MockFn = jest.Mock<any, any>;

// Mock ZMQ client
class MockZMQClient extends EventEmitter {
  sendTranslationRequest: MockFn = jest.fn();
  healthCheck: MockFn = jest.fn();
  close: MockFn = jest.fn();
  testReception: MockFn = jest.fn();

  removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    return this;
  }
}

// Mock ZMQ Singleton
const mockZmqClient = new MockZMQClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue(mockZmqClient)
  }
}));

// Import after mocking
import { TranslationService, MessageData, TranslationServiceStats } from '../../../services/TranslationService';
import { TranslationResult } from '../../../services/ZmqTranslationClient';
import { ZMQSingleton } from '../../../services/ZmqSingleton';

// Mock Prisma client factory
const createMockPrisma = () => ({
  conversation: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  message: {
    findFirst: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  messageTranslation: {
    findFirst: jest.fn() as MockFn,
    findMany: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    upsert: jest.fn() as MockFn,
    deleteMany: jest.fn() as MockFn
  },
  conversationMember: {
    findMany: jest.fn() as MockFn
  },
  anonymousParticipant: {
    findMany: jest.fn() as MockFn
  },
  userStats: {
    upsert: jest.fn() as MockFn
  }
});

describe('TranslationService', () => {
  let translationService: TranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset the mock ZMQ client
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset();
    mockZmqClient.healthCheck.mockReset();
    mockZmqClient.close.mockReset();
    mockZmqClient.testReception.mockReset();

    mockPrisma = createMockPrisma();
    translationService = new TranslationService(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should create a new TranslationService instance', () => {
      expect(translationService).toBeDefined();
      expect(translationService).toBeInstanceOf(TranslationService);
      expect(translationService).toBeInstanceOf(EventEmitter);
    });

    it('should initialize with default stats', () => {
      const stats = translationService.getStats();

      expect(stats.messages_saved).toBe(0);
      expect(stats.translation_requests_sent).toBe(0);
      expect(stats.translations_received).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.pool_full_rejections).toBe(0);
    });

    it('should initialize ZMQ client on initialize()', async () => {
      await translationService.initialize();

      expect(ZMQSingleton.getInstance).toHaveBeenCalled();
    });

    it('should not re-initialize if already initialized', async () => {
      await translationService.initialize();
      const callCount = (ZMQSingleton.getInstance as MockFn).mock.calls.length;

      await translationService.initialize();

      // Should only be called once
      expect((ZMQSingleton.getInstance as MockFn).mock.calls.length).toBe(callCount);
    });

    it('should throw error if ZMQ initialization fails', async () => {
      (ZMQSingleton.getInstance as MockFn).mockRejectedValueOnce(new Error('ZMQ connection failed'));

      const newService = new TranslationService(mockPrisma as any);

      await expect(newService.initialize()).rejects.toThrow('ZMQ connection failed');
    });
  });

  describe('handleNewMessage - New Messages', () => {
    beforeEach(async () => {
      await translationService.initialize();
      mockZmqClient.sendTranslationRequest.mockResolvedValue('task-123');
    });

    it('should save a new message and return messageId', async () => {
      const messageData: MessageData = {
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'Hello world',
        originalLanguage: 'en'
      };

      // Mock conversation exists
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });

      // Mock message creation
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-789',
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'Hello world',
        originalLanguage: 'en',
        createdAt: new Date()
      });

      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-789',
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'Hello world',
        originalLanguage: 'en'
      });

      const result = await translationService.handleNewMessage(messageData);

      expect(result).toBeDefined();
      expect(result.messageId).toBe('msg-789');
      expect(result.status).toBe('message_saved');
      expect(mockPrisma.message.create).toHaveBeenCalled();
    });

    it('should create conversation if it does not exist', async () => {
      const messageData: MessageData = {
        conversationId: 'new-conv-123',
        senderId: 'user-456',
        content: 'Hello',
        originalLanguage: 'en'
      };

      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({ id: 'new-conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-new',
        conversationId: 'new-conv-123',
        content: 'Hello',
        originalLanguage: 'en'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-new',
        conversationId: 'new-conv-123',
        content: 'Hello',
        originalLanguage: 'en'
      });

      await translationService.handleNewMessage(messageData);

      expect(mockPrisma.conversation.create).toHaveBeenCalled();
      const createCall = mockPrisma.conversation.create.mock.calls[0][0];
      expect(createCall.data.id).toBe('new-conv-123');
      expect(createCall.data.type).toBe('group');
    });

    it('should handle message with anonymous sender', async () => {
      const messageData: MessageData = {
        conversationId: 'conv-123',
        anonymousSenderId: 'anon-user-123',
        content: 'Anonymous message',
        originalLanguage: 'fr'
      };

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-anon',
        conversationId: 'conv-123',
        anonymousSenderId: 'anon-user-123',
        content: 'Anonymous message',
        originalLanguage: 'fr'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-anon',
        conversationId: 'conv-123',
        content: 'Anonymous message',
        originalLanguage: 'fr'
      });

      const result = await translationService.handleNewMessage(messageData);

      expect(result.messageId).toBe('msg-anon');
      const createCall = mockPrisma.message.create.mock.calls[0][0];
      expect(createCall.data.anonymousSenderId).toBe('anon-user-123');
      expect(createCall.data.senderId).toBeNull();
    });

    it('should handle message with replyToId', async () => {
      const messageData: MessageData = {
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'This is a reply',
        originalLanguage: 'en',
        replyToId: 'original-msg-123'
      };

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'reply-msg',
        replyToId: 'original-msg-123'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'reply-msg',
        conversationId: 'conv-123',
        content: 'This is a reply',
        originalLanguage: 'en'
      });

      await translationService.handleNewMessage(messageData);

      const createCall = mockPrisma.message.create.mock.calls[0][0];
      expect(createCall.data.replyToId).toBe('original-msg-123');
    });

    it('should increment messages_saved stat on new message', async () => {
      const messageData: MessageData = {
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'Test',
        originalLanguage: 'en'
      };

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-1', content: 'Test', originalLanguage: 'en', conversationId: 'conv-123' });

      await translationService.handleNewMessage(messageData);

      const stats = translationService.getStats();
      expect(stats.messages_saved).toBe(1);
    });

    it('should throw error if database save fails', async () => {
      const messageData: MessageData = {
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'Test',
        originalLanguage: 'en'
      };

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockRejectedValue(new Error('Database error'));

      await expect(translationService.handleNewMessage(messageData)).rejects.toThrow('Database error');
    });
  });

  describe('handleNewMessage - Retranslation', () => {
    beforeEach(async () => {
      await translationService.initialize();
      mockZmqClient.sendTranslationRequest.mockResolvedValue('task-retrans');
    });

    it('should handle retranslation for existing message', async () => {
      const messageData: MessageData = {
        id: 'existing-msg-123',
        conversationId: 'conv-123',
        content: 'Already exists',
        originalLanguage: 'en'
      };

      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'existing-msg-123',
        conversationId: 'conv-123',
        content: 'Already exists',
        originalLanguage: 'en'
      });
      mockPrisma.messageTranslation.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);

      const result = await translationService.handleNewMessage(messageData);

      expect(result.messageId).toBe('existing-msg-123');
      expect(result.status).toBe('retranslation_queued');
      // Should not create a new message
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('should throw error if message for retranslation not found', async () => {
      const messageData: MessageData = {
        id: 'non-existent-msg',
        conversationId: 'conv-123',
        content: 'Does not exist',
        originalLanguage: 'en'
      };

      mockPrisma.message.findFirst.mockResolvedValue(null);

      await expect(translationService.handleNewMessage(messageData))
        .rejects.toThrow('non-existent-msg');
    });
  });

  describe('getTranslation', () => {
    beforeEach(async () => {
      await translationService.initialize();
    });

    it('should return translation from database if not in cache', async () => {
      mockPrisma.messageTranslation.findFirst.mockResolvedValue({
        id: 'trans-456',
        messageId: 'msg-456',
        targetLanguage: 'en',
        translatedContent: 'Hello world',
        translationModel: 'basic',
        confidenceScore: 0.90,
        message: {
          originalLanguage: 'fr'
        }
      });

      const result = await translationService.getTranslation('msg-456', 'en');

      expect(result).toBeDefined();
      expect(result?.translatedText).toBe('Hello world');
      expect(result?.sourceLanguage).toBe('fr');
      expect(mockPrisma.messageTranslation.findFirst).toHaveBeenCalledWith({
        where: {
          messageId: 'msg-456',
          targetLanguage: 'en'
        },
        include: {
          message: {
            select: { originalLanguage: true }
          }
        }
      });
    });

    it('should return null if translation not found', async () => {
      mockPrisma.messageTranslation.findFirst.mockResolvedValue(null);

      const result = await translationService.getTranslation('msg-not-found', 'de');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockPrisma.messageTranslation.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await translationService.getTranslation('msg-error', 'fr');

      expect(result).toBeNull();
    });

    it('should use cache key with source language when provided', async () => {
      mockPrisma.messageTranslation.findFirst.mockResolvedValue({
        id: 'trans-src',
        messageId: 'msg-src',
        targetLanguage: 'fr',
        translatedContent: 'Bonjour',
        translationModel: 'premium',
        confidenceScore: 0.95,
        message: {
          originalLanguage: 'en'
        }
      });

      const result = await translationService.getTranslation('msg-src', 'fr', 'en');

      expect(result).toBeDefined();
      expect(result?.translatedText).toBe('Bonjour');
    });
  });

  describe('translateTextDirectly', () => {
    beforeEach(async () => {
      await translationService.initialize();
    });

    it('should send translation request and wait for response', async () => {
      const taskId = 'direct-task-123';
      mockZmqClient.sendTranslationRequest.mockResolvedValue(taskId);

      // Simulate async response
      const translationPromise = translationService.translateTextDirectly(
        'Hello world',
        'en',
        'fr',
        'premium'
      );

      // Emit the translation completed event after a short delay
      setTimeout(() => {
        mockZmqClient.emit('translationCompleted', {
          taskId: taskId,
          result: {
            messageId: `rest_${Date.now()}`,
            translatedText: 'Bonjour le monde',
            sourceLanguage: 'en',
            targetLanguage: 'fr',
            confidenceScore: 0.95,
            processingTime: 150,
            modelType: 'premium'
          },
          targetLanguage: 'fr'
        });
      }, 50);

      const result = await translationPromise;

      expect(result).toBeDefined();
      expect(result.translatedText).toBe('Bonjour le monde');
      expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    });

    it('should handle translation error', async () => {
      const taskId = 'error-task-123';
      mockZmqClient.sendTranslationRequest.mockResolvedValue(taskId);

      const translationPromise = translationService.translateTextDirectly(
        'Hello',
        'en',
        'fr'
      );

      // Emit error event
      setTimeout(() => {
        mockZmqClient.emit('translationError', {
          taskId: taskId,
          error: 'Translation service unavailable'
        });
      }, 50);

      const result = await translationPromise;

      // Should return fallback result
      expect(result).toBeDefined();
      expect(result.modelType).toBe('fallback');
      expect(result.confidenceScore).toBe(0.1);
    });
  });

  describe('getStats', () => {
    it('should return current statistics with uptime', () => {
      const stats = translationService.getStats();

      expect(stats).toBeDefined();
      expect(stats.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(stats.memory_usage_mb).toBeGreaterThan(0);
      expect(typeof stats.messages_saved).toBe('number');
      expect(typeof stats.translation_requests_sent).toBe('number');
      expect(typeof stats.translations_received).toBe('number');
      expect(typeof stats.errors).toBe('number');
    });

    it('should track stats accurately over multiple operations', async () => {
      await translationService.initialize();

      // Setup mocks for message saving
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-1', content: 'Test', originalLanguage: 'en', conversationId: 'conv-123' });
      mockZmqClient.sendTranslationRequest.mockResolvedValue('task-1');

      // Save a message
      await translationService.handleNewMessage({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Test message',
        originalLanguage: 'en'
      });

      const stats = translationService.getStats();
      expect(stats.messages_saved).toBe(1);
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      await translationService.initialize();
    });

    it('should return true when ZMQ client is healthy', async () => {
      mockZmqClient.healthCheck.mockResolvedValue(true);

      const isHealthy = await translationService.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockZmqClient.healthCheck).toHaveBeenCalled();
    });

    it('should return false when ZMQ client is unhealthy', async () => {
      mockZmqClient.healthCheck.mockResolvedValue(false);

      const isHealthy = await translationService.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should return false on health check error', async () => {
      mockZmqClient.healthCheck.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await translationService.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      await translationService.initialize();
    });

    it('should close ZMQ client connection', async () => {
      mockZmqClient.close.mockResolvedValue(undefined);

      await translationService.close();

      expect(mockZmqClient.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockZmqClient.close.mockRejectedValue(new Error('Close failed'));

      // Should not throw
      await expect(translationService.close()).resolves.not.toThrow();
    });
  });

  describe('Event Handling - translationCompleted', () => {
    beforeEach(async () => {
      await translationService.initialize();
    });

    it('should emit translationReady event when translation is completed', (done) => {
      const translationData = {
        taskId: 'task-completed-123',
        result: {
          messageId: 'msg-123',
          translatedText: 'Hola mundo',
          sourceLanguage: 'en',
          targetLanguage: 'es',
          confidenceScore: 0.92,
          processingTime: 120,
          modelType: 'medium'
        },
        targetLanguage: 'es'
      };

      // Mock database operations for translation saving
      mockPrisma.messageTranslation.findMany.mockResolvedValue([]);
      mockPrisma.messageTranslation.upsert.mockResolvedValue({ id: 'trans-123' });
      mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-123', senderId: 'user-123' });
      mockPrisma.userStats.upsert.mockResolvedValue({});

      translationService.on('translationReady', (data) => {
        expect(data.taskId).toBe('task-completed-123');
        expect(data.result.translatedText).toBe('Hola mundo');
        done();
      });

      // Trigger the translation completed event on the ZMQ client
      mockZmqClient.emit('translationCompleted', translationData);
    });
  });

  describe('Event Handling - translationError', () => {
    beforeEach(async () => {
      await translationService.initialize();
    });

    it('should increment errors stat on translation error', () => {
      const errorData = {
        taskId: 'error-task',
        messageId: 'msg-error',
        error: 'Translation failed',
        conversationId: 'conv-123'
      };

      const statsBefore = translationService.getStats();
      const errorsBefore = statsBefore.errors;

      mockZmqClient.emit('translationError', errorData);

      const statsAfter = translationService.getStats();
      expect(statsAfter.errors).toBe(errorsBefore + 1);
    });

    it('should increment pool_full_rejections on pool full error', () => {
      const errorData = {
        taskId: 'pool-error-task',
        messageId: 'msg-pool',
        error: 'translation pool full',
        conversationId: 'conv-123'
      };

      const statsBefore = translationService.getStats();
      const poolFullBefore = statsBefore.pool_full_rejections;

      mockZmqClient.emit('translationError', errorData);

      const statsAfter = translationService.getStats();
      expect(statsAfter.pool_full_rejections).toBe(poolFullBefore + 1);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await translationService.initialize();
      mockZmqClient.sendTranslationRequest.mockResolvedValue('task-edge');
    });

    it('should handle empty content message', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-empty',
        conversationId: 'conv-123',
        content: '',
        originalLanguage: 'en'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-empty',
        conversationId: 'conv-123',
        content: '',
        originalLanguage: 'en'
      });

      const result = await translationService.handleNewMessage({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: '',
        originalLanguage: 'en'
      });

      expect(result.messageId).toBe('msg-empty');
    });

    it('should handle special characters in message content', async () => {
      const specialContent = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-special',
        conversationId: 'conv-123',
        content: specialContent,
        originalLanguage: 'en'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-special',
        conversationId: 'conv-123',
        content: specialContent,
        originalLanguage: 'en'
      });

      const result = await translationService.handleNewMessage({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: specialContent,
        originalLanguage: 'en'
      });

      expect(result.messageId).toBe('msg-special');
    });

    it('should handle Unicode and emoji content', async () => {
      const unicodeContent = 'Hello Bonjour Привет مرحبا';

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-unicode',
        conversationId: 'conv-123',
        content: unicodeContent,
        originalLanguage: 'en'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-unicode',
        conversationId: 'conv-123',
        content: unicodeContent,
        originalLanguage: 'en'
      });

      const result = await translationService.handleNewMessage({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: unicodeContent,
        originalLanguage: 'en'
      });

      expect(result.messageId).toBe('msg-unicode');
    });

    it('should handle very long message content', async () => {
      const longContent = 'A'.repeat(10000);

      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-long-content',
        conversationId: 'conv-123',
        content: longContent,
        originalLanguage: 'en'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-long-content',
        conversationId: 'conv-123',
        content: longContent,
        originalLanguage: 'en'
      });

      const result = await translationService.handleNewMessage({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: longContent,
        originalLanguage: 'en'
      });

      expect(result.messageId).toBe('msg-long-content');
    });

    it('should handle messageType field', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-123' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-type',
        messageType: 'voice',
        conversationId: 'conv-123'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-type',
        conversationId: 'conv-123',
        content: 'Voice message content',
        originalLanguage: 'en'
      });

      await translationService.handleNewMessage({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Voice message content',
        originalLanguage: 'en',
        messageType: 'voice'
      });

      const createCall = mockPrisma.message.create.mock.calls[0][0];
      expect(createCall.data.messageType).toBe('voice');
    });
  });

  describe('Conversation Identifier Generation', () => {
    it('should generate identifier with title', async () => {
      await translationService.initialize();

      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({ id: 'new-conv' });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-id-gen',
        conversationId: 'new-conv'
      });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationMember.findMany.mockResolvedValue([]);
      mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-id-gen',
        conversationId: 'new-conv',
        content: 'Test',
        originalLanguage: 'en'
      });
      mockZmqClient.sendTranslationRequest.mockResolvedValue('task-id-gen');

      await translationService.handleNewMessage({
        conversationId: 'new-conv',
        senderId: 'user-1',
        content: 'Test',
        originalLanguage: 'en'
      });

      expect(mockPrisma.conversation.create).toHaveBeenCalled();
      const createCall = mockPrisma.conversation.create.mock.calls[0][0];
      expect(createCall.data.identifier).toMatch(/^mshy_conversation-new-conv-\d{14}$/);
    });
  });
});

describe('TranslationService - Types and Interfaces', () => {
  it('should have correct MessageData interface', () => {
    const messageData: MessageData = {
      conversationId: 'conv-123',
      content: 'Hello',
      originalLanguage: 'en'
    };

    expect(messageData.conversationId).toBeDefined();
    expect(messageData.content).toBeDefined();
    expect(messageData.originalLanguage).toBeDefined();
  });

  it('should have correct optional MessageData fields', () => {
    const fullMessageData: MessageData = {
      id: 'msg-id',
      conversationId: 'conv-123',
      senderId: 'user-123',
      anonymousSenderId: 'anon-123',
      content: 'Hello',
      originalLanguage: 'en',
      messageType: 'text',
      replyToId: 'reply-msg-id',
      targetLanguage: 'fr'
    };

    expect(fullMessageData.id).toBe('msg-id');
    expect(fullMessageData.senderId).toBe('user-123');
    expect(fullMessageData.anonymousSenderId).toBe('anon-123');
    expect(fullMessageData.messageType).toBe('text');
    expect(fullMessageData.replyToId).toBe('reply-msg-id');
    expect(fullMessageData.targetLanguage).toBe('fr');
  });

  it('should have correct TranslationServiceStats interface', () => {
    const stats: TranslationServiceStats = {
      messages_saved: 10,
      translation_requests_sent: 25,
      translations_received: 24,
      errors: 1,
      pool_full_rejections: 0,
      avg_processing_time: 150,
      uptime_seconds: 3600,
      memory_usage_mb: 128
    };

    expect(stats.messages_saved).toBe(10);
    expect(stats.translation_requests_sent).toBe(25);
    expect(stats.translations_received).toBe(24);
    expect(stats.errors).toBe(1);
    expect(stats.pool_full_rejections).toBe(0);
    expect(stats.avg_processing_time).toBe(150);
    expect(stats.uptime_seconds).toBe(3600);
    expect(stats.memory_usage_mb).toBe(128);
  });
});
