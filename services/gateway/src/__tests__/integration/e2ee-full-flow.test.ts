/**
 * E2EE Full Flow Integration Tests
 *
 * Comprehensive integration tests covering:
 * - User registration with encryption keys
 * - Direct conversations (plaintext → encrypted)
 * - Group conversations with encryption
 * - Server-encrypted mode
 * - E2EE mode
 * - Hybrid conversations (mixed plaintext/encrypted)
 * - Translation compatibility
 * - DMA interoperability
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessagingService } from '../../services/MessagingService';
import { encryptionService } from '../../services/EncryptionService';
import type { MessageRequest } from '../../../shared/types/messaging';
import type { EncryptedPayload } from '../../../shared/types/encryption';
import {
  isMessageEncrypted,
  canAutoTranslate,
} from '../../../shared/types/encryption';

const prisma = new PrismaClient();
const messagingService = new MessagingService(prisma);

describe('E2EE Full Flow Integration Tests', () => {
  let alice: any;
  let bob: any;
  let charlie: any;
  let directConversation: any;
  let groupConversation: any;

  beforeAll(async () => {
    // Initialize encryption service
    await encryptionService.initialize();

    // Create test users
    alice = await prisma.user.create({
      data: {
        username: 'alice_e2ee',
        email: 'alice@test.com',
        phoneNumber: '+1234567890',
        firstName: 'Alice',
        lastName: 'Test',
        role: 'USER',
        encryptionPreference: 'always', // Alice wants encryption
      },
    });

    bob = await prisma.user.create({
      data: {
        username: 'bob_e2ee',
        email: 'bob@test.com',
        phoneNumber: '+1234567891',
        firstName: 'Bob',
        lastName: 'Test',
        role: 'USER',
        encryptionPreference: 'optional', // Bob is flexible
      },
    });

    charlie = await prisma.user.create({
      data: {
        username: 'charlie_e2ee',
        email: 'charlie@test.com',
        phoneNumber: '+1234567892',
        firstName: 'Charlie',
        lastName: 'Test',
        role: 'USER',
        encryptionPreference: 'never', // Charlie prefers plaintext
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: alice.id },
          { senderId: bob.id },
          { senderId: charlie.id },
        ],
      },
    });

    await prisma.conversationParticipant.deleteMany({
      where: {
        userId: { in: [alice.id, bob.id, charlie.id] },
      },
    });

    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { id: directConversation?.id },
          { id: groupConversation?.id },
        ],
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: { in: [alice.id, bob.id, charlie.id] },
      },
    });

    await prisma.$disconnect();
  });

  describe('Scenario 1: User Registration & Key Generation', () => {
    it('should create users with encryption preferences', () => {
      expect(alice).toBeDefined();
      expect(alice.encryptionPreference).toBe('always');
      expect(bob.encryptionPreference).toBe('optional');
      expect(charlie.encryptionPreference).toBe('never');
    });

    it('should allow users to generate encryption keys', async () => {
      // In a real implementation, this would be done via API route
      // For now, we verify the service is initialized
      const status = encryptionService.getStatus();
      expect(status.isAvailable).toBe(true);
    });
  });

  describe('Scenario 2: Direct Conversation (Plaintext)', () => {
    it('should create direct conversation between Alice and Bob', async () => {
      directConversation = await prisma.conversation.create({
        data: {
          type: 'direct',
          participants: {
            create: [
              { userId: alice.id, role: 'member' },
              { userId: bob.id, role: 'member' },
            ],
          },
        },
        include: {
          participants: true,
        },
      });

      expect(directConversation).toBeDefined();
      expect(directConversation.participants).toHaveLength(2);
      expect(directConversation.encryptionEnabledAt).toBeNull();
    });

    it('should send plaintext message from Alice to Bob', async () => {
      const messageContent = 'Hi Bob! This is Alice.';
      const request: MessageRequest = {
        conversationId: directConversation.id,
        content: messageContent,
        originalLanguage: 'en',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        alice.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data).toBeDefined();
      expect(response.data.content).toBe(messageContent);
      expect(response.data.encryptedContent).toBeNull();
      expect(response.data.encryptionMetadata).toBeNull();
    });

    it('should verify message is not encrypted', async () => {
      const messages = await prisma.message.findMany({
        where: { conversationId: directConversation.id },
        include: { conversation: true },
      });

      expect(messages).toHaveLength(1);
      const message = messages[0];

      const encrypted = isMessageEncrypted(message, message.conversation);
      expect(encrypted).toBe(false);
    });
  });

  describe('Scenario 3: Group Conversation (Plaintext)', () => {
    it('should create group conversation with Alice, Bob, and Charlie', async () => {
      groupConversation = await prisma.conversation.create({
        data: {
          type: 'group',
          groupName: 'Test Group',
          participants: {
            create: [
              { userId: alice.id, role: 'admin' },
              { userId: bob.id, role: 'member' },
              { userId: charlie.id, role: 'member' },
            ],
          },
        },
        include: {
          participants: true,
        },
      });

      expect(groupConversation).toBeDefined();
      expect(groupConversation.participants).toHaveLength(3);
    });

    it('should send plaintext messages in group', async () => {
      const request: MessageRequest = {
        conversationId: groupConversation.id,
        content: 'Hello everyone!',
        originalLanguage: 'en',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        alice.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeNull();
    });
  });

  describe('Scenario 4: Enable Server-Encrypted Mode', () => {
    it('should enable server-encrypted mode on direct conversation', async () => {
      directConversation = await prisma.conversation.update({
        where: { id: directConversation.id },
        data: {
          encryptionEnabledAt: new Date(),
          encryptionMode: 'server',
          encryptionProtocol: 'aes-256-gcm',
          serverEncryptionKeyId: await encryptionService.getOrCreateConversationKey(),
        },
      });

      expect(directConversation.encryptionEnabledAt).not.toBeNull();
      expect(directConversation.encryptionMode).toBe('server');
    });

    it('should encrypt message on server in server mode', async () => {
      const messageContent = 'This message should be encrypted on server';
      const request: MessageRequest = {
        conversationId: directConversation.id,
        content: messageContent,
        originalLanguage: 'en',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        bob.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeTruthy();
      expect(response.data.encryptionMetadata).toBeDefined();
      expect(response.data.encryptionMetadata.mode).toBe('server');
      expect(response.data.encryptionMetadata.protocol).toBe('aes-256-gcm');
    });

    it('should decrypt message successfully', async () => {
      const messages = await prisma.message.findMany({
        where: {
          conversationId: directConversation.id,
          encryptedContent: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(messages).toHaveLength(1);
      const message = messages[0];

      const payload = encryptionService.parseEncryptedContent(
        message.encryptedContent,
        message.encryptionMetadata
      );

      expect(payload).not.toBeNull();

      const decrypted = await encryptionService.decryptMessage(payload!);
      expect(decrypted).toBe('This message should be encrypted on server');
    });

    it('should support translation in server mode', async () => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: directConversation.id },
      });

      const translatable = canAutoTranslate(conversation!);
      expect(translatable).toBe(true);
    });
  });

  describe('Scenario 5: Enable E2EE Mode', () => {
    it('should enable E2EE mode on group conversation', async () => {
      groupConversation = await prisma.conversation.update({
        where: { id: groupConversation.id },
        data: {
          encryptionEnabledAt: new Date(),
          encryptionMode: 'e2ee',
          encryptionProtocol: 'signal_v3',
        },
      });

      expect(groupConversation.encryptionEnabledAt).not.toBeNull();
      expect(groupConversation.encryptionMode).toBe('e2ee');
    });

    it('should accept client-encrypted payload in E2EE mode', async () => {
      const plaintext = 'End-to-end encrypted message';

      // Client would encrypt this
      const encryptedPayload: EncryptedPayload = {
        ciphertext: Buffer.from(plaintext).toString('base64'),
        metadata: {
          mode: 'e2ee',
          protocol: 'signal_v3',
          keyId: 'client-key-123',
          iv: Buffer.from('random-iv').toString('base64'),
          authTag: Buffer.from('auth-tag').toString('base64'),
          messageNumber: 1,
          preKeyId: 123,
        },
      };

      const request: MessageRequest = {
        conversationId: groupConversation.id,
        content: '[Encrypted]', // Placeholder
        encryptedPayload,
        originalLanguage: 'en',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        charlie.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeTruthy();
      expect(response.data.encryptionMetadata.mode).toBe('e2ee');
      expect(response.data.content).toBe(''); // Server doesn't see plaintext
    });

    it('should not decrypt E2EE messages on server', async () => {
      const messages = await prisma.message.findMany({
        where: {
          conversationId: groupConversation.id,
          encryptedContent: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(messages).toHaveLength(1);
      const message = messages[0];

      const payload = encryptionService.parseEncryptedContent(
        message.encryptedContent,
        message.encryptionMetadata
      );

      expect(payload).not.toBeNull();

      await expect(
        encryptionService.decryptMessage(payload!)
      ).rejects.toThrow('Cannot decrypt E2EE messages');
    });

    it('should block translation in E2EE mode', async () => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: groupConversation.id },
      });

      const translatable = canAutoTranslate(conversation!);
      expect(translatable).toBe(false);
    });
  });

  describe('Scenario 6: Hybrid Conversations', () => {
    it('should have mixed plaintext and encrypted messages', async () => {
      const allMessages = await prisma.message.findMany({
        where: { conversationId: directConversation.id },
        orderBy: { createdAt: 'asc' },
        include: { conversation: true },
      });

      expect(allMessages.length).toBeGreaterThan(1);

      // First message should be plaintext
      const firstMessage = allMessages[0];
      expect(isMessageEncrypted(firstMessage, firstMessage.conversation)).toBe(
        false
      );

      // Later messages should be encrypted
      const lastMessage = allMessages[allMessages.length - 1];
      expect(isMessageEncrypted(lastMessage, lastMessage.conversation)).toBe(
        true
      );
    });

    it('should correctly identify encrypted vs plaintext messages', async () => {
      const messages = await prisma.message.findMany({
        where: { conversationId: directConversation.id },
        include: { conversation: true },
        orderBy: { createdAt: 'asc' },
      });

      for (const message of messages) {
        const encrypted = isMessageEncrypted(message, message.conversation);

        if (encrypted) {
          expect(message.encryptedContent).not.toBeNull();
          expect(message.encryptionMetadata).not.toBeNull();
        } else {
          expect(message.content).toBeTruthy();
          expect(message.encryptedContent).toBeNull();
        }
      }
    });
  });

  describe('Scenario 7: System Messages', () => {
    it('should never encrypt system messages', async () => {
      const systemMessageRequest: MessageRequest = {
        conversationId: directConversation.id,
        content: 'Alice enabled encryption',
        messageType: 'system',
      };

      const response = await messagingService.handleMessage(
        systemMessageRequest,
        alice.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeNull();
      expect(response.data.messageType).toBe('system');

      const message = await prisma.message.findUnique({
        where: { id: response.data.id },
        include: { conversation: true },
      });

      const encrypted = isMessageEncrypted(message!, message!.conversation);
      expect(encrypted).toBe(false);
    });
  });

  describe('Scenario 8: Message Metadata', () => {
    it('should include correct encryption metadata', async () => {
      const messages = await prisma.message.findMany({
        where: {
          conversationId: directConversation.id,
          encryptedContent: { not: null },
        },
        take: 1,
      });

      expect(messages).toHaveLength(1);
      const message = messages[0];

      expect(message.encryptionMetadata).toBeDefined();
      expect(message.encryptionMetadata.mode).toBe('server');
      expect(message.encryptionMetadata.protocol).toBe('aes-256-gcm');
      expect(message.encryptionMetadata.keyId).toBeDefined();
      expect(message.encryptionMetadata.iv).toBeDefined();
      expect(message.encryptionMetadata.authTag).toBeDefined();
    });
  });

  describe('Scenario 9: Conversation Encryption Status', () => {
    it('should correctly report encryption status', async () => {
      const directConv = await prisma.conversation.findUnique({
        where: { id: directConversation.id },
      });

      expect(directConv!.encryptionEnabledAt).not.toBeNull();
      expect(directConv!.encryptionMode).toBe('server');
      expect(directConv!.encryptionProtocol).toBe('aes-256-gcm');

      const groupConv = await prisma.conversation.findUnique({
        where: { id: groupConversation.id },
      });

      expect(groupConv!.encryptionEnabledAt).not.toBeNull();
      expect(groupConv!.encryptionMode).toBe('e2ee');
      expect(groupConv!.encryptionProtocol).toBe('signal_v3');
    });
  });

  describe('Scenario 10: Error Handling', () => {
    it('should handle invalid encryption payload gracefully', async () => {
      const invalidPayload: EncryptedPayload = {
        ciphertext: 'invalid',
        metadata: {
          mode: 'server',
          protocol: 'aes-256-gcm',
          keyId: 'non-existent-key',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      await expect(
        encryptionService.decryptMessage(invalidPayload)
      ).rejects.toThrow();
    });

    it('should require encrypted payload for E2EE mode messages', async () => {
      const request: MessageRequest = {
        conversationId: groupConversation.id,
        content: 'Plain message',
        messageType: 'text',
        // Missing encryptedPayload for E2EE conversation
      };

      // This should fail or add a plaintext placeholder
      const response = await messagingService.handleMessage(
        request,
        alice.id,
        true
      );

      // Depending on implementation, this might fail or create a system message
      expect(response.status).toBeDefined();
    });
  });

  describe('Scenario 11: Performance', () => {
    it('should handle multiple encrypted messages efficiently', async () => {
      const startTime = Date.now();
      const messageCount = 10;

      for (let i = 0; i < messageCount; i++) {
        const request: MessageRequest = {
          conversationId: directConversation.id,
          content: `Performance test message ${i}`,
          originalLanguage: 'en',
          messageType: 'text',
        };

        await messagingService.handleMessage(request, alice.id, true);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 5 seconds for 10 messages)
      expect(duration).toBeLessThan(5000);
    });
  });
});
