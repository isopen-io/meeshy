/**
 * Comprehensive E2EE Integration Tests
 *
 * Tests the complete encryption flow from user registration to encrypted communication.
 * Scenarios:
 * 1. User registration with encryption keys
 * 2. Direct conversation (plaintext)
 * 3. Group conversation (plaintext)
 * 4. Enable encryption on conversation (both modes)
 * 5. Send encrypted messages (server mode)
 * 6. Send encrypted messages (E2EE mode)
 * 7. Read encrypted messages
 * 8. Translation in server mode
 * 9. Translation blocked in E2EE mode
 */

import { PrismaClient } from '../../../shared/prisma/client';
import { MessagingService } from '../../services/MessagingService';
import { encryptionService } from '../../services/EncryptionService';
import { TranslationService } from '../../services/TranslationService';
import type { MessageRequest } from '../../../shared/types/messaging';
import type { EncryptedPayload, EncryptionMode } from '../../../shared/types/encryption';
import crypto from 'crypto';

describe('E2EE Full Flow Integration Tests', () => {
  let prisma: PrismaClient;
  let messagingService: MessagingService;
  let translationService: TranslationService;

  // Test users
  let alice: any;
  let bob: any;
  let charlie: any;

  // Test conversations
  let directConversation: any;
  let groupConversation: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    translationService = new TranslationService(prisma);
    messagingService = new MessagingService(prisma, translationService);

    // Clean up test data
    await prisma.message.deleteMany({
      where: {
        sender: {
          username: { in: ['alice_e2ee', 'bob_e2ee', 'charlie_e2ee'] }
        }
      }
    });
    await prisma.conversationMember.deleteMany({
      where: {
        user: {
          username: { in: ['alice_e2ee', 'bob_e2ee', 'charlie_e2ee'] }
        }
      }
    });
    await prisma.conversation.deleteMany({
      where: {
        identifier: { in: ['test_direct_e2ee', 'test_group_e2ee'] }
      }
    });
    await prisma.user.deleteMany({
      where: {
        username: { in: ['alice_e2ee', 'bob_e2ee', 'charlie_e2ee'] }
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.message.deleteMany({
      where: {
        sender: {
          username: { in: ['alice_e2ee', 'bob_e2ee', 'charlie_e2ee'] }
        }
      }
    });
    await prisma.conversationMember.deleteMany({
      where: {
        user: {
          username: { in: ['alice_e2ee', 'bob_e2ee', 'charlie_e2ee'] }
        }
      }
    });
    await prisma.conversation.deleteMany({
      where: {
        identifier: { in: ['test_direct_e2ee', 'test_group_e2ee'] }
      }
    });
    await prisma.user.deleteMany({
      where: {
        username: { in: ['alice_e2ee', 'bob_e2ee', 'charlie_e2ee'] }
      }
    });
    await prisma.$disconnect();
  });

  describe('1. User Registration with Encryption Keys', () => {
    it('should create users with encryption preferences', async () => {
      // Create Alice
      alice = await prisma.user.create({
        data: {
          username: 'alice_e2ee',
          email: 'alice@test.com',
          language: 'en',
          encryptionPreference: 'always', // Alice always wants encryption
        }
      });

      expect(alice).toBeDefined();
      expect(alice.encryptionPreference).toBe('always');
      expect(alice.signalIdentityKeyPublic).toBeNull(); // Not generated yet
    });

    it('should generate Signal Protocol keys for Alice', async () => {
      // Generate Signal keys (simplified for test)
      const identityKeyPublic = crypto.randomBytes(32).toString('base64');
      const identityKeyPrivate = crypto.randomBytes(32).toString('base64');
      const registrationId = crypto.randomInt(1, 16380);

      alice = await prisma.user.update({
        where: { id: alice.id },
        data: {
          signalIdentityKeyPublic: identityKeyPublic,
          signalIdentityKeyPrivate: identityKeyPrivate,
          signalRegistrationId: registrationId,
          signalPreKeyBundleVersion: 1,
          lastKeyRotation: new Date(),
        }
      });

      expect(alice.signalIdentityKeyPublic).toBeTruthy();
      expect(alice.signalRegistrationId).toBeGreaterThan(0);
    });

    it('should create Bob and Charlie with optional encryption', async () => {
      bob = await prisma.user.create({
        data: {
          username: 'bob_e2ee',
          email: 'bob@test.com',
          language: 'fr',
          encryptionPreference: 'optional',
        }
      });

      charlie = await prisma.user.create({
        data: {
          username: 'charlie_e2ee',
          email: 'charlie@test.com',
          language: 'es',
          encryptionPreference: 'optional',
        }
      });

      expect(bob.encryptionPreference).toBe('optional');
      expect(charlie.encryptionPreference).toBe('optional');
    });
  });

  describe('2. Direct Conversation (Plaintext)', () => {
    it('should create a direct conversation between Alice and Bob', async () => {
      directConversation = await prisma.conversation.create({
        data: {
          identifier: 'test_direct_e2ee',
          type: 'direct',
          title: 'Alice & Bob',
          members: {
            create: [
              { userId: alice.id, role: 'OWNER', isActive: true },
              { userId: bob.id, role: 'MEMBER', isActive: true },
            ]
          }
        }
      });

      expect(directConversation).toBeDefined();
      expect(directConversation.encryptionEnabledAt).toBeNull();
    });

    it('should send plaintext message from Alice to Bob', async () => {
      const request: MessageRequest = {
        conversationId: directConversation.id,
        content: 'Hello Bob! This is a plaintext message.',
        originalLanguage: 'en',
      };

      const response = await messagingService.handleMessage(request, alice.id, true);

      expect(response.success).toBe(true);
      expect(response.data.content).toBe('Hello Bob! This is a plaintext message.');
      expect(response.data.encryptedContent).toBeNull();
    });

    it('should allow translation in plaintext mode', async () => {
      const messages = await prisma.message.findMany({
        where: { conversationId: directConversation.id }
      });

      expect(messages.length).toBeGreaterThan(0);
      const lastMessage = messages[messages.length - 1];

      // Translation service should be called (check via metadata or translation table)
      expect(lastMessage.encryptedContent).toBeNull();
    });
  });

  describe('3. Group Conversation (Plaintext)', () => {
    it('should create a group conversation with Alice, Bob, and Charlie', async () => {
      groupConversation = await prisma.conversation.create({
        data: {
          identifier: 'test_group_e2ee',
          type: 'group',
          title: 'Team Chat',
          members: {
            create: [
              { userId: alice.id, role: 'ADMIN', isActive: true },
              { userId: bob.id, role: 'MEMBER', isActive: true },
              { userId: charlie.id, role: 'MEMBER', isActive: true },
            ]
          }
        }
      });

      expect(groupConversation).toBeDefined();
      expect(groupConversation.type).toBe('group');
    });

    it('should send plaintext group message', async () => {
      const request: MessageRequest = {
        conversationId: groupConversation.id,
        content: 'Hello everyone! This is a group message.',
        originalLanguage: 'en',
      };

      const response = await messagingService.handleMessage(request, alice.id, true);

      expect(response.success).toBe(true);
      expect(response.data.encryptedContent).toBeNull();
    });
  });

  describe('4. Enable Encryption on Conversation', () => {
    describe('Server-Encrypted Mode', () => {
      it('should enable server-encrypted mode on direct conversation', async () => {
        const keyId = await encryptionService.getOrCreateConversationKey();

        directConversation = await prisma.conversation.update({
          where: { id: directConversation.id },
          data: {
            encryptionEnabledAt: new Date(),
            encryptionMode: 'server',
            encryptionProtocol: 'aes-256-gcm',
            encryptionEnabledBy: alice.id,
            serverEncryptionKeyId: keyId,
            autoTranslateEnabled: true,
          }
        });

        expect(directConversation.encryptionEnabledAt).toBeTruthy();
        expect(directConversation.encryptionMode).toBe('server');
        expect(directConversation.serverEncryptionKeyId).toBeTruthy();
      });

      it('should create system message notifying encryption enabled', async () => {
        await prisma.message.create({
          data: {
            conversationId: directConversation.id,
            senderId: alice.id,
            content: '🔐 Server-side encryption enabled. Messages are encrypted with translation support.',
            originalLanguage: 'en',
            messageType: 'system',
          }
        });

        const systemMessage = await prisma.message.findFirst({
          where: {
            conversationId: directConversation.id,
            messageType: 'system',
          }
        });

        expect(systemMessage).toBeDefined();
        expect(systemMessage?.encryptedContent).toBeNull(); // System messages are never encrypted
      });
    });

    describe('E2EE Mode', () => {
      it('should enable E2EE mode on group conversation', async () => {
        groupConversation = await prisma.conversation.update({
          where: { id: groupConversation.id },
          data: {
            encryptionEnabledAt: new Date(),
            encryptionMode: 'e2ee',
            encryptionProtocol: 'signal_v3',
            encryptionEnabledBy: alice.id,
            autoTranslateEnabled: false, // E2EE disables translation
          }
        });

        expect(groupConversation.encryptionEnabledAt).toBeTruthy();
        expect(groupConversation.encryptionMode).toBe('e2ee');
        expect(groupConversation.autoTranslateEnabled).toBe(false);
      });

      it('should be immutable (cannot disable encryption)', async () => {
        // Try to disable encryption
        await expect(
          prisma.conversation.update({
            where: { id: groupConversation.id },
            data: {
              encryptionEnabledAt: null, // Try to reset
            }
          })
        ).rejects.toThrow(); // Should fail validation
      });
    });
  });

  describe('5. Send Encrypted Messages (Server Mode)', () => {
    it('should encrypt message on server in server mode', async () => {
      const request: MessageRequest = {
        conversationId: directConversation.id,
        content: 'This is a server-encrypted message!',
        originalLanguage: 'en',
      };

      const response = await messagingService.handleMessage(request, bob.id, true);

      expect(response.success).toBe(true);
      expect(response.data.encryptedContent).toBeTruthy(); // Message is encrypted
      expect(response.data.encryptionMetadata).toBeTruthy();
      expect(response.data.encryptionMetadata.mode).toBe('server');
      expect(response.data.encryptionMetadata.protocol).toBe('aes-256-gcm');
    });

    it('should decrypt message for reading in server mode', async () => {
      const message = await prisma.message.findFirst({
        where: {
          conversationId: directConversation.id,
          encryptedContent: { not: null }
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(message).toBeDefined();
      expect(message?.encryptedContent).toBeTruthy();

      // Decrypt using encryption service
      const payload = encryptionService.parseEncryptedContent(
        message!.encryptedContent!,
        message!.encryptionMetadata
      );

      expect(payload).toBeTruthy();

      const decrypted = await encryptionService.decryptMessage(payload!);
      expect(decrypted).toBe('This is a server-encrypted message!');
    });

    it('should support translation in server mode', async () => {
      // Translation should work because server can decrypt
      const conversation = await prisma.conversation.findUnique({
        where: { id: directConversation.id }
      });

      expect(conversation?.encryptionMode).toBe('server');
      expect(conversation?.autoTranslateEnabled).toBe(true);

      // Verify canAutoTranslate utility
      const { canAutoTranslate } = await import('../../../shared/types/encryption');
      const translatable = canAutoTranslate({
        encryptionEnabledAt: conversation!.encryptionEnabledAt,
        encryptionMode: conversation!.encryptionMode as EncryptionMode,
      });

      expect(translatable).toBe(true);
    });
  });

  describe('6. Send Encrypted Messages (E2EE Mode)', () => {
    it('should accept client-encrypted payload in E2EE mode', async () => {
      // Simulate client-side encryption
      const plaintext = 'This is an E2EE message from Charlie!';

      // Client encrypts (we simulate this)
      const encryptedPayload: EncryptedPayload = {
        ciphertext: Buffer.from(plaintext).toString('base64'), // Simplified
        metadata: {
          mode: 'e2ee',
          protocol: 'signal_v3',
          keyId: 'charlie_session_key',
          iv: crypto.randomBytes(12).toString('base64'),
          authTag: crypto.randomBytes(16).toString('base64'),
          messageNumber: 1,
        }
      };

      const request: MessageRequest = {
        conversationId: groupConversation.id,
        content: '[Encrypted]', // Placeholder content
        originalLanguage: 'en',
        encryptedPayload, // Client provides encrypted content
      };

      const response = await messagingService.handleMessage(request, charlie.id, true);

      expect(response.success).toBe(true);
      expect(response.data.encryptedContent).toBeTruthy();
      expect(response.data.content).toBe(''); // No plaintext stored in E2EE mode
      expect(response.data.encryptionMetadata.mode).toBe('e2ee');
    });

    it('should NOT decrypt E2EE messages on server', async () => {
      const message = await prisma.message.findFirst({
        where: {
          conversationId: groupConversation.id,
          encryptedContent: { not: null }
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(message).toBeDefined();
      expect(message?.content).toBe(''); // No plaintext

      const payload = encryptionService.parseEncryptedContent(
        message!.encryptedContent!,
        message!.encryptionMetadata
      );

      // Server cannot decrypt E2EE messages
      await expect(
        encryptionService.decryptMessage(payload!)
      ).rejects.toThrow('Cannot decrypt E2EE messages on server');
    });

    it('should block translation in E2EE mode', async () => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: groupConversation.id }
      });

      expect(conversation?.encryptionMode).toBe('e2ee');
      expect(conversation?.autoTranslateEnabled).toBe(false);

      // Verify canAutoTranslate utility
      const { canAutoTranslate } = await import('../../../shared/types/encryption');
      const translatable = canAutoTranslate({
        encryptionEnabledAt: conversation!.encryptionEnabledAt,
        encryptionMode: conversation!.encryptionMode as EncryptionMode,
      });

      expect(translatable).toBe(false);
    });
  });

  describe('7. System Messages Never Encrypted', () => {
    it('should not encrypt system messages even in encrypted conversation', async () => {
      const systemMessage = await prisma.message.create({
        data: {
          conversationId: groupConversation.id,
          senderId: alice.id,
          content: 'Alice invited a new user',
          originalLanguage: 'en',
          messageType: 'system',
        }
      });

      expect(systemMessage.encryptedContent).toBeNull();
      expect(systemMessage.content).toBe('Alice invited a new user');
    });
  });

  describe('8. Encryption Utility Functions', () => {
    it('should correctly determine if message is encrypted', async () => {
      const { isMessageEncrypted } = await import('../../../shared/types/encryption');

      const conversation = await prisma.conversation.findUnique({
        where: { id: directConversation.id }
      });

      // Regular message after encryption enabled
      expect(isMessageEncrypted(
        { messageType: 'text', createdAt: new Date() },
        { encryptionEnabledAt: conversation!.encryptionEnabledAt }
      )).toBe(true);

      // System message (never encrypted)
      expect(isMessageEncrypted(
        { messageType: 'system', createdAt: new Date() },
        { encryptionEnabledAt: conversation!.encryptionEnabledAt }
      )).toBe(false);

      // Message before encryption enabled
      const beforeDate = new Date(conversation!.encryptionEnabledAt!.getTime() - 1000);
      expect(isMessageEncrypted(
        { messageType: 'text', createdAt: beforeDate },
        { encryptionEnabledAt: conversation!.encryptionEnabledAt }
      )).toBe(false);
    });

    it('should get correct encryption status', async () => {
      const { getEncryptionStatus } = await import('../../../shared/types/encryption');

      const conversation = await prisma.conversation.findUnique({
        where: { id: directConversation.id }
      });

      const status = getEncryptionStatus({
        encryptionEnabledAt: conversation!.encryptionEnabledAt,
        encryptionMode: conversation!.encryptionMode as EncryptionMode,
        encryptionEnabledBy: conversation!.encryptionEnabledBy,
      });

      expect(status.isEncrypted).toBe(true);
      expect(status.mode).toBe('server');
      expect(status.canTranslate).toBe(true);
      expect(status.enabledBy).toBe(alice.id);
    });
  });

  describe('9. Hybrid Conversation Scenarios', () => {
    it('should handle historical plaintext messages in now-encrypted conversation', async () => {
      // Messages sent before encryption was enabled should remain plaintext
      const allMessages = await prisma.message.findMany({
        where: { conversationId: directConversation.id },
        orderBy: { createdAt: 'asc' }
      });

      // First messages (before encryption) should be plaintext
      const firstMessage = allMessages[0];
      expect(firstMessage.encryptedContent).toBeNull();
      expect(firstMessage.content).toBeTruthy();

      // Later messages (after encryption) should be encrypted
      const lastMessage = allMessages[allMessages.length - 1];
      if (lastMessage.messageType !== 'system') {
        expect(lastMessage.encryptedContent).toBeTruthy();
      }
    });

    it('should handle mixed conversation with both encrypted and plaintext history', async () => {
      const { isMessageEncrypted } = await import('../../../shared/types/encryption');

      const conversation = await prisma.conversation.findUnique({
        where: { id: directConversation.id }
      });

      const messages = await prisma.message.findMany({
        where: { conversationId: directConversation.id },
        orderBy: { createdAt: 'asc' }
      });

      messages.forEach(msg => {
        const shouldBeEncrypted = isMessageEncrypted(
          { messageType: msg.messageType, createdAt: msg.createdAt },
          { encryptionEnabledAt: conversation!.encryptionEnabledAt }
        );

        if (shouldBeEncrypted) {
          expect(msg.encryptedContent).toBeTruthy();
        } else {
          // Either plaintext or system message
          expect(msg.encryptedContent).toBeNull();
        }
      });
    });
  });

  describe('10. Error Handling', () => {
    it('should reject E2EE message without encryptedPayload', async () => {
      const request: MessageRequest = {
        conversationId: groupConversation.id,
        content: 'This should fail!',
        originalLanguage: 'en',
        // Missing encryptedPayload!
      };

      const response = await messagingService.handleMessage(request, alice.id, true);

      expect(response.success).toBe(false);
      expect(response.error).toContain('E2EE mode requires encrypted payload');
    });

    it('should handle invalid encryption metadata gracefully', async () => {
      const invalidPayload: any = {
        ciphertext: 'invalid_base64',
        metadata: {
          mode: 'invalid_mode', // Invalid mode
          protocol: 'aes-256-gcm',
          keyId: 'test',
          iv: 'test',
          authTag: 'test',
        }
      };

      await expect(
        encryptionService.encryptMessage('test', invalidPayload.metadata.mode as EncryptionMode)
      ).rejects.toThrow();
    });
  });
});
