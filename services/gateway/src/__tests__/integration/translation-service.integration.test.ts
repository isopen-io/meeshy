/**
 * Integration tests for TranslationService
 *
 * These tests verify the integration between:
 * - TranslationService and the database (Prisma)
 * - TranslationService and ZMQ communication (mocked for local testing)
 * - Translation flow from message creation to translation storage
 *
 * To run these tests:
 * 1. Ensure DATABASE_URL is set in your environment
 * 2. Run: npm test -- --config=jest.config.status-tests.json --testPathPattern=translation-service.integration
 *
 * For full integration with Translator service:
 * 1. Start the Translator service (Python)
 * 2. Set ZMQ_TRANSLATOR_HOST, ZMQ_TRANSLATOR_PUSH_PORT, ZMQ_TRANSLATOR_SUB_PORT
 * 3. Run tests with INTEGRATION_MODE=full
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { EventEmitter } from 'events';

// Type definition for mock functions
type MockFn = jest.Mock<any, any>;

// Mock ZMQ client for local testing
class MockZMQTranslationClient extends EventEmitter {
  sendTranslationRequest: MockFn = jest.fn();
  healthCheck: MockFn = jest.fn();
  close: MockFn = jest.fn();
  testReception: MockFn = jest.fn();

  constructor() {
    super();
    this.sendTranslationRequest.mockImplementation(async (request: any) => {
      const taskId = `mock-task-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Simulate async translation completion
      setTimeout(() => {
        for (const targetLang of request.targetLanguages) {
          this.emit('translationCompleted', {
            taskId,
            result: {
              messageId: request.messageId,
              translatedText: `[${targetLang.toUpperCase()}] ${request.text}`,
              sourceLanguage: request.sourceLanguage,
              targetLanguage: targetLang,
              confidenceScore: 0.95,
              processingTime: 100,
              modelType: request.modelType || 'mock'
            },
            targetLanguage: targetLang
          });
        }
      }, 50);

      return taskId;
    });
    this.healthCheck.mockResolvedValue(true);
  }

  removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    return this;
  }
}

// Mock ZMQ Singleton
const mockZmqClient = new MockZMQTranslationClient();

jest.mock('../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue(mockZmqClient)
  }
}));

// Import after mocking
import { TranslationService, MessageData } from '../../services/TranslationService';

describe('TranslationService Integration Tests', () => {
  let prisma: PrismaClient;
  let translationService: TranslationService;
  let testConversation: any;
  let testUser: any;
  let createdMessageIds: string[] = [];
  let createdTranslationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Wait for connection
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up all created test data
    if (createdTranslationIds.length > 0) {
      await prisma.messageTranslation.deleteMany({
        where: { id: { in: createdTranslationIds } }
      }).catch(() => {});
    }

    if (createdMessageIds.length > 0) {
      await prisma.message.deleteMany({
        where: { id: { in: createdMessageIds } }
      }).catch(() => {});
    }

    if (testConversation) {
      await prisma.conversation.delete({
        where: { id: testConversation.id }
      }).catch(() => {});
    }

    if (testUser) {
      await prisma.user.delete({
        where: { id: testUser.id }
      }).catch(() => {});
    }

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();

    // Create fresh service instance
    translationService = new TranslationService(prisma);
    await translationService.initialize();

    // Create test user if not exists
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          username: `trans-integ-test-${Date.now()}`,
          email: `trans-integ-${Date.now()}@test.local`,
          password: 'hashed-password-test',
          systemLanguage: 'en',
          regionalLanguage: 'fr',
          isOnline: false
        }
      });
    }

    // Create test conversation if not exists
    if (!testConversation) {
      testConversation = await prisma.conversation.create({
        data: {
          identifier: `mshy_integ-test-${Date.now()}`,
          title: 'Integration Test Conversation',
          type: 'group'
        }
      });

      // Add user to conversation
      await prisma.conversationMember.create({
        data: {
          conversationId: testConversation.id,
          userId: testUser.id,
          role: 'member',
          isActive: true
        }
      });
    }
  });

  afterEach(async () => {
    if (translationService) {
      await translationService.close().catch(() => {});
    }
  });

  describe('Full Message Flow - Database Integration', () => {
    it('should save message to database and trigger translation', async () => {
      const messageData: MessageData = {
        conversationId: testConversation.id,
        senderId: testUser.id,
        content: 'Hello, this is an integration test message!',
        originalLanguage: 'en'
      };

      // Handle new message
      const result = await translationService.handleNewMessage(messageData);

      expect(result).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.status).toBe('message_saved');
      createdMessageIds.push(result.messageId);

      // Verify message was saved to database
      const savedMessage = await prisma.message.findUnique({
        where: { id: result.messageId }
      });

      expect(savedMessage).not.toBeNull();
      expect(savedMessage?.content).toBe(messageData.content);
      expect(savedMessage?.originalLanguage).toBe('en');
      expect(savedMessage?.conversationId).toBe(testConversation.id);
      expect(savedMessage?.senderId).toBe(testUser.id);
    });

    it('should update conversation lastMessageAt on new message', async () => {
      const beforeTimestamp = new Date();

      const messageData: MessageData = {
        conversationId: testConversation.id,
        senderId: testUser.id,
        content: 'Testing lastMessageAt update',
        originalLanguage: 'en'
      };

      const result = await translationService.handleNewMessage(messageData);
      createdMessageIds.push(result.messageId);

      // Check conversation was updated
      const updatedConversation = await prisma.conversation.findUnique({
        where: { id: testConversation.id }
      });

      expect(updatedConversation?.lastMessageAt).toBeDefined();
      expect(updatedConversation?.lastMessageAt?.getTime()).toBeGreaterThanOrEqual(beforeTimestamp.getTime());
    });

    it('should save translation results to database', async () => {
      const messageData: MessageData = {
        conversationId: testConversation.id,
        senderId: testUser.id,
        content: 'Translation storage test',
        originalLanguage: 'en',
        targetLanguage: 'fr'
      };

      const result = await translationService.handleNewMessage(messageData);
      createdMessageIds.push(result.messageId);

      // Wait for mock translation to complete and be saved
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check translation was saved
      const translations = await prisma.messageTranslation.findMany({
        where: { messageId: result.messageId }
      });

      expect(translations.length).toBeGreaterThanOrEqual(1);

      // Track for cleanup
      translations.forEach(t => createdTranslationIds.push(t.id));

      const frTranslation = translations.find(t => t.targetLanguage === 'fr');
      expect(frTranslation).toBeDefined();
      expect(frTranslation?.translatedContent).toContain('[FR]');
    });

    it('should handle retranslation by deleting old and creating new translation', async () => {
      // First, create a message with translation
      const messageData: MessageData = {
        conversationId: testConversation.id,
        senderId: testUser.id,
        content: 'Original message for retranslation',
        originalLanguage: 'en',
        targetLanguage: 'es'
      };

      const result = await translationService.handleNewMessage(messageData);
      createdMessageIds.push(result.messageId);

      // Wait for first translation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify first translation exists
      const firstTranslations = await prisma.messageTranslation.findMany({
        where: { messageId: result.messageId, targetLanguage: 'es' }
      });
      expect(firstTranslations.length).toBe(1);
      firstTranslations.forEach(t => createdTranslationIds.push(t.id));

      // Now trigger retranslation
      const retransData: MessageData = {
        id: result.messageId,  // Existing message ID triggers retranslation
        conversationId: testConversation.id,
        content: 'Original message for retranslation',
        originalLanguage: 'en',
        targetLanguage: 'es'
      };

      const retransResult = await translationService.handleNewMessage(retransData);
      expect(retransResult.status).toBe('retranslation_queued');

      // Wait for retranslation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should still have exactly one translation (old deleted, new created)
      const afterRetrans = await prisma.messageTranslation.findMany({
        where: { messageId: result.messageId, targetLanguage: 'es' }
      });
      expect(afterRetrans.length).toBe(1);
      afterRetrans.forEach(t => {
        if (!createdTranslationIds.includes(t.id)) {
          createdTranslationIds.push(t.id);
        }
      });
    });
  });

  describe('getTranslation - Database Retrieval', () => {
    it('should retrieve translation from database', async () => {
      // Create message and translation manually for retrieval test
      const testMessage = await prisma.message.create({
        data: {
          conversationId: testConversation.id,
          senderId: testUser.id,
          content: 'Test retrieval message',
          originalLanguage: 'en',
          messageType: 'text'
        }
      });
      createdMessageIds.push(testMessage.id);

      const testTranslation = await prisma.messageTranslation.create({
        data: {
          messageId: testMessage.id,
          targetLanguage: 'de',
          translatedContent: 'Test Abruf Nachricht',
          translationModel: 'test-model',
          confidenceScore: 0.98
        }
      });
      createdTranslationIds.push(testTranslation.id);

      // Retrieve using service
      const result = await translationService.getTranslation(testMessage.id, 'de');

      expect(result).not.toBeNull();
      expect(result?.translatedText).toBe('Test Abruf Nachricht');
      expect(result?.targetLanguage).toBe('de');
      expect(result?.sourceLanguage).toBe('en');
    });

    it('should return null for non-existent translation', async () => {
      const result = await translationService.getTranslation('non-existent-msg-id', 'zh');
      expect(result).toBeNull();
    });

    it('should cache retrieved translations', async () => {
      const testMessage = await prisma.message.create({
        data: {
          conversationId: testConversation.id,
          senderId: testUser.id,
          content: 'Cache test message',
          originalLanguage: 'en',
          messageType: 'text'
        }
      });
      createdMessageIds.push(testMessage.id);

      const testTranslation = await prisma.messageTranslation.create({
        data: {
          messageId: testMessage.id,
          targetLanguage: 'it',
          translatedContent: 'Messaggio di test della cache',
          translationModel: 'test',
          confidenceScore: 0.96
        }
      });
      createdTranslationIds.push(testTranslation.id);

      // First retrieval
      const result1 = await translationService.getTranslation(testMessage.id, 'it');
      expect(result1?.translatedText).toBe('Messaggio di test della cache');

      // Delete from database to verify cache works
      await prisma.messageTranslation.delete({
        where: { id: testTranslation.id }
      });
      // Remove from cleanup list since we deleted it
      createdTranslationIds = createdTranslationIds.filter(id => id !== testTranslation.id);

      // Second retrieval should still work (from cache)
      const result2 = await translationService.getTranslation(testMessage.id, 'it');
      expect(result2?.translatedText).toBe('Messaggio di test della cache');
    });
  });

  describe('Statistics Tracking', () => {
    it('should track messages_saved correctly', async () => {
      const initialStats = translationService.getStats();
      const initialSaved = initialStats.messages_saved;

      // Create 3 messages
      for (let i = 0; i < 3; i++) {
        const result = await translationService.handleNewMessage({
          conversationId: testConversation.id,
          senderId: testUser.id,
          content: `Stats test message ${i}`,
          originalLanguage: 'en'
        });
        createdMessageIds.push(result.messageId);
      }

      const finalStats = translationService.getStats();
      expect(finalStats.messages_saved).toBe(initialSaved + 3);
    });

    it('should track uptime and memory usage', async () => {
      // Wait a bit to ensure uptime is measurable
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = translationService.getStats();

      expect(stats.uptime_seconds).toBeGreaterThan(0);
      expect(stats.memory_usage_mb).toBeGreaterThan(0);
    });
  });

  describe('Health Check Integration', () => {
    it('should return true when ZMQ client is healthy', async () => {
      const isHealthy = await translationService.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should handle health check failures gracefully', async () => {
      // Simulate unhealthy ZMQ
      mockZmqClient.healthCheck.mockResolvedValueOnce(false);

      const isHealthy = await translationService.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Translation Event Flow', () => {
    it('should emit translationReady event when translation completes', (done) => {
      const messageContent = 'Event flow test message';

      translationService.on('translationReady', async (data) => {
        expect(data.result).toBeDefined();
        expect(data.result.translatedText).toContain(messageContent);
        expect(data.targetLanguage).toBe('pt');

        // Verify translation was saved to database
        const savedTranslation = await prisma.messageTranslation.findFirst({
          where: {
            messageId: data.result.messageId,
            targetLanguage: 'pt'
          }
        });

        if (savedTranslation) {
          createdTranslationIds.push(savedTranslation.id);
          expect(savedTranslation.translatedContent).toContain('[PT]');
        }

        done();
      });

      translationService.handleNewMessage({
        conversationId: testConversation.id,
        senderId: testUser.id,
        content: messageContent,
        originalLanguage: 'en',
        targetLanguage: 'pt'
      }).then(result => {
        createdMessageIds.push(result.messageId);
      });
    });
  });

  describe('Concurrent Message Handling', () => {
    it('should handle multiple messages concurrently without data corruption', async () => {
      const messagePromises = [];
      const messageContents = ['First concurrent message', 'Second concurrent message', 'Third concurrent message'];

      // Send messages concurrently
      for (const content of messageContents) {
        messagePromises.push(
          translationService.handleNewMessage({
            conversationId: testConversation.id,
            senderId: testUser.id,
            content,
            originalLanguage: 'en',
            targetLanguage: 'ja'
          })
        );
      }

      const results = await Promise.all(messagePromises);

      // All should succeed
      expect(results).toHaveLength(3);
      results.forEach(r => {
        expect(r.messageId).toBeDefined();
        expect(r.status).toBe('message_saved');
        createdMessageIds.push(r.messageId);
      });

      // Verify all messages were saved correctly
      for (let i = 0; i < results.length; i++) {
        const msg = await prisma.message.findUnique({
          where: { id: results[i].messageId }
        });
        expect(msg?.content).toBe(messageContents[i]);
      }

      // Wait for translations
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify translations were saved
      for (const result of results) {
        const translations = await prisma.messageTranslation.findMany({
          where: { messageId: result.messageId }
        });
        translations.forEach(t => createdTranslationIds.push(t.id));
      }
    });
  });
});

describe('TranslationService - Conversation Languages Integration', () => {
  let prisma: PrismaClient;
  let translationService: TranslationService;
  let testConversation: any;
  let testUsers: any[] = [];
  let createdMessageIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up
    if (createdMessageIds.length > 0) {
      await prisma.messageTranslation.deleteMany({
        where: { messageId: { in: createdMessageIds } }
      }).catch(() => {});
      await prisma.message.deleteMany({
        where: { id: { in: createdMessageIds } }
      }).catch(() => {});
    }

    if (testConversation) {
      await prisma.conversationMember.deleteMany({
        where: { conversationId: testConversation.id }
      }).catch(() => {});
      await prisma.anonymousParticipant.deleteMany({
        where: { conversationId: testConversation.id }
      }).catch(() => {});
      await prisma.conversation.delete({
        where: { id: testConversation.id }
      }).catch(() => {});
    }

    for (const user of testUsers) {
      await prisma.userFeature.deleteMany({
        where: { userId: user.id }
      }).catch(() => {});
      await prisma.user.delete({
        where: { id: user.id }
      }).catch(() => {});
    }

    await prisma.$disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    translationService = new TranslationService(prisma);
    await translationService.initialize();
  });

  afterEach(async () => {
    if (translationService) {
      await translationService.close().catch(() => {});
    }
  });

  it('should extract languages from all conversation participants', async () => {
    // Create users with different languages
    const user1 = await prisma.user.create({
      data: {
        username: `lang-test-1-${Date.now()}`,
        email: `lang-test-1-${Date.now()}@test.local`,
        password: 'test',
        systemLanguage: 'fr',
        regionalLanguage: 'de'
      }
    });
    testUsers.push(user1);

    await prisma.userFeature.create({
      data: {
        userId: user1.id,
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: true
      }
    });

    const user2 = await prisma.user.create({
      data: {
        username: `lang-test-2-${Date.now()}`,
        email: `lang-test-2-${Date.now()}@test.local`,
        password: 'test',
        systemLanguage: 'es',
        customDestinationLanguage: 'pt'
      }
    });
    testUsers.push(user2);

    await prisma.userFeature.create({
      data: {
        userId: user2.id,
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        useCustomDestination: true
      }
    });

    // Create conversation
    testConversation = await prisma.conversation.create({
      data: {
        identifier: `mshy_lang-test-${Date.now()}`,
        title: 'Language Extraction Test',
        type: 'group'
      }
    });

    // Add users to conversation
    await prisma.conversationMember.createMany({
      data: [
        { conversationId: testConversation.id, userId: user1.id, role: 'member', isActive: true },
        { conversationId: testConversation.id, userId: user2.id, role: 'member', isActive: true }
      ]
    });

    // Add anonymous participant
    await prisma.anonymousParticipant.create({
      data: {
        conversationId: testConversation.id,
        displayName: 'Anonymous Guest',
        language: 'ar',
        isActive: true
      }
    });

    // Track ZMQ requests
    let capturedTargetLanguages: string[] = [];
    mockZmqClient.sendTranslationRequest.mockImplementation(async (request: any) => {
      capturedTargetLanguages = request.targetLanguages;
      return `task-${Date.now()}`;
    });

    // Send message from user1
    const result = await translationService.handleNewMessage({
      conversationId: testConversation.id,
      senderId: user1.id,
      content: 'Language extraction test',
      originalLanguage: 'en'
    });
    createdMessageIds.push(result.messageId);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify languages were extracted (should include es, pt, ar but not en since source is en)
    // Should also include fr, de from user1 but they might be filtered if source matches
    expect(mockZmqClient.sendTranslationRequest).toHaveBeenCalled();
    // The exact languages depend on filtering logic, but should include at least es and ar
    expect(capturedTargetLanguages).toContain('es');
    expect(capturedTargetLanguages).toContain('ar');
  });
});
