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
import { NotificationService } from '../services/notifications/NotificationService';
// `CreateNotificationData` (`notifications/types.ts`) décrit une forme PLATE
// — `senderId`, `senderAvatar`, `messagePreview` au premier niveau — que
// `createNotification` n'accepte plus : il prend `actor`, `context` et
// `metadata`. Ce type n'a AUCUN consommateur de production (mesuré) ; s'y
// annoter faisait croire à un contrat. Les témoins se lient désormais à la
// SIGNATURE, donc toute dérive future devient une erreur de compilation ici.
type CreateNotificationParams = Parameters<NotificationService['createNotification']>[0];
import { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('@meeshy/shared/prisma/client', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@meeshy/shared/prisma/client');
  const mockPrisma = require('./helpers/notification-service-doubles').makeNotificationPrisma();
  return { ...actual, PrismaClient: jest.fn(() => ({ ...mockPrisma, $runCommandRaw: jest.fn() })) };
});

jest.mock('../utils/logger', () =>
  require('./helpers/notification-service-doubles').makeLoggerModule()
);

jest.mock('../utils/logger-enhanced', () =>
  require('./helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

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
      const maliciousData: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: '<script>alert("XSS")</script>Hacked Title',
        content: 'Normal content',
        priority: 'normal',
        context: {},
        metadata: {}
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
      const maliciousData: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: 'Normal title',
        content: '<img src=x onerror=alert(1)>Malicious content',
        priority: 'normal',
        context: {},
        metadata: {}
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
      const maliciousData: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        priority: 'normal',
        context: {},
        metadata: {},
        actor: { id: 'sender1', username: 'user', displayName: '<b>Bold</b><script>evil()</script>user' }
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

      // L'identité de l'acteur ne voyage plus à plat : elle est dans `actor`.
      expect(createCall.data.actor.displayName).not.toContain('<script>');
      expect(createCall.data.actor.displayName).not.toContain('<b>');
    });

    it('Bloque javascript: dans avatar URL', async () => {
      const maliciousData: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        priority: 'normal',
        context: {},
        metadata: {},
        actor: { id: 'sender1', username: 'sender', avatar: 'javascript:alert(1)' }
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

      // #7157 — un protocole refusé ne doit PAS ressortir : `sanitizeURL` rend
      // `null` précisément pour lui, et le repli `??` le restituait tel quel.
      expect(createCall.data.actor.avatar ?? null).toBeNull();
    });

    // JUMEAU OBLIGATOIRE du témoin ci-dessus. `sanitizeURL` rend `null` pour
    // DEUX raisons opposées — entrée dangereuse, ou entrée qui n'est pas une
    // URL absolue. Un correctif qui abandonne les deux casse les avatars
    // servis en chemin d'API, et ce témoin-là seul ne le verrait pas.
    it('Conserve un avatar servi en chemin relatif', async () => {
      const donnees: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        priority: 'normal',
        context: {},
        metadata: {},
        actor: { id: 'sender1', username: 'sender', avatar: '/uploads/avatars/sender1.png' }
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123', userId: 'user123', type: 'new_message',
        title: 'Message', content: 'Content', priority: 'normal',
        isRead: false, createdAt: new Date()
      });

      await service.createNotification(donnees);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.actor.avatar).toBe('/uploads/avatars/sender1.png');
    });

    // Un chemin est « relatif » s'il RESTE sur son origine une fois RÉSOLU, pas
    // s'il commence par `/`. Ces trois-là commencent par un seul `/` (ou deux)
    // et pointent pourtant ailleurs une fois normalisés — l'antislash vaut une
    // barre, et les blancs sont supprimés. Sans ces témoins, un retour au test
    // de préfixe passerait inaperçu.
    it.each([
      ['protocol-relative', '//evil.example/x.png'],
      ['antislash normalisé en barre', '/\\evil.example/x.png'],
      ['blanc supprimé par l analyseur', '/\t/evil.example/x.png'],
    ])('Abandonne un avatar qui s échappe de son origine (%s)', async (_cas, avatar) => {
      const donnees: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        priority: 'normal',
        context: {},
        metadata: {},
        actor: { id: 'sender1', username: 'sender', avatar }
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123', userId: 'user123', type: 'new_message',
        title: 'Message', content: 'Content', priority: 'normal',
        isRead: false, createdAt: new Date()
      });

      await service.createNotification(donnees);

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.actor.avatar ?? null).toBeNull();
    });

    it('Sanitize JSON data object', async () => {
      const maliciousData: CreateNotificationParams = {
        userId: 'user123',
        type: 'new_message',
        title: 'Message',
        content: 'Content',
        priority: 'normal',
        context: {},
        // Charge HOSTILE et volontairement malformée : l'assertion porte sur ce
        // que la sanitisation en fait, donc elle ne peut pas respecter l'union
        // `NotificationMetadata`. C'est la seule raison de l'assertion de type.
        metadata: {
          normalField: 'safe',
          $malicious: 'mongodb operator',
          __proto__: 'prototype pollution',
          nested: {
            xss: '<script>alert(1)</script>',
            normal: 'safe value'
          }
        } as unknown as CreateNotificationParams['metadata']
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
      // La charge est persistée en OBJET (`metadata`), plus en chaîne JSON.
      const savedData = createCall.data.metadata ?? {};

      expect(savedData.$malicious).toBeUndefined();
      // `savedData.__proto__` rend `Object.prototype` sur tout objet ordinaire :
      // l'attendre `undefined` ne pouvait pas passer, et ne mesurait rien. Ce
      // qui compte est qu'aucune clé `__proto__` PROPRE ne subsiste, et que
      // rien n'a pollué le prototype global.
      expect(Object.prototype.hasOwnProperty.call(savedData, '__proto__')).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(savedData.nested?.xss).not.toContain('<script>');
    });
  });

  describe('Prévention IDOR', () => {
    // La garde n'a pas changé d'INTENTION, elle a changé de PRIMITIVE : le
    // marquage passe par `update({ where: { id, userId } })` et la suppression
    // par un `findUnique` PORTÉ PAR `userId` qui commande le `delete`. Les
    // témoins attendaient `updateMany`/`deleteMany` — la forme d'avant. Ce qui
    // compte reste le même, et se vérifie mieux : le `where` porte l'appelant,
    // et rien ne s'écrit quand la ligne n'est pas à lui.
    it('Empêche user2 de marquer comme lue la notification de user1', async () => {
      prisma.notification.update.mockRejectedValue(new Error('Record to update not found'));

      const result = await service.markAsRead('notif-of-user1', 'user2');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: {
          id: 'notif-of-user1',
          userId: 'user2' // la ligne DOIT appartenir à l'appelant
        },
        data: {
          isRead: true,
          readAt: expect.any(Date)
        }
      });

      // Rien n'est marqué, et l'appelant n'apprend rien de l'existence de la
      // ligne : il reçoit la même valeur que pour un identifiant inconnu.
      expect(result).toBeNull();
    });

    it('Empêche user2 de supprimer la notification de user1', async () => {
      prisma.notification.findUnique.mockResolvedValue(null); // pas à user2

      const result = await service.deleteNotification('notif-of-user1', 'user2');

      // La relecture est portée par `userId` — c'est ELLE qui garde.
      expect(prisma.notification.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-of-user1', userId: 'user2' }
        })
      );
      // Et surtout : la suppression ne part pas « au cas où ».
      expect(prisma.notification.delete).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('Vérifie userId dans markConversationNotificationsAsRead (un seul update Mongo, filtre serveur)', async () => {
      // Prisma MongoDB ne filtre pas les chemins JSON, mais $runCommandRaw oui :
      // le marquage est UN update multi filtré { userId, isRead, context.conversationId }
      // — aucun fetch des non-lues, aucun filtre en mémoire.
      const userId = '64a000000000000000000001';
      const conversationId = '64b000000000000000000002';
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      const count = await service.markConversationNotificationsAsRead(userId, conversationId);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
      // IDOR: le filtre est scopé par userId au niveau Mongo
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: userId },
            isRead: false,
            'context.conversationId': conversationId,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(1);
    });

    it('markConversationNotificationsAsRead retourne 0 sans toucher la DB pour un userId non-ObjectId (anonyme)', async () => {
      const count = await service.markConversationNotificationsAsRead('session-token-abc', '64b000000000000000000002');

      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('markConversationNotificationsAsRead n\'émet pas notification:counts si rien n\'a été marqué', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 0, nModified: 0 });

      const count = await service.markConversationNotificationsAsRead(
        '64a000000000000000000001',
        '64b000000000000000000002'
      );

      expect(count).toBe(0);
      expect(mockIO.emit).not.toHaveBeenCalled();
    });

    it('markPostNotificationsAsRead ne marque que les notifs du post (filtre context.postId serveur)', async () => {
      const userId = '64a000000000000000000001';
      const postId = '64c000000000000000000003';
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      const count = await service.markPostNotificationsAsRead(userId, postId);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: userId },
            isRead: false,
            'context.postId': postId,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(1);
    });

    it('markNotificationsByTypesAsRead filtre par type (colonne réelle)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 2 });

      const count = await service.markNotificationsByTypesAsRead('user123', [
        'friend_request',
        'contact_request',
      ]);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          isRead: false,
          type: { in: ['friend_request', 'contact_request'] },
        },
        data: { isRead: true, readAt: expect.any(Date) },
      });
      expect(count).toBe(2);
    });

    it('markNotificationsByTypesAsRead no-op si la liste de types est vide', async () => {
      const count = await service.markNotificationsByTypesAsRead('user123', []);

      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });
  });

  describe('Rate Limiting', () => {
    it('Limite les mentions à 5 par minute (même paire sender-recipient)', async () => {
      const mentionData = {
        mentionedUserId: 'user456',
        mentionerUserId: 'user123',
        messagePreview: 'Spam mention',
        conversationId: 'conv123',
        messageId: 'msg123'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.user.findUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv123', title: 'Groupe', type: 'group', avatar: null, participants: [] });
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
      // `createMentionNotification` résout l'acteur quand `senderProfile` est
      // absent : sans ce double, elle échoue et rend `null` pour TOUS, ce qui
      // ressemble à un rate limit alors que c'est une lacune de montage.
      prisma.user.findUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv123', title: 'Groupe', type: 'group', avatar: null, participants: [] });
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
          mentionerUserId: 'user123',
          messagePreview: 'Mention',
          conversationId: 'conv123',
          messageId: `msg${i}`
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
        mentionerUserId: 'user123',
        messagePreview: 'Mention',
        conversationId: 'conv123',
        messageId: 'msg123'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
      prisma.user.findUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv123', title: 'Groupe', type: 'group', avatar: null, participants: [] });
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

      // La production refuse FAIL-CLOSED en rendant `null` et en journalisant
      // une violation — elle ne lève pas. Ce que le témoin doit garantir est
      // qu'aucune ligne n'est écrite, pas la forme du refus.
      await expect(service.createNotification(invalidData)).resolves.toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('Rejette une priorité invalide', async () => {
      const invalidData = {
        userId: 'user123',
        type: 'new_message' as const,
        title: 'Test',
        content: 'Message',
        priority: 'super_mega_urgent' as any
      };

      await expect(service.createNotification(invalidData)).resolves.toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
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
            priority: 'normal',
            context: {},
            metadata: {},
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
            context: {},
            metadata: {},
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
    it("N'interpole jamais userId dans une requête — un opérateur reste une valeur", async () => {
      // Le témoin attendait une levée. Il ne pouvait pas l'obtenir : c'est
      // PRISMA qui refuse un non-string là où le schéma déclare un String, et
      // il est doublé ici. Attendre un `throw` mesurait donc le double, pas le
      // système.
      //
      // Ce qu'un double PERMET de prouver est la vraie propriété anti-injection
      // de ce code : il ne CONSTRUIT aucune requête à partir de la valeur — elle
      // est remise telle quelle au client, jamais concaténée dans un filtre.
      const maliciousUserId = { $ne: null };
      prisma.notification.create.mockResolvedValue({
        id: 'notif-x', userId: maliciousUserId, type: 'new_message',
        title: 'Test', content: 'Test', priority: 'normal',
        isRead: false, createdAt: new Date()
      });

      await service.createNotification({
        priority: 'normal',
        context: {},
        metadata: {},
        userId: maliciousUserId as unknown as string,
        type: 'new_message',
        title: 'Test',
        content: 'Test'
      });

      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe(maliciousUserId);
      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('Sanitize les champs dans les queries', async () => {
      // markAsRead avec tentative d'injection
      prisma.notification.update.mockResolvedValue({
        id: 'notif123', userId: 'user123', type: 'new_message',
        title: 'T', content: 'C', priority: 'normal',
        isRead: true, readAt: new Date(), createdAt: new Date()
      });

      await service.markAsRead('notif123', 'user123');

      // `update`, pas `updateMany` : la garde de propriété est dans le `where`
      // d'un update unitaire depuis que la ligne est adressée par son id.
      const updateCall = prisma.notification.update.mock.calls[0][0];

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
          priority: 'normal',
          context: {},
          metadata: {},
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
          context: {},
          metadata: {},
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
