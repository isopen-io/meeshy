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
import { NotificationService, CreateNotificationData } from '../services/notifications/NotificationService';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { Server as SocketIOServer } from 'socket.io';

// Mock Prisma
jest.mock('../../shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      createMany: jest.fn()
    },
    notificationPreference: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
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
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  securityLogger: {
    logViolation: jest.fn(),
    logAttempt: jest.fn(),
    logSuccess: jest.fn()
  }
}));

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
      const notifData: CreateNotificationData = {
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
      const notifData: CreateNotificationData = {
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
        senderUsername: 'testuser',
        senderAvatar: 'https://example.com/avatar.png',
        messageContent: 'Salut, comment ça va ?',
        conversationId: 'conv123',
        messageId: 'msg123',
        conversationIdentifier: 'direct_user123_user456',
        conversationType: 'direct',
        conversationTitle: 'testuser'
      };

      prisma.notificationPreference.findUnique.mockResolvedValue(null);
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

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user456');
      expect(result?.senderId).toBeDefined();
    });

    it('Marque une notification comme lue', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead('notif123', 'user123');

      expect(result).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif123',
          userId: 'user123'
        },
        data: {
          isRead: true
        }
      });
    });

    it('Récupère le nombre de notifications non lues', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const count = await service.getUnreadCount('user123');

      expect(count).toBe(5);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user123',
          isRead: false
        }
      });
    });

    it('Supprime une notification', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteNotification('notif123', 'user123');

      expect(result).toBe(true);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'notif123',
          userId: 'user123'
        }
      });
    });
  });

  describe('WebSocket notifications fonctionnent sans Firebase', () => {
    it('Émet une notification via WebSocket quand l\'utilisateur est connecté', async () => {
      const notifData: CreateNotificationData = {
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

      // Vérifier que la notification est émise aux 2 sockets
      expect(mockIO.to).toHaveBeenCalledWith('socket1');
      expect(mockIO.to).toHaveBeenCalledWith('socket2');
      expect(mockIO.emit).toHaveBeenCalledTimes(2);
      expect(mockIO.emit).toHaveBeenCalledWith('notification', expect.objectContaining({
        id: 'notif123',
        type: 'new_message',
        title: 'Test WebSocket'
      }));
    });

    it('Gère gracieusement les utilisateurs hors ligne', async () => {
      const notifData: CreateNotificationData = {
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

      // La notification est créée mais pas émise
      expect(result).toBeDefined();
      expect(mockIO.to).not.toHaveBeenCalled();
      expect(mockIO.emit).not.toHaveBeenCalled();
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
          userId,
          type: 'new_message',
          title: `Message ${index}`,
          content: `Content ${index}`
        });
      });

      await Promise.all(promises);

      // Chaque utilisateur doit avoir reçu sa notification
      expect(mockIO.emit).toHaveBeenCalledTimes(3);
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

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification({
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

      prisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await service.createNotification({
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
        userId: 'user123',
        type: 'new_message',
        title: 'Test',
        content: 'Message'
      });

      expect(result).toBeNull();
    });

    it('Continue de fonctionner après une erreur Socket.IO', async () => {
      const notifData: CreateNotificationData = {
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
        senderUsername: 'sender',
        messageContent: 'Hey everyone!',
        conversationId: 'conv123',
        conversationTitle: 'Test Group',
        messageId: 'msg123',
        attachments: []
      };
      const memberIds = mentionedUserIds;

      prisma.notificationPreference.findUnique.mockResolvedValue({ mentionEnabled: true });
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
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1); // Une seule query
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
