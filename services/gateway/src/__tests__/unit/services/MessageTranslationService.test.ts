/**
 * Unit tests for MessageTranslationService
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
import { MessageTranslationService, MessageData, TranslationServiceStats } from '../../../services/MessageTranslationService';
import { TranslationResult } from '../../../services/zmq-translation';
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

describe('MessageTranslationService', () => {
  let translationService: MessageTranslationService;
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
    translationService = new MessageTranslationService(mockPrisma as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should create a new MessageTranslationService instance', () => {
      expect(translationService).toBeDefined();
      expect(translationService).toBeInstanceOf(MessageTranslationService);
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

      const newService = new MessageTranslationService(mockPrisma as any);

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

describe('MessageTranslationService - Types and Interfaces', () => {
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

describe('MessageTranslationService - E2EE Message Handling', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  it('should skip translation for E2EE messages with existing ID', async () => {
    const messageData: MessageData = {
      id: 'e2ee-msg-123',
      conversationId: 'conv-123',
      senderId: 'user-456',
      content: '[Encrypted]',
      originalLanguage: 'en',
      encryptionMode: 'e2ee',
      isEncrypted: true
    };

    const result = await translationService.handleNewMessage(messageData);

    expect(result.status).toBe('e2ee_skipped');
    expect(result.messageId).toBe('e2ee-msg-123');
    // Should NOT send translation request for E2EE messages
    expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
  });

  it('should save new E2EE message but skip translation', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-e2ee',
      senderId: 'user-456',
      content: '[Encrypted Content]',
      originalLanguage: 'en',
      encryptionMode: 'e2ee',
      isEncrypted: true
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-e2ee' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'new-e2ee-msg',
      conversationId: 'conv-e2ee',
      content: '[Encrypted Content]',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    const result = await translationService.handleNewMessage(messageData);

    expect(result.status).toBe('e2ee_skipped');
    expect(result.messageId).toBe('new-e2ee-msg');
    expect(mockPrisma.message.create).toHaveBeenCalled();
    // Should NOT send translation request for E2EE messages
    expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
  });

  it('should process non-E2EE messages normally', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-normal',
      senderId: 'user-456',
      content: 'Hello world',
      originalLanguage: 'en',
      encryptionMode: 'server',
      isEncrypted: false
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-normal' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-normal',
      conversationId: 'conv-normal',
      content: 'Hello world',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversationMember.findMany.mockResolvedValue([
      { user: { systemLanguage: 'fr', userFeature: { autoTranslateEnabled: true } } }
    ]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-normal',
      conversationId: 'conv-normal',
      content: 'Hello world',
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-normal');

    const result = await translationService.handleNewMessage(messageData);

    expect(result.status).toBe('message_saved');
    expect(result.messageId).toBe('msg-normal');
    expect(mockPrisma.message.create).toHaveBeenCalled();
  });

  it('should handle hybrid encryption mode (allows translation)', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-hybrid',
      senderId: 'user-456',
      content: 'Hybrid message',
      originalLanguage: 'en',
      encryptionMode: 'hybrid',
      isEncrypted: true
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-hybrid' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-hybrid',
      conversationId: 'conv-hybrid',
      content: 'Hybrid message',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversationMember.findMany.mockResolvedValue([]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-hybrid',
      conversationId: 'conv-hybrid',
      content: 'Hybrid message',
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-hybrid');

    const result = await translationService.handleNewMessage(messageData);

    // Hybrid mode should NOT skip translation
    expect(result.status).toBe('message_saved');
    expect(result.messageId).toBe('msg-hybrid');
  });
});

describe('MessageTranslationService - Language Extraction and Filtering', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  it('should extract languages from authenticated conversation members', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-langs',
      senderId: 'user-456',
      content: 'Hello',
      originalLanguage: 'en'
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-langs' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-langs',
      conversationId: 'conv-langs',
      content: 'Hello',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    // Multiple users with different languages
    mockPrisma.conversationMember.findMany.mockResolvedValue([
      {
        user: {
          systemLanguage: 'fr',
          regionalLanguage: 'de',
          customDestinationLanguage: null,
          userFeature: {
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: true,
            useCustomDestination: false
          }
        }
      },
      {
        user: {
          systemLanguage: 'es',
          regionalLanguage: null,
          customDestinationLanguage: 'pt',
          userFeature: {
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: true
          }
        }
      }
    ]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-langs',
      conversationId: 'conv-langs',
      content: 'Hello',
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-langs');

    await translationService.handleNewMessage(messageData);

    // Should have called sendTranslationRequest with extracted languages
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
  });

  it('should include anonymous participant languages', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-anon-langs',
      senderId: 'user-456',
      content: 'Hello',
      originalLanguage: 'en'
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-anon-langs' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-anon-langs',
      conversationId: 'conv-anon-langs',
      content: 'Hello',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversationMember.findMany.mockResolvedValue([
      { user: { systemLanguage: 'fr', userFeature: null } }
    ]);
    // Anonymous participants with their own languages
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([
      { language: 'ar' },
      { language: 'zh' }
    ]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-anon-langs',
      conversationId: 'conv-anon-langs',
      content: 'Hello',
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-anon-langs');

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
  });

  it('should filter out source language from target languages', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-filter',
      senderId: 'user-456',
      content: 'Bonjour',
      originalLanguage: 'fr'  // Source is French
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-filter' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-filter',
      conversationId: 'conv-filter',
      content: 'Bonjour',
      originalLanguage: 'fr'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    // User also speaks French - should be filtered out
    mockPrisma.conversationMember.findMany.mockResolvedValue([
      { user: { systemLanguage: 'fr', userFeature: { autoTranslateEnabled: true } } },
      { user: { systemLanguage: 'en', userFeature: { autoTranslateEnabled: true } } }
    ]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-filter',
      conversationId: 'conv-filter',
      content: 'Bonjour',
      originalLanguage: 'fr'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-filter');

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    // Should still call translation for 'en', but not 'fr'
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    const callArgs = mockZmqClient.sendTranslationRequest.mock.calls[0][0];
    // Should not include 'fr' in target languages since source is 'fr'
    expect(callArgs.targetLanguages).not.toContain('fr');
  });

  it('should not send translation request when all targets match source', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-same-lang',
      senderId: 'user-456',
      content: 'Bonjour',
      originalLanguage: 'fr'
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-same-lang' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-same-lang',
      conversationId: 'conv-same-lang',
      content: 'Bonjour',
      originalLanguage: 'fr'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    // All users speak French only
    mockPrisma.conversationMember.findMany.mockResolvedValue([
      { user: { systemLanguage: 'fr', userFeature: { autoTranslateEnabled: true } } },
      { user: { systemLanguage: 'fr', userFeature: { autoTranslateEnabled: true } } }
    ]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-same-lang',
      conversationId: 'conv-same-lang',
      content: 'Bonjour',
      originalLanguage: 'fr'
    });

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    // Should NOT call sendTranslationRequest since all targets filtered out
    expect(mockZmqClient.sendTranslationRequest).not.toHaveBeenCalled();
  });

  it('should use specific targetLanguage when provided', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-specific',
      senderId: 'user-456',
      content: 'Hello',
      originalLanguage: 'en',
      targetLanguage: 'ja'  // Specific target language
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-specific' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-specific',
      conversationId: 'conv-specific',
      content: 'Hello',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    // Should use 'ja' from messageData, not from members
    mockPrisma.conversationMember.findMany.mockResolvedValue([
      { user: { systemLanguage: 'fr', userFeature: { autoTranslateEnabled: true } } }
    ]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-specific',
      conversationId: 'conv-specific',
      content: 'Hello',
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-specific');

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    const callArgs = mockZmqClient.sendTranslationRequest.mock.calls[0][0];
    expect(callArgs.targetLanguages).toContain('ja');
  });

  it('should fallback to default languages when no members found', async () => {
    const messageData: MessageData = {
      conversationId: 'conv-no-members',
      senderId: 'user-456',
      content: 'Hello',
      originalLanguage: 'zh'
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-no-members' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-no-members',
      conversationId: 'conv-no-members',
      content: 'Hello',
      originalLanguage: 'zh'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    // No members found
    mockPrisma.conversationMember.findMany.mockResolvedValue([]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-no-members',
      conversationId: 'conv-no-members',
      content: 'Hello',
      originalLanguage: 'zh'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-no-members');

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    // Should still work, may not send request if no target languages
    // Implementation falls back to ['en', 'fr'] when extraction fails
    expect(mockPrisma.conversationMember.findMany).toHaveBeenCalled();
    expect(mockPrisma.anonymousParticipant.findMany).toHaveBeenCalled();
  });
});

describe('MessageTranslationService - Audio Translation Handling', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  // Extend mock Prisma for audio-related tables
  const extendMockPrisma = (basePrisma: ReturnType<typeof createMockPrisma>) => ({
    ...basePrisma,
    messageAttachment: {
      findUnique: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn
    },
    messageAudioTranscription: {
      upsert: jest.fn() as MockFn,
      findFirst: jest.fn() as MockFn
    },
    messageTranslatedAudio: {
      upsert: jest.fn() as MockFn,
      findMany: jest.fn() as MockFn
    },
    userVoiceModel: {
      upsert: jest.fn() as MockFn,
      findUnique: jest.fn() as MockFn
    }
  });

  let extendedMockPrisma: ReturnType<typeof extendMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset();
    mockPrisma = createMockPrisma();
    extendedMockPrisma = extendMockPrisma(mockPrisma);
    translationService = new MessageTranslationService(extendedMockPrisma as any);
    await translationService.initialize();
  });

  it('should emit audioTranslationReady event when audio processing completes', (done) => {
    const audioData = {
      taskId: 'audio-task-123',
      messageId: 'msg-audio-123',
      attachmentId: 'attach-123',
      transcription: {
        text: 'Hello, this is a voice message',
        language: 'en',
        confidence: 0.95,
        source: 'whisper'
      },
      translatedAudios: [
        {
          targetLanguage: 'fr',
          translatedText: 'Bonjour, ceci est un message vocal',
          audioUrl: 'https://storage.example.com/audio/fr-123.mp3',
          audioPath: '/audio/fr-123.mp3',
          durationMs: 3500,
          voiceCloned: true,
          voiceQuality: 0.92
        }
      ],
      voiceModelUserId: 'user-456',
      voiceModelQuality: 0.9,
      processingTimeMs: 2500
    };

    // Mock database operations
    extendedMockPrisma.messageAttachment.findUnique.mockResolvedValue({
      id: 'attach-123',
      messageId: 'msg-audio-123',
      duration: 3500
    });
    extendedMockPrisma.messageAudioTranscription.upsert.mockResolvedValue({ id: 'trans-123' });
    extendedMockPrisma.messageTranslatedAudio.upsert.mockResolvedValue({ id: 'audio-trans-123' });

    translationService.on('audioTranslationReady', (data) => {
      expect(data.taskId).toBe('audio-task-123');
      expect(data.messageId).toBe('msg-audio-123');
      expect(data.attachmentId).toBe('attach-123');
      expect(data.transcription.text).toBe('Hello, this is a voice message');
      expect(data.translatedAudios).toHaveLength(1);
      expect(data.translatedAudios[0].targetLanguage).toBe('fr');
      done();
    });

    // Trigger audio process completed event
    mockZmqClient.emit('audioProcessCompleted', audioData);
  });

  it('should emit audioTranslationError event on audio processing error', (done) => {
    const errorData = {
      taskId: 'audio-error-task',
      messageId: 'msg-audio-error',
      attachmentId: 'attach-error',
      error: 'Audio transcription failed: unsupported format',
      errorCode: 'TRANSCRIPTION_FAILED'
    };

    translationService.on('audioTranslationError', (data) => {
      expect(data.taskId).toBe('audio-error-task');
      expect(data.messageId).toBe('msg-audio-error');
      expect(data.attachmentId).toBe('attach-error');
      expect(data.error).toContain('unsupported format');
      expect(data.errorCode).toBe('TRANSCRIPTION_FAILED');
      done();
    });

    // Trigger audio process error event
    mockZmqClient.emit('audioProcessError', errorData);
  });

  it('should increment errors stat on audio processing error', () => {
    const errorData = {
      taskId: 'audio-error-task-2',
      messageId: 'msg-audio-error-2',
      attachmentId: 'attach-error-2',
      error: 'Voice cloning failed',
      errorCode: 'VOICE_CLONE_FAILED'
    };

    const statsBefore = translationService.getStats();
    const errorsBefore = statsBefore.errors;

    mockZmqClient.emit('audioProcessError', errorData);

    const statsAfter = translationService.getStats();
    expect(statsAfter.errors).toBe(errorsBefore + 1);
  });

  it('should save new voice profile when provided in audio completion', (done) => {
    const audioDataWithProfile = {
      taskId: 'audio-profile-task',
      messageId: 'msg-profile',
      attachmentId: 'attach-profile',
      transcription: {
        text: 'Voice profile test',
        language: 'en',
        confidence: 0.98,
        source: 'whisper'
      },
      translatedAudios: [],
      voiceModelUserId: 'user-voice-123',
      voiceModelQuality: 0.95,
      processingTimeMs: 3000,
      newVoiceProfile: {
        userId: 'user-voice-123',
        profileId: 'profile-new-123',
        embedding: Buffer.from('mock-embedding-data').toString('base64'),
        qualityScore: 0.95,
        audioCount: 5,
        totalDurationMs: 15000,
        version: 1,
        fingerprint: { f0_mean: 120.5 },
        voiceCharacteristics: { pitch: 'medium' }
      }
    };

    extendedMockPrisma.messageAttachment.findUnique.mockResolvedValue({
      id: 'attach-profile',
      messageId: 'msg-profile',
      duration: 3000
    });
    extendedMockPrisma.messageAudioTranscription.upsert.mockResolvedValue({ id: 'trans-profile' });
    extendedMockPrisma.userVoiceModel.upsert.mockResolvedValue({ userId: 'user-voice-123' });

    translationService.on('audioTranslationReady', () => {
      // Verify voice model was saved
      expect(extendedMockPrisma.userVoiceModel.upsert).toHaveBeenCalled();
      const upsertCall = extendedMockPrisma.userVoiceModel.upsert.mock.calls[0][0];
      expect(upsertCall.where.userId).toBe('user-voice-123');
      expect(upsertCall.create.profileId).toBe('profile-new-123');
      done();
    });

    mockZmqClient.emit('audioProcessCompleted', audioDataWithProfile);
  });
});

describe('MessageTranslationService - Model Type Selection', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  it('should use provided modelType from message data', async () => {
    const messageData: MessageData & { modelType?: string } = {
      conversationId: 'conv-model',
      senderId: 'user-456',
      content: 'Short text',
      originalLanguage: 'en',
      targetLanguage: 'fr',
      modelType: 'premium'  // Explicitly set
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-model' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-model',
      conversationId: 'conv-model',
      content: 'Short text',
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversationMember.findMany.mockResolvedValue([]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-model',
      conversationId: 'conv-model',
      content: 'Short text',
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-model');

    await translationService.handleNewMessage(messageData as any);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    const callArgs = mockZmqClient.sendTranslationRequest.mock.calls[0][0];
    expect(callArgs.modelType).toBe('premium');
  });

  it('should auto-select medium model for short messages', async () => {
    const shortContent = 'Hi';  // Less than 80 chars

    const messageData: MessageData = {
      conversationId: 'conv-short',
      senderId: 'user-456',
      content: shortContent,
      originalLanguage: 'en',
      targetLanguage: 'fr'
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-short' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-short',
      conversationId: 'conv-short',
      content: shortContent,
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversationMember.findMany.mockResolvedValue([]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-short',
      conversationId: 'conv-short',
      content: shortContent,
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-short');

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    const callArgs = mockZmqClient.sendTranslationRequest.mock.calls[0][0];
    expect(callArgs.modelType).toBe('medium');
  });

  it('should auto-select premium model for long messages', async () => {
    const longContent = 'A'.repeat(100);  // More than 80 chars

    const messageData: MessageData = {
      conversationId: 'conv-long',
      senderId: 'user-456',
      content: longContent,
      originalLanguage: 'en',
      targetLanguage: 'fr'
    };

    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-long' });
    mockPrisma.message.create.mockResolvedValue({
      id: 'msg-long',
      conversationId: 'conv-long',
      content: longContent,
      originalLanguage: 'en'
    });
    mockPrisma.conversation.update.mockResolvedValue({});
    mockPrisma.conversationMember.findMany.mockResolvedValue([]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'msg-long',
      conversationId: 'conv-long',
      content: longContent,
      originalLanguage: 'en'
    });
    mockZmqClient.sendTranslationRequest.mockResolvedValue('task-long');

    await translationService.handleNewMessage(messageData);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    const callArgs = mockZmqClient.sendTranslationRequest.mock.calls[0][0];
    expect(callArgs.modelType).toBe('premium');
  });
});

describe('MessageTranslationService - Translation Deduplication', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  it('should not process duplicate translation completed events', (done) => {
    const translationData = {
      taskId: 'dup-task-123',
      result: {
        messageId: 'msg-dup-123',
        translatedText: 'Bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.95,
        processingTime: 100,
        modelType: 'basic'
      },
      targetLanguage: 'fr'
    };

    mockPrisma.messageTranslation.findMany.mockResolvedValue([]);
    mockPrisma.messageTranslation.upsert.mockResolvedValue({ id: 'trans-dup' });
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-dup-123', senderId: 'user-123' });
    mockPrisma.userStats.upsert.mockResolvedValue({});

    let emitCount = 0;
    translationService.on('translationReady', () => {
      emitCount++;
    });

    // Emit the same event twice
    mockZmqClient.emit('translationCompleted', translationData);
    mockZmqClient.emit('translationCompleted', translationData);

    // Wait a bit and check
    setTimeout(() => {
      // Should only emit once due to deduplication
      expect(emitCount).toBe(1);
      done();
    }, 100);
  });

  it('should allow same message to be translated to different languages', (done) => {
    const translationDataFr = {
      taskId: 'multi-task-fr',
      result: {
        messageId: 'msg-multi',
        translatedText: 'Bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.95,
        processingTime: 100,
        modelType: 'basic'
      },
      targetLanguage: 'fr'
    };

    const translationDataEs = {
      taskId: 'multi-task-es',
      result: {
        messageId: 'msg-multi',
        translatedText: 'Hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        confidenceScore: 0.94,
        processingTime: 110,
        modelType: 'basic'
      },
      targetLanguage: 'es'
    };

    mockPrisma.messageTranslation.findMany.mockResolvedValue([]);
    mockPrisma.messageTranslation.upsert.mockResolvedValue({ id: 'trans-multi' });
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-multi', senderId: 'user-123' });
    mockPrisma.userStats.upsert.mockResolvedValue({});

    let emitCount = 0;
    const receivedLanguages: string[] = [];

    translationService.on('translationReady', (data) => {
      emitCount++;
      receivedLanguages.push(data.targetLanguage);
    });

    // Emit both translations
    mockZmqClient.emit('translationCompleted', translationDataFr);
    mockZmqClient.emit('translationCompleted', translationDataEs);

    // Wait and check
    setTimeout(() => {
      // Both should be processed (different task IDs)
      expect(emitCount).toBe(2);
      expect(receivedLanguages).toContain('fr');
      expect(receivedLanguages).toContain('es');
      done();
    }, 100);
  });
});

describe('MessageTranslationService - Retranslation with Old Translation Cleanup', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockZmqClient.sendTranslationRequest.mockReset();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
    mockZmqClient.sendTranslationRequest.mockResolvedValue('retrans-task');
  });

  it('should delete old translations before retranslation', async () => {
    const messageData: MessageData = {
      id: 'existing-retrans-msg',
      conversationId: 'conv-retrans',
      content: 'Content to retranslate',
      originalLanguage: 'en',
      targetLanguage: 'fr'
    };

    mockPrisma.message.findFirst.mockResolvedValue({
      id: 'existing-retrans-msg',
      conversationId: 'conv-retrans',
      content: 'Content to retranslate',
      originalLanguage: 'en'
    });
    mockPrisma.messageTranslation.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.conversationMember.findMany.mockResolvedValue([]);
    mockPrisma.anonymousParticipant.findMany.mockResolvedValue([]);

    const result = await translationService.handleNewMessage(messageData);

    expect(result.status).toBe('retranslation_queued');

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have called deleteMany to remove old translations
    expect(mockPrisma.messageTranslation.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: 'existing-retrans-msg',
        targetLanguage: {
          in: ['fr']
        }
      }
    });
  });
});

describe('MessageTranslationService - Cache Management', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  it('should return cached translation on second request', async () => {
    // First request - from database
    mockPrisma.messageTranslation.findFirst.mockResolvedValue({
      id: 'trans-cache-1',
      messageId: 'msg-cache',
      targetLanguage: 'fr',
      translatedContent: 'Bonjour du cache',
      translationModel: 'basic',
      confidenceScore: 0.95,
      message: {
        originalLanguage: 'en'
      }
    });

    const result1 = await translationService.getTranslation('msg-cache', 'fr');
    expect(result1?.translatedText).toBe('Bonjour du cache');
    expect(mockPrisma.messageTranslation.findFirst).toHaveBeenCalledTimes(1);

    // Second request - should be from cache
    const result2 = await translationService.getTranslation('msg-cache', 'fr');
    expect(result2?.translatedText).toBe('Bonjour du cache');
    // Should still only have 1 database call (second was cached)
    expect(mockPrisma.messageTranslation.findFirst).toHaveBeenCalledTimes(1);
  });

  it('should update cache when translation completed', (done) => {
    const translationData = {
      taskId: 'cache-update-task',
      result: {
        messageId: 'msg-cache-update',
        translatedText: 'Nouvelle traduction',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.98,
        processingTime: 50,
        modelType: 'premium'
      },
      targetLanguage: 'fr'
    };

    mockPrisma.messageTranslation.findMany.mockResolvedValue([]);
    mockPrisma.messageTranslation.upsert.mockResolvedValue({ id: 'trans-cache-update' });
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-cache-update', senderId: 'user-123' });
    mockPrisma.userStats.upsert.mockResolvedValue({});

    translationService.on('translationReady', async () => {
      // Now try to get the translation - should be in cache
      mockPrisma.messageTranslation.findFirst.mockResolvedValue(null);  // DB would return null

      const result = await translationService.getTranslation('msg-cache-update', 'fr', 'en');
      expect(result?.translatedText).toBe('Nouvelle traduction');
      done();
    });

    mockZmqClient.emit('translationCompleted', translationData);
  });
});
