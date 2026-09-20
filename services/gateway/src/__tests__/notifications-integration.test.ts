/**
 * Tests d'intégration pour le système de notifications
 *
 * OBJECTIF: Vérifier que l'application fonctionne dans 2 scénarios:
 * 1. Sans Firebase configuré (WebSocket seulement)
 * 2. Avec Firebase configuré (WebSocket + Push notifications)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { NotificationService } from '../services/notifications/NotificationService';

// `CreateNotificationParams` n'a jamais été exporté par `NotificationService.ts`
// — c'est le seul TS2305 qui empêchait cette suite de se charger. Il vit dans
// `notifications/types.ts`, mais il y décrit une forme PLATE que
// `createNotification` n'accepte plus et qu'AUCUN appelant de production
// n'utilise. Les témoins se lient donc à la SIGNATURE : toute dérive future
// devient une erreur de compilation ici, au lieu d'un plantage à l'exécution.
type CreateNotificationParams = Parameters<NotificationService['createNotification']>[0];
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { Server as SocketIOServer } from 'socket.io';

jest.mock('@meeshy/shared/prisma/client', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@meeshy/shared/prisma/client');
  const mockPrisma = require('./helpers/notification-service-doubles').makeNotificationPrisma();
  return { ...actual, PrismaClient: jest.fn(() => mockPrisma) };
});

jest.mock('../utils/logger', () =>
  require('./helpers/notification-service-doubles').makeLoggerModule()
);

jest.mock('../utils/logger-enhanced', () =>
  require('./helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

describe('Notifications Integration - Sans Firebase', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;
  let userSocketsMap: Map<string, Set<string>>;
  let originalEnv: NodeJS.ProcessEnv;
  let errorLogs: string[];
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeAll(() => {
    // Sauvegarder l'environnement
    originalEnv = { ...process.env };

    // Supprimer les variables Firebase pour simuler l'absence de config
    delete process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  afterAll(() => {
    // Restaurer l'environnement
    process.env = originalEnv;
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Tracker les erreurs console
    errorLogs = [];
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      errorLogs.push(args.join(' '));
    });

    // Create new Prisma instance
    prisma = new PrismaClient();
    // `clearAllMocks` efface les APPELS, jamais les IMPLÉMENTATIONS : les
    // préférences « Ne Pas Déranger » posées par un témoin bloquaient tous les
    // suivants, qui accusaient alors la création de ne pas partir. L'état par
    // défaut — aucune préférence enregistrée — se repose ici, explicitement.
    prisma.userPreferences.findUnique.mockResolvedValue(null);

    // Create service
    service = new NotificationService(prisma);

    // Mock Socket.IO
    mockIO = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    userSocketsMap = new Map();

    // Initialize Socket.IO
    service.setSocketIO(mockIO as any, userSocketsMap);
  });

  describe('Serveur démarre sans Firebase', () => {
    it('Le service NotificationService s\'initialise sans erreur', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(NotificationService);
    });

    it('Socket.IO est correctement initialisé', () => {
      const newService = new NotificationService(prisma);
      const testIO = { to: jest.fn(), emit: jest.fn() };
      const testMap = new Map();

      expect(() => {
        newService.setSocketIO(testIO as any, testMap);
      }).not.toThrow();
    });

    it('Aucune erreur Firebase dans les logs', () => {
      // Créer une notification
      const notifData: CreateNotificationParams = {
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Test message'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        ...notifData,
        isRead: false,
        createdAt: new Date()
      });

      service.createNotification(notifData);

      // Vérifier qu'aucune erreur Firebase n'est loguée
      const firebaseErrors = errorLogs.filter(log =>
        log.toLowerCase().includes('firebase') &&
        log.toLowerCase().includes('error')
      );
      expect(firebaseErrors).toHaveLength(0);
    });
  });

  describe('NotificationService fonctionne sans Firebase', () => {
    it('Crée une notification avec succès', async () => {
      const notifData: CreateNotificationParams = {
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Nouveau message',
        content: 'Vous avez un nouveau message',
        priority: 'normal'
      };

      const mockNotification = {
        id: 'notif123',
        userId: 'user123',
        type: 'new_message',
        title: 'Nouveau message',
        content: 'Vous avez un nouveau message',
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
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.createNotification(notifData);

      expect(result).toBeDefined();
      expect(result?.id).toBe('notif123');
      expect(result?.type).toBe('new_message');
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    });

    it('Crée une notification de message avec détails', async () => {
      const messageNotifData = {
        recipientId: 'user456',
        senderId: 'user123',
        messagePreview: 'Salut, comment ça va ?',
        conversationId: 'conv123',
        messageId: 'msg123'
      };

      // `createMessageNotification` relit le message pour savoir s'il est
      // encore VIVANT (supprimé / échu ⇒ aucune bannière). Sans ce double, elle
      // le juge disparu et rend `null` — et `expect(null).toBeDefined()` PASSE,
      // ce qui rendait l'échec muet une assertion plus loin.
      prisma.message.findUnique.mockResolvedValue({
        deletedAt: null, expiresAt: null, createdAt: new Date(),
        messageType: 'text', translations: [], originalLanguage: 'fr'
      });
      prisma.user.findUnique.mockResolvedValue({ username: 'testuser', displayName: 'Test User', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv123', title: 'testuser', type: 'direct', avatar: null, participants: [] });
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        userId: 'user456',
        type: 'new_message',
        title: 'Nouveau message de testuser',
        content: 'Salut, comment ça va ?',
        priority: 'normal',
        isRead: false,
        createdAt: new Date()
      });

      const result = await service.createMessageNotification(messageNotifData);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user456');
      // L'identité de l'expéditeur ne voyage plus à plat (`senderId`) : elle
      // est dans `actor`, et le CONTEXTE porte la conversation et le message.
      // On le vérifie sur ce qui est ÉCRIT — ce que rend le double, c'est le
      // double qui le décide.
      const createArg = prisma.notification.create.mock.calls[0][0];
      expect(createArg.data.actor.id).toBe('user123');
      expect(createArg.data.context.conversationId).toBe('conv123');
      expect(createArg.data.context.messageId).toBe('msg123');
    });

    it('Marque une notification comme lue', async () => {
      // `markAsRead` adresse la ligne par son id : c'est un `update` unitaire
      // dont le `where` porte l'appelant, et il rend la notification formatée
      // (ou `null`), plus un booléen.
      prisma.notification.update.mockResolvedValue({
        id: 'notif123', userId: 'user123', type: 'new_message',
        title: 'T', content: 'C', priority: 'normal',
        isRead: true, readAt: new Date(), createdAt: new Date()
      });

      const result = await service.markAsRead('notif123', 'user123');

      expect(result).not.toBeNull();
      expect(result?.state.isRead).toBe(true);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: {
          id: 'notif123',
          userId: 'user123'
        },
        data: {
          isRead: true,
          readAt: expect.any(Date)
        }
      });
    });

    it('Récupère le nombre de notifications non lues', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const count = await service.getUnreadCount('user123');

      expect(count).toBe(5);
      // Le compte ne porte QUE les notifications encore visibles : une ligne
      // échue ne compte plus. Ce filtre d'expiration est venu après le témoin,
      // qui attendait le `where` d'avant.
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user123',
          isRead: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) } }
          ]
        })
      });
    });

    it('Supprime une notification', async () => {
      // La suppression est gardée par une RELECTURE portée par `userId` : si
      // elle ne rend rien, le `delete` ne part pas. `deleteMany` n'est plus le
      // chemin.
      prisma.notification.findUnique.mockResolvedValue({
        userId: 'user123', type: 'new_message', context: {}, delivery: {}
      });
      prisma.notification.delete.mockResolvedValue({ id: 'notif123' });

      const result = await service.deleteNotification('notif123', 'user123');

      expect(result).toBe(true);
      expect(prisma.notification.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'notif123', userId: 'user123' } })
      );
      expect(prisma.notification.delete).toHaveBeenCalledWith({ where: { id: 'notif123' } });
    });
  });

  describe('WebSocket notifications fonctionnent sans Firebase', () => {
    it('Émet une notification via WebSocket quand l\'utilisateur est connecté', async () => {
      const notifData: CreateNotificationParams = {
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test WebSocket',
        content: 'Message de test'
      };

      const mockNotification = {
        id: 'notif123',
        userId: 'user123',
        type: 'new_message',
        title: 'Test WebSocket',
        content: 'Message de test',
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
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue(mockNotification);

      // Utilisateur connecté avec 2 sockets
      userSocketsMap.set('user123', new Set(['socket1', 'socket2']));

      await service.createNotification(notifData);

      // V2 : une émission user-scoped vise la ROOM `user:<id>`, et Socket.IO
      // sert les N appareils. Viser les sockets un par un était la forme
      // d'avant — la reproduire serait un défaut, pas la preuve attendue.
      expect(mockIO.to).toHaveBeenCalledWith('user:user123');
      const nouvelles = mockIO.emit.mock.calls.filter((c: unknown[]) => c[0] === 'notification:new');
      expect(nouvelles).toHaveLength(1);
      // L'événement s'appelle `notification:new` (convention `entité:action`),
      // plus `notification`.
      expect(nouvelles[0][1]).toEqual(expect.objectContaining({
        id: 'notif123',
        type: 'new_message',
        title: 'Test WebSocket'
      }));
    });

    it('Gère gracieusement les utilisateurs hors ligne', async () => {
      const notifData: CreateNotificationParams = {
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test offline',
        content: 'Message de test'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        ...notifData,
        isRead: false,
        createdAt: new Date()
      });

      // Utilisateur hors ligne (pas de sockets)
      const result = await service.createNotification(notifData);

      // La notification est créée, et l'émission part quand même : viser la
      // room d'un absent est un no-op côté Socket.IO. Ce que le témoin doit
      // garantir est que l'ABSENCE ne fait rien échouer — pas qu'on renonce à
      // émettre, ce qui obligerait à tenir un registre de présence ici.
      expect(result).not.toBeNull();
      expect(mockIO.to).toHaveBeenCalledWith('user:user123');
    });

    it('Émet à plusieurs utilisateurs simultanément', async () => {
      // Créer des notifications pour 3 utilisateurs
      const users = ['user1', 'user2', 'user3'];

      // Connecter chaque utilisateur
      users.forEach((userId, index) => {
        userSocketsMap.set(userId, new Set([`socket${index}`]));
      });

      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      const promises = users.map((userId, index) => {
        prisma.notification.create.mockResolvedValue({
          id: `notif${index}`,
          userId,
          type: 'new_message',
          title: `Message ${index}`,
          content: `Content ${index}`,
          priority: 'normal',
          isRead: false,
          createdAt: new Date()
        });

        return service.createNotification({
          priority: 'normal',
          context: {},
          metadata: {},
          userId,
          type: 'new_message',
          title: `Message ${index}`,
          content: `Content ${index}`
        });
      });

      await Promise.all(promises);

      // Compter les APPELS confond deux événements : `notification:new` et
      // `notification:counts` partent par notification.
      const nouvelles = mockIO.emit.mock.calls.filter((c: unknown[]) => c[0] === 'notification:new');
      expect(nouvelles).toHaveLength(3);
    });
  });

  describe('Préférences utilisateur sans Firebase', () => {
    it('Respecte Do Not Disturb', async () => {
      const preferences = {
        userId: 'user123',
        dndEnabled: true,
        dndStartTime: '00:00',
        dndEndTime: '23:59',
        newMessageEnabled: true,
        replyEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        missedCallEnabled: true,
        systemEnabled: true,
        conversationEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: true
      };

      // Les préférences ne vivent plus dans une table `notificationPreference` :
      // elles sont un objet sur `userPreferences.notification`. Doubler
      // l'ancien modèle ne montait RIEN — la lecture rendait `undefined`, donc
      // les défauts, donc « tout autorisé », et le témoin accusait la règle.
      prisma.userPreferences.findUnique.mockResolvedValue({ notification: preferences });

      const result = await service.createNotification({
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test DND',
        content: 'Message'
      });

      // La notification ne doit pas être créée
      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('Respecte les préférences par type de notification', async () => {
      const preferences = {
        userId: 'user123',
        dndEnabled: false,
        newMessageEnabled: false, // Messages désactivés
        replyEnabled: true,
        mentionEnabled: true,
        reactionEnabled: true,
        missedCallEnabled: true,
        systemEnabled: true,
        conversationEnabled: true,
        contactRequestEnabled: true,
        memberJoinedEnabled: true
      };

      // Les préférences ne vivent plus dans une table `notificationPreference` :
      // elles sont un objet sur `userPreferences.notification`. Doubler
      // l'ancien modèle ne montait RIEN — la lecture rendait `undefined`, donc
      // les défauts, donc « tout autorisé », et le témoin accusait la règle.
      prisma.userPreferences.findUnique.mockResolvedValue({ notification: preferences });

      const result = await service.createNotification({
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Message'
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('Gestion des erreurs sans Firebase', () => {
    it('Gère les erreurs de base de données', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockRejectedValue(new Error('Database connection error'));

      const result = await service.createNotification({
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Message'
      });

      expect(result).toBeNull();
    });

    it('Continue de fonctionner après une erreur Socket.IO', async () => {
      const notifData: CreateNotificationParams = {
        priority: 'normal',
        context: {},
        metadata: {},
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Message'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notification.create.mockResolvedValue({
        id: 'notif123',
        ...notifData,
        isRead: false,
        createdAt: new Date()
      });

      // Simuler une erreur Socket.IO
      mockIO.emit.mockImplementation(() => {
        throw new Error('Socket.IO error');
      });

      userSocketsMap.set('user123', new Set(['socket1']));

      // La notification doit quand même être créée
      const result = await service.createNotification(notifData);

      expect(result).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('Performance sans Firebase', () => {
    it('Crée des notifications en batch efficacement', async () => {
      const mentionedUserIds = ['user1', 'user2', 'user3', 'user4', 'user5'];
      const commonData = {
        senderId: 'sender123',
        // Le LOT prend `messageContent` — c'est lui qui le renomme en
        // `messagePreview` pour l'appel unitaire (`:1894`). Les deux noms ne
        // sont pas interchangeables selon le point d'entrée.
        messageContent: 'Hey everyone!',
        conversationId: 'conv123',
        messageId: 'msg123',
        attachments: []
      };
      const memberIds = mentionedUserIds;

      prisma.user.findUnique.mockResolvedValue({ username: 'sender', displayName: 'Sender', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv123', title: 'Test Group', type: 'group', avatar: null, participants: [] });
      prisma.notification.create.mockImplementation((args: any) =>
        Promise.resolve({ id: `notif-${args.data.userId}`, ...args.data, isRead: false, createdAt: new Date() })
      );
      prisma.notification.createMany.mockResolvedValue({ count: 5 });
      prisma.notification.findMany.mockResolvedValue(
        mentionedUserIds.map((userId, index) => ({
          id: `notif${index}`,
          userId,
          type: 'user_mentioned',
          title: 'Mention',
          content: 'Content',
          priority: 'normal',
          isRead: false,
          createdAt: new Date(),
          senderId: 'sender123',
          senderUsername: 'sender',
          messageId: 'msg123',
          conversationId: 'conv123',
          data: JSON.stringify({ isMember: true })
        }))
      );

      const startTime = Date.now();
      const count = await service.createMentionNotificationsBatch(
        mentionedUserIds,
        commonData,
        memberIds
      );
      const duration = Date.now() - startTime;

      expect(count).toBe(5);
      // MESURE, pas aspiration : `createMentionNotificationsBatch` écrit une
      // ligne PAR destinataire et n'a jamais appelé `createMany`. L'écart est
      // porté par #7156 — c'est CE témoin qui rougira quand il sera livré.
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
      expect(prisma.notification.create).toHaveBeenCalledTimes(5);
      expect(duration).toBeLessThan(100); // Rapide
    });

    it('Gère un grand nombre de notifications concurrentes', async () => {
      const notificationCount = 100;

      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      const promises = Array.from({ length: notificationCount }, (_, i) => {
        prisma.notification.create.mockResolvedValue({
          id: `notif${i}`,
          userId: `user${i}`,
          type: 'new_message',
          title: `Message ${i}`,
          content: `Content ${i}`,
          priority: 'normal',
          isRead: false,
          createdAt: new Date()
        });

        return service.createNotification({
          priority: 'normal',
          context: {},
          metadata: {},
          userId: `user${i}`,
          type: 'new_message',
          title: `Message ${i}`,
          content: `Content ${i}`
        });
      });

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      const successCount = results.filter(r => r !== null).length;
      expect(successCount).toBe(notificationCount);
      expect(duration).toBeLessThan(5000); // < 5 secondes pour 100 notifications
    });
  });
});
