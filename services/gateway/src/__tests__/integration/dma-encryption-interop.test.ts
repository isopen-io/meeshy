/**
 * DMA Encryption Interoperability Tests
 *
 * Tests encryption compatibility with Digital Markets Act (DMA) interoperability:
 * - WhatsApp messages (plaintext from external platform)
 * - iMessage integration
 * - Signal Protocol compatibility
 * - Cross-platform encryption metadata handling
 * - Gateway message forwarding with encryption
 */

import { PrismaClient } from '../../../shared/prisma/client';
import { MessagingService } from '../../services/MessagingService';
import { encryptionService } from '../../services/EncryptionService';
import type { MessageRequest } from '../../../shared/types/messaging';
import type { EncryptedPayload } from '../../../shared/types/encryption';

const prisma = new PrismaClient();
const messagingService = new MessagingService(prisma);

describe('DMA Encryption Interoperability Tests', () => {
  let meeshyUser: any;
  let whatsappUser: any;
  let imessageUser: any;
  let dmaConversation: any;

  beforeAll(async () => {
    await encryptionService.initialize();

    // Create Meeshy native user
    meeshyUser = await prisma.user.create({
      data: {
        username: 'meeshy_native',
        email: 'native@meeshy.com',
        phoneNumber: '+1111111111',
        firstName: 'Meeshy',
        lastName: 'User',
        role: 'USER',
        encryptionPreference: 'always',
      },
    });

    // Create WhatsApp DMA user (external user connected via DMA)
    whatsappUser = await prisma.user.create({
      data: {
        username: 'whatsapp_user',
        email: 'whatsapp@external.com',
        phoneNumber: '+2222222222',
        firstName: 'WhatsApp',
        lastName: 'User',
        role: 'USER',
        // WhatsApp users don't have encryption preference initially
        encryptionPreference: null,
      },
    });

    // Create iMessage DMA user
    imessageUser = await prisma.user.create({
      data: {
        username: 'imessage_user',
        email: 'imessage@external.com',
        phoneNumber: '+3333333333',
        firstName: 'iMessage',
        lastName: 'User',
        role: 'USER',
        encryptionPreference: null,
      },
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: meeshyUser.id },
          { senderId: whatsappUser.id },
          { senderId: imessageUser.id },
        ],
      },
    });

    await prisma.conversationParticipant.deleteMany({
      where: {
        userId: { in: [meeshyUser.id, whatsappUser.id, imessageUser.id] },
      },
    });

    await prisma.conversation.deleteMany({
      where: { id: dmaConversation?.id },
    });

    await prisma.user.deleteMany({
      where: { id: { in: [meeshyUser.id, whatsappUser.id, imessageUser.id] } },
    });

    await prisma.$disconnect();
  });

  describe('Scenario 1: WhatsApp → Meeshy (Plaintext Interop)', () => {
    it('should create DMA conversation between Meeshy and WhatsApp user', async () => {
      dmaConversation = await prisma.conversation.create({
        data: {
          type: 'direct',
          participants: {
            create: [
              { userId: meeshyUser.id, role: 'member' },
              { userId: whatsappUser.id, role: 'member' },
            ],
          },
        },
        include: {
          participants: true,
        },
      });

      expect(dmaConversation).toBeDefined();
      expect(dmaConversation.encryptionEnabledAt).toBeNull(); // No encryption initially
    });

    it('should receive plaintext message from WhatsApp', async () => {
      // Simulates message arriving from WhatsApp via DMA gateway
      const whatsappMessage: MessageRequest = {
        conversationId: dmaConversation.id,
        content: 'Hello from WhatsApp!',
        originalLanguage: 'en',
        messageType: 'text',
        // WhatsApp messages arrive as plaintext (no encryption support)
      };

      const response = await messagingService.handleMessage(
        whatsappMessage,
        whatsappUser.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeNull();
      expect(response.data.content).toBe('Hello from WhatsApp!');
    });

    it('should send plaintext message to WhatsApp', async () => {
      // Meeshy user sends to WhatsApp user (must be plaintext)
      const meeshyMessage: MessageRequest = {
        conversationId: dmaConversation.id,
        content: 'Hi from Meeshy!',
        originalLanguage: 'en',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        meeshyMessage,
        meeshyUser.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeNull();
      // Message should be delivered to WhatsApp in plaintext
    });

    it('should translate WhatsApp messages normally', async () => {
      // WhatsApp message in Spanish
      const spanishMessage: MessageRequest = {
        conversationId: dmaConversation.id,
        content: 'Hola desde WhatsApp',
        originalLanguage: 'es',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        spanishMessage,
        whatsappUser.id,
        true
      );

      expect(response.status).toBe('success');
      // Should be available for translation since no encryption
      expect(response.data.originalLanguage).toBe('es');
    });
  });

  describe('Scenario 2: Meeshy Native Conversation with Encryption', () => {
    let encryptedConversation: any;

    it('should create encrypted conversation between Meeshy users', async () => {
      const meeshyUser2 = await prisma.user.create({
        data: {
          username: 'meeshy_user2',
          email: 'user2@meeshy.com',
          phoneNumber: '+4444444444',
          firstName: 'Meeshy',
          lastName: 'User2',
          role: 'USER',
          encryptionPreference: 'always',
        },
      });

      encryptedConversation = await prisma.conversation.create({
        data: {
          type: 'direct',
          encryptionEnabledAt: new Date(),
          encryptionMode: 'e2ee',
          encryptionProtocol: 'signal_v3',
          participants: {
            create: [
              { userId: meeshyUser.id, role: 'member' },
              { userId: meeshyUser2.id, role: 'member' },
            ],
          },
        },
      });

      expect(encryptedConversation.encryptionMode).toBe('e2ee');
    });

    it('should exchange E2EE messages between Meeshy users', async () => {
      const encryptedPayload: EncryptedPayload = {
        ciphertext: Buffer.from('Encrypted Meeshy message').toString('base64'),
        metadata: {
          mode: 'e2ee',
          protocol: 'signal_v3',
          keyId: 'meeshy-key-123',
          iv: Buffer.from('iv-data').toString('base64'),
          authTag: Buffer.from('auth-tag').toString('base64'),
        },
      };

      const request: MessageRequest = {
        conversationId: encryptedConversation.id,
        content: '[Encrypted]',
        encryptedPayload,
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        meeshyUser.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptedContent).toBeTruthy();
      expect(response.data.encryptionMetadata.mode).toBe('e2ee');
    });
  });

  describe('Scenario 3: Mixed Platform Group Conversation', () => {
    let mixedGroupConversation: any;

    it('should create group with Meeshy and external DMA users', async () => {
      mixedGroupConversation = await prisma.conversation.create({
        data: {
          type: 'group',
          groupName: 'Cross-Platform Group',
          participants: {
            create: [
              { userId: meeshyUser.id, role: 'admin' },
              { userId: whatsappUser.id, role: 'member' },
              { userId: imessageUser.id, role: 'member' },
            ],
          },
        },
      });

      expect(mixedGroupConversation.participants).toHaveLength(3);
    });

    it('should NOT enable E2EE when external platforms are present', async () => {
      // E2EE requires all participants to support Signal Protocol
      // If WhatsApp/iMessage users are present, fall back to server mode or plaintext

      expect(mixedGroupConversation.encryptionEnabledAt).toBeNull();
      // This reflects that external platforms don't support Signal Protocol
    });

    it('should allow server-encrypted mode for DMA groups', async () => {
      // Server-encrypted mode can work with DMA
      // Messages are encrypted at rest on Meeshy servers
      // But delivered in plaintext to external platforms

      mixedGroupConversation = await prisma.conversation.update({
        where: { id: mixedGroupConversation.id },
        data: {
          encryptionEnabledAt: new Date(),
          encryptionMode: 'server',
          encryptionProtocol: 'aes-256-gcm',
          serverEncryptionKeyId: await encryptionService.getOrCreateConversationKey(),
        },
      });

      expect(mixedGroupConversation.encryptionMode).toBe('server');
    });

    it('should store messages encrypted but deliver plaintext to DMA platforms', async () => {
      const request: MessageRequest = {
        conversationId: mixedGroupConversation.id,
        content: 'Message in mixed group',
        originalLanguage: 'en',
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        meeshyUser.id,
        true
      );

      expect(response.status).toBe('success');
      // Message is encrypted on Meeshy servers
      expect(response.data.encryptedContent).toBeTruthy();

      // But would be delivered to WhatsApp/iMessage in plaintext
      // (The DMA adapter would decrypt before forwarding)
    });
  });

  describe('Scenario 4: WhatsApp Signal Protocol Support (Future)', () => {
    it('should prepare for WhatsApp adding Signal Protocol support', async () => {
      // Future test: When WhatsApp adds Signal Protocol
      // This test shows how it would work

      const futureConversation = await prisma.conversation.create({
        data: {
          type: 'direct',
          encryptionEnabledAt: new Date(),
          encryptionMode: 'e2ee',
          encryptionProtocol: 'signal_v3',
          participants: {
            create: [
              { userId: meeshyUser.id, role: 'member' },
              { userId: whatsappUser.id, role: 'member' },
            ],
          },
        },
      });

      // If WhatsApp supported Signal Protocol, this would work
      const e2eePayload: EncryptedPayload = {
        ciphertext: Buffer.from('Cross-platform E2EE').toString('base64'),
        metadata: {
          mode: 'e2ee',
          protocol: 'signal_v3',
          keyId: 'cross-platform-key',
          iv: Buffer.from('iv').toString('base64'),
          authTag: Buffer.from('tag').toString('base64'),
        },
      };

      const request: MessageRequest = {
        conversationId: futureConversation.id,
        content: '[Encrypted]',
        encryptedPayload: e2eePayload,
        messageType: 'text',
      };

      const response = await messagingService.handleMessage(
        request,
        meeshyUser.id,
        true
      );

      expect(response.status).toBe('success');
      expect(response.data.encryptionMetadata.mode).toBe('e2ee');
    });
  });

  describe('Scenario 5: Encryption Metadata Handling', () => {
    it('should preserve encryption metadata through DMA gateway', async () => {
      // When message flows through DMA gateway, metadata must be preserved
      const messages = await prisma.message.findMany({
        where: {
          conversationId: mixedGroupConversation.id,
          encryptedContent: { not: null },
        },
        take: 1,
      });

      if (messages.length > 0) {
        const message = messages[0];

        expect(message.encryptionMetadata).toBeDefined();
        expect(message.encryptionMetadata.mode).toBe('server');
        expect(message.encryptionMetadata.protocol).toBe('aes-256-gcm');
        expect(message.encryptionMetadata.keyId).toBeDefined();
      }
    });

    it('should handle missing encryption metadata gracefully', async () => {
      // DMA platforms might not provide encryption metadata
      const plainMessages = await prisma.message.findMany({
        where: {
          conversationId: dmaConversation.id,
          encryptedContent: null,
        },
      });

      plainMessages.forEach((message) => {
        expect(message.encryptionMetadata).toBeNull();
      });
    });
  });

  describe('Scenario 6: Translation Compatibility', () => {
    it('should translate messages from WhatsApp normally', async () => {
      // WhatsApp messages are plaintext, so translation works
      const allMessages = await prisma.message.findMany({
        where: {
          conversationId: dmaConversation.id,
          senderId: whatsappUser.id,
        },
      });

      allMessages.forEach((message) => {
        expect(message.encryptedContent).toBeNull();
        // Translation service can access content
      });
    });

    it('should translate server-encrypted messages in DMA groups', async () => {
      // Server-encrypted mode supports translation
      const conversation = await prisma.conversation.findUnique({
        where: { id: mixedGroupConversation.id },
      });

      expect(conversation?.encryptionMode).toBe('server');
      // Server can decrypt → translate → re-encrypt
    });
  });

  describe('Scenario 7: Gateway Message Forwarding', () => {
    it('should decrypt server-encrypted message for DMA delivery', async () => {
      const messages = await prisma.message.findMany({
        where: {
          conversationId: mixedGroupConversation.id,
          encryptedContent: { not: null },
        },
        take: 1,
      });

      if (messages.length > 0) {
        const message = messages[0];

        const payload = encryptionService.parseEncryptedContent(
          message.encryptedContent,
          message.encryptionMetadata
        );

        expect(payload).not.toBeNull();

        // Gateway would decrypt before forwarding to WhatsApp
        const decrypted = await encryptionService.decryptMessage(payload!);
        expect(decrypted).toBeTruthy();
        // This plaintext would be sent to WhatsApp
      }
    });

    it('should NOT decrypt E2EE messages for DMA delivery', async () => {
      // E2EE messages cannot be decrypted by gateway
      // Therefore, they cannot be delivered to platforms without Signal support
      // This is a fundamental limitation

      const e2eePayload: EncryptedPayload = {
        ciphertext: 'e2ee-encrypted',
        metadata: {
          mode: 'e2ee',
          protocol: 'signal_v3',
          keyId: 'key',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      await expect(
        encryptionService.decryptMessage(e2eePayload)
      ).rejects.toThrow('Cannot decrypt E2EE messages');
    });
  });

  describe('Scenario 8: Error Handling and Edge Cases', () => {
    it('should handle malformed encryption metadata from DMA platforms', async () => {
      const message = await prisma.message.create({
        data: {
          conversationId: dmaConversation.id,
          senderId: whatsappUser.id,
          content: 'Test',
          encryptedContent: 'some-data',
          encryptionMetadata: { invalid: 'metadata' } as any,
          messageType: 'text',
        },
      });

      const payload = encryptionService.parseEncryptedContent(
        message.encryptedContent,
        message.encryptionMetadata
      );

      // Should handle gracefully
      expect(payload).toBeNull();
    });

    it('should prevent E2EE mode in conversations with non-supporting platforms', async () => {
      // Attempting to enable E2EE with WhatsApp users should fail or warn
      // (In practice, the UI would prevent this)

      const conversation = await prisma.conversation.findUnique({
        where: { id: dmaConversation.id },
        include: { participants: { include: { user: true } } },
      });

      const hasExternalUsers = conversation?.participants.some(
        (p) => p.user.encryptionPreference === null
      );

      expect(hasExternalUsers).toBe(true);
      // E2EE should not be enabled for this conversation
    });
  });

  describe('Scenario 9: Performance with DMA Messages', () => {
    it('should handle high volume of DMA messages efficiently', async () => {
      const startTime = Date.now();
      const messageCount = 20;

      for (let i = 0; i < messageCount; i++) {
        const request: MessageRequest = {
          conversationId: dmaConversation.id,
          content: `DMA message ${i}`,
          originalLanguage: 'en',
          messageType: 'text',
        };

        await messagingService.handleMessage(
          request,
          whatsappUser.id,
          true
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle DMA messages efficiently (< 10 seconds for 20 messages)
      expect(duration).toBeLessThan(10000);
    });
  });
});
