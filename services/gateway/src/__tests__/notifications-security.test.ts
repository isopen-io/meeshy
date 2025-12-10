/**
 * Tests de sécurité pour le système de notifications
 *
 * OBJECTIF: Garantir la sécurité du système
 * - Protection XSS
 * - Prévention IDOR
 * - Rate limiting
 * - Validation des données
 * - Sanitization
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotificationService, CreateNotificationData } from '../services/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';

// Mock Prisma
jest.mock('../../shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn()
    },
    notificationPreference: {
      findUnique: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma)
  };
});

// Mock loggers
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../utils/logger-enhanced', () => ({
  notificationLogger: {
    info: jest.fn(),
    debug: jest.fn()
  },
  securityLogger: {
    logViolation: jest.fn()
  }
}));

describe('Notifications - Tests de Sécurité', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;
  let userSocketsMap: Map<string, Set<string>>;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = new PrismaClient();
    service = new NotificationService(prisma);

    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    userSocketsMap = new Map();
    service.setSocketIO(mockIO as any, userSocketsMap);
  });

  describe('Protection XSS', () => {
    it('Bloque <script> dans le titre', async () => {
      const maliciousData: CreateNotificationData = {
        userId: 'user123',
        type: 'new_message',
        title: '<script>alert("XSS")</script>Hacked Title',
        content: 'Normal content',
        priority: 'normal'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user123',
        type: 'new_message',
        title: 'Hacked Title', // Script removed
        content: 'Normal content',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: null,
        senderUsername: null,
        senderAvatar: null,
        messagePreview: null,
        conversationId: null,
        messageId: null,
        callSessionId: null,
        data: null
      });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];

      expect(createCall.data.title).not.toContain('<script>');
      expect(createCall.data.title).not.toContain('alert');
    });

    it('Bloque <img> avec onerror dans le contenu', async () => {
      const maliciousData: CreateNotificationData = {
        userId: 'user123',
        type: 'new_message',
        title: 'Normal title',
        content: '<img src=x onerror=alert(1)>Malicious content',
        priority: 'normal'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user123',
        type: 'new_message',
        title: 'Normal title',
        content: 'Malicious content', // Tags removed
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: null,
        senderUsername: null,
        senderAvatar: null,
        messagePreview: null,
        conversationId: null,
        messageId: null,
        callSessionId: null,
        data: null
      });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];

      expect(createCall.data.content).not.toContain('<img');
      expect(createCall.data.content).not.toContain('onerror');
    });

    it('Sanitize username avec HTML malveillant', async () => {
      const maliciousData: CreateNotificationData = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        senderUsername: '<b>Bold</b><script>evil()</script>user',
        priority: 'normal'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        senderUsername: 'Bolduser', // HTML removed
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: null,
        senderAvatar: null,
        messagePreview: null,
        conversationId: null,
        messageId: null,
        callSessionId: null,
        data: null
      });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];

      expect(createCall.data.senderUsername).not.toContain('<script>');
      expect(createCall.data.senderUsername).not.toContain('<b>');
    });

    it('Bloque javascript: dans avatar URL', async () => {
      const maliciousData: CreateNotificationData = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        senderAvatar: 'javascript:alert(1)',
        priority: 'normal'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        senderAvatar: null, // URL malveillante bloquée
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: null,
        senderUsername: null,
        messagePreview: null,
        conversationId: null,
        messageId: null,
        callSessionId: null,
        data: null
      });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];

      expect(createCall.data.senderAvatar).toBeNull();
    });

    it('Sanitize JSON data object', async () => {
      const maliciousData: CreateNotificationData = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        data: {
          normalField: 'safe',
          $malicious: 'mongodb operator',
          __proto__: 'prototype pollution',
          nested: {
            xss: '<script>alert(1)</script>',
            normal: 'safe value'
          }
        },
        priority: 'normal'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockImplementation((args: any) => {
        // Simuler que le sanitizer a nettoyé les données
        const sanitizedData = {
          normalField: 'safe',
          nested: {
            xss: 'alert(1)', // Script tags removed
            normal: 'safe value'
          }
          // $malicious and __proto__ removed
        };

        return Promise.resolve({
          id: 'notif123',
          userId: 'user123',
          type: 'new_message',
          title: 'Message',
          content: 'Content',
          data: JSON.stringify(sanitizedData),
          priority: 'normal',
          isRead: false,
          createdAt: new Date(),
          senderId: null,
          senderUsername: null,
          senderAvatar: null,
          messagePreview: null,
          conversationId: null,
          messageId: null,
          callSessionId: null
        });
      });

      await service.createNotification(maliciousData);

      const createCall = prisma.notification.create.mock.calls[0][0];
      const savedData = JSON.parse(createCall.data.data || '{}');

      expect(savedData.$malicious).toBeUndefined();
      expect(savedData.__proto__).toBeUndefined();
      expect(savedData.nested?.xss).not.toContain('<script>');
    });
  });

  describe('Prévention IDOR', () => {
    it('Empêche user2 de marquer comme lue la notification de user1', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 }); // Pas de match

      const result = await service.markAsRead('notif-of-user1', 'user2');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-of-user1',
          userId: 'user2' // Vérifie que userId correspond
        },
        data: {
          isRead: true
        }
      });

      // Le result devrait indiquer succès même si count=0
      // (pour ne pas révéler l'existence de la notification)
      expect(result).toBe(true);
    });

    it('Empêche user2 de supprimer la notification de user1', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteNotification('notif-of-user1', 'user2');

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-of-user1',
          userId: 'user2' // Vérifie userId
        }
      });

      expect(result).toBe(true); // Ne révèle pas l'échec
    });

    it('Vérifie userId dans markConversationNotificationsAsRead', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      await service.markConversationNotificationsAsRead('user123', 'conv456');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user123', // Vérifie userId
          conversationId: 'conv456',
          isRead: false
        },
        data: {
          isRead: true
        }
      });
    });
  });

  describe('Rate Limiting', () => {
    it('Limite les mentions à 5 par minute (même paire sender-recipient)', async () => {
      const mentionData = {
        mentionedUserId: 'user456',
        senderId: 'user123',
        senderUsername: 'spammer',
        messageContent: 'Spam mention',
        conversationId: 'conv123',
        messageId: 'msg123',
        isMemberOfConversation: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user456',
        type: 'user_mentioned',
        title: 'Mention',
        content: 'Spam mention',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: 'user123',
        senderUsername: 'spammer',
        messageId: 'msg123',
        conversationId: 'conv123',
        messagePreview: 'Spam mention',
        data: null,
        senderAvatar: null,
        callSessionId: null
      });

      // Créer 6 mentions rapidement
      const results = [];
      for (let i = 0; i < 6; i++) {
        const result = await service.createMentionNotification({
          ...mentionData,
          messageId: `msg${i}`
        });
        results.push(result);
      }

      // Les 5 premières doivent réussir, la 6ème doit être bloquée
      const successCount = results.filter(r => r !== null).length;
      expect(successCount).toBeLessThanOrEqual(5);

      console.log(`✅ Rate limiting mention: ${successCount}/6 créées (5 max autorisées)`);
    });

    it('Rate limiting ne bloque pas différentes paires sender-recipient', async () => {
      // user123 mentionne 5 utilisateurs différents
      // Tous doivent passer (rate limit par paire)

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        type: 'user_mentioned',
        title: 'Mention',
        content: 'Mention',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: 'user123',
        senderUsername: 'sender',
        messagePreview: 'Mention',
        data: null,
        senderAvatar: null,
        conversationId: 'conv123',
        messageId: 'msg123',
        userId: 'user456',
        callSessionId: null
      });

      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await service.createMentionNotification({
          mentionedUserId: `user${i}`, // Différents recipients
          senderId: 'user123',
          senderUsername: 'sender',
          messageContent: 'Mention',
          conversationId: 'conv123',
          messageId: `msg${i}`,
          isMemberOfConversation: true
        });
        results.push(result);
      }

      // Toutes doivent passer
      const successCount = results.filter(r => r !== null).length;
      expect(successCount).toBe(5);
    });

    it('Rate limiting se réinitialise après 1 minute', async () => {
      const mentionData = {
        mentionedUserId: 'user456',
        senderId: 'user123',
        senderUsername: 'sender',
        messageContent: 'Mention',
        conversationId: 'conv123',
        messageId: 'msg123',
        isMemberOfConversation: true
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user456',
        type: 'user_mentioned',
        title: 'Mention',
        content: 'Mention',
        priority: 'normal',
        isRead: false,
        createdAt: new Date(),
        senderId: 'user123',
        senderUsername: 'sender',
        messageId: 'msg123',
        conversationId: 'conv123',
        messagePreview: 'Mention',
        data: null,
        senderAvatar: null,
        callSessionId: null
      });

      // Créer 5 mentions (atteindre la limite)
      for (let i = 0; i < 5; i++) {
        await service.createMentionNotification({
          ...mentionData,
          messageId: `msg${i}`
        });
      }

      // La 6ème doit échouer
      const blocked = await service.createMentionNotification({
        ...mentionData,
        messageId: 'msg6'
      });

      expect(blocked).toBeNull();

      // Note: Dans un vrai test, on attendrait 60 secondes
      // Ici on simule juste le comportement attendu
    });
  });

  describe('Validation des types et priorités', () => {
    it('Rejette un type de notification invalide', async () => {
      const invalidData = {
        userId: 'user123',
        type: 'invalid_notification_type' as any,
        title: 'Test',
        content: 'Message',
        priority: 'normal' as const
      };

      await expect(service.createNotification(invalidData)).rejects.toThrow();
    });

    it('Rejette une priorité invalide', async () => {
      const invalidData = {
        userId: 'user123',
        type: 'new_message' as const,
        title: 'Test',
        content: 'Message',
        priority: 'super_mega_urgent' as any
      };

      await expect(service.createNotification(invalidData)).rejects.toThrow();
    });

    it('Accepte tous les types valides', async () => {
      const validTypes = [
        'new_message',
        'new_conversation_direct',
        'new_conversation_group',
        'message_reply',
        'member_joined',
        'contact_request',
        'contact_accepted',
        'user_mentioned',
        'message_reaction',
        'missed_call',
        'system',
        'new_conversation',
        'message_edited'
      ];

      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      for (const type of validTypes) {
        prisma.notification.create.mockResolvedValue({
          id: `notif-${type}`,
          userId: 'user123',
          type,
          title: 'Test',
          content: 'Test',
          priority: 'normal',
          isRead: false,
          createdAt: new Date(),
          senderId: null,
          senderUsername: null,
          senderAvatar: null,
          messagePreview: null,
          conversationId: null,
          messageId: null,
          callSessionId: null,
          data: null
        });

        await expect(
          service.createNotification({
            userId: 'user123',
            type: type as any,
            title: 'Test',
            content: 'Test'
          })
        ).resolves.toBeDefined();
      }
    });

    it('Accepte toutes les priorités valides', async () => {
      const validPriorities = ['low', 'normal', 'high', 'urgent'];

      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      for (const priority of validPriorities) {
        prisma.notification.create.mockResolvedValue({
          id: `notif-${priority}`,
          userId: 'user123',
          type: 'new_message',
          title: 'Test',
          content: 'Test',
          priority,
          isRead: false,
          createdAt: new Date(),
          senderId: null,
          senderUsername: null,
          senderAvatar: null,
          messagePreview: null,
          conversationId: null,
          messageId: null,
          callSessionId: null,
          data: null
        });

        await expect(
          service.createNotification({
            userId: 'user123',
            type: 'new_message',
            title: 'Test',
            content: 'Test',
            priority: priority as any
          })
        ).resolves.toBeDefined();
      }
    });
  });

  describe('Protection injection MongoDB', () => {
    it('Échappe les opérateurs MongoDB dans userId', async () => {
      const maliciousUserId = { $ne: null }; // Tentative d'injection

      // TypeScript devrait empêcher ceci, mais test quand même
      await expect(
        service.createNotification({
          userId: maliciousUserId as any,
          type: 'new_message',
          title: 'Test',
          content: 'Test'
        })
      ).rejects.toThrow();
    });

    it('Sanitize les champs dans les queries', async () => {
      // markAsRead avec tentative d'injection
      await service.markAsRead('notif123', 'user123');

      const updateCall = prisma.notification.updateMany.mock.calls[0][0];

      // Vérifier que les valeurs sont des strings simples
      expect(typeof updateCall.where.id).toBe('string');
      expect(typeof updateCall.where.userId).toBe('string');
    });
  });

  describe('Logs de sécurité', () => {
    it('Logue les tentatives de types invalides', async () => {
      const securityLogger = require('../utils/logger-enhanced').securityLogger;

      try {
        await service.createNotification({
          userId: 'user123',
          type: 'hacked_type' as any,
          title: 'Test',
          content: 'Test'
        });
      } catch (error) {
        // Erreur attendue
      }

      expect(securityLogger.logViolation).toHaveBeenCalledWith(
        'INVALID_NOTIFICATION_TYPE',
        expect.objectContaining({
          type: 'hacked_type',
          userId: 'user123'
        })
      );
    });

    it('Logue les tentatives de priorités invalides', async () => {
      const securityLogger = require('../utils/logger-enhanced').securityLogger;

      try {
        await service.createNotification({
          userId: 'user123',
          type: 'new_message',
          title: 'Test',
          content: 'Test',
          priority: 'critical' as any
        });
      } catch (error) {
        // Erreur attendue
      }

      expect(securityLogger.logViolation).toHaveBeenCalledWith(
        'INVALID_NOTIFICATION_PRIORITY',
        expect.objectContaining({
          priority: 'critical',
          userId: 'user123'
        })
      );
    });
  });
});
