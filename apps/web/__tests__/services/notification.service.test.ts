/**
 * Tests pour NotificationService - Structure Groupée V2
 * Valide le parsing simplifié et la gestion des nouvelles structures
 */

import { NotificationService } from '@/services/notification.service';
import { apiService } from '@/services/api.service';
import { NotificationTypeEnum } from '@/types/notification';

// Mock apiService
jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('NotificationService - Structure Groupée V2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseNotification - Structure Groupée', () => {
    it('devrait parser une notification avec structure groupée complète', async () => {
      const rawNotification = {
        id: 'notif_message_123',
        userId: 'user_recipient',
        type: NotificationTypeEnum.NEW_MESSAGE,
        priority: 'normal',
        content: 'Alice Martin: Hey comment ça va?',

        // ACTOR - Qui a déclenché
        actor: {
          id: 'user_sender',
          username: 'alice',
          displayName: 'Alice Martin',
          avatar: 'https://cdn.example.com/alice.jpg',
        },

        // CONTEXT - Où c'est arrivé
        context: {
          conversationId: 'conv_direct_123',
          conversationTitle: 'Conversation avec Alice',
          conversationType: 'direct',
          messageId: 'msg_123',
        },

        // METADATA - Données type-spécifiques
        metadata: {
          messagePreview: 'Hey comment ça va?',
          action: 'view_message',
        },

        // STATE - Statut lecture
        // IMPORTANT: Le backend envoie isRead, readAt, createdAt à la racine (pas dans state)
        // car ces champs sont à la racine dans le schema Prisma pour performance des indexes
        isRead: false,
        readAt: null,
        createdAt: '2024-01-15T10:30:00Z',
        expiresAt: null,

        // DELIVERY - Suivi multi-canal
        delivery: {
          emailSent: false,
          pushSent: true,
        },
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [rawNotification],
          pagination: {
            offset: 0,
            limit: 50,
            total: 1,
            hasMore: false,
          },
          unreadCount: 1,
        },
      });

      const response = await NotificationService.fetchNotifications();

      expect(response.data?.notifications).toHaveLength(1);

      const notification = response.data!.notifications[0];

      // CORE
      expect(notification.id).toBe('notif_message_123');
      expect(notification.userId).toBe('user_recipient');
      expect(notification.type).toBe(NotificationTypeEnum.NEW_MESSAGE);
      expect(notification.priority).toBe('normal');

      // CONTENT
      expect(notification.content).toBe('Alice Martin: Hey comment ça va?');

      // ACTOR (groupé)
      expect(notification.actor).toEqual({
        id: 'user_sender',
        username: 'alice',
        displayName: 'Alice Martin',
        avatar: 'https://cdn.example.com/alice.jpg',
      });

      // CONTEXT (groupé)
      expect(notification.context).toEqual({
        conversationId: 'conv_direct_123',
        conversationTitle: 'Conversation avec Alice',
        conversationType: 'direct',
        messageId: 'msg_123',
      });

      // METADATA (groupé)
      expect(notification.metadata).toEqual({
        messagePreview: 'Hey comment ça va?',
        action: 'view_message',
      });

      // STATE (groupé)
      expect(notification.state.isRead).toBe(false);
      expect(notification.state.readAt).toBeNull();
      expect(notification.state.createdAt).toBeInstanceOf(Date);
      expect(notification.state.expiresAt).toBeUndefined();

      // DELIVERY (groupé)
      expect(notification.delivery).toEqual({
        emailSent: false,
        pushSent: true,
      });
    });

    it('devrait gérer les champs optionnels manquants', async () => {
      const minimalNotification = {
        id: 'notif_minimal',
        userId: 'user_123',
        type: NotificationTypeEnum.SYSTEM_ANNOUNCEMENT,
        content: 'System message',
        // Le backend envoie les champs à la racine
        isRead: false,
        createdAt: '2024-01-15T10:30:00Z',
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [minimalNotification],
          pagination: {
            offset: 0,
            limit: 50,
            total: 1,
            hasMore: false,
          },
          unreadCount: 1,
        },
      });

      const response = await NotificationService.fetchNotifications();
      const notification = response.data!.notifications[0];

      // Champs par défaut
      expect(notification.priority).toBe('normal');
      expect(notification.actor).toBeUndefined();
      expect(notification.context).toEqual({});
      expect(notification.metadata).toEqual({});
      expect(notification.delivery).toEqual({ emailSent: false, pushSent: false });
    });

    it('devrait parser correctement les dates dans state', async () => {
      const notificationWithDates = {
        id: 'notif_dates',
        userId: 'user_123',
        type: NotificationTypeEnum.NEW_MESSAGE,
        content: 'Test message',
        // IMPORTANT: Le backend envoie isRead, readAt, createdAt à la racine (pas dans state)
        // car ces champs sont à la racine dans le schema Prisma pour performance des indexes
        isRead: true,
        readAt: '2024-01-15T11:00:00Z',
        createdAt: '2024-01-15T10:30:00Z',
        expiresAt: '2024-02-15T10:30:00Z',
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [notificationWithDates],
          pagination: {
            offset: 0,
            limit: 50,
            total: 1,
            hasMore: false,
          },
          unreadCount: 0,
        },
      });

      const response = await NotificationService.fetchNotifications();
      const notification = response.data!.notifications[0];

      expect(notification.state.createdAt).toBeInstanceOf(Date);
      expect(notification.state.createdAt.toISOString()).toBe('2024-01-15T10:30:00.000Z');

      expect(notification.state.readAt).toBeInstanceOf(Date);
      expect(notification.state.readAt!.toISOString()).toBe('2024-01-15T11:00:00.000Z');

      expect(notification.state.expiresAt).toBeInstanceOf(Date);
      expect(notification.state.expiresAt!.toISOString()).toBe('2024-02-15T10:30:00.000Z');
    });

    it('devrait gérer la rétrocompatibilité avec les champs à la racine (legacy)', async () => {
      // Si le backend envoie encore certains champs à la racine
      const legacyNotification = {
        id: 'notif_legacy',
        userId: 'user_123',
        type: NotificationTypeEnum.NEW_MESSAGE,
        content: 'Test message',

        // Champs legacy à la racine (backward compat)
        isRead: true,
        readAt: '2024-01-15T11:00:00Z',
        createdAt: '2024-01-15T10:30:00Z',

        // Pas de state groupé
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [legacyNotification],
          pagination: {
            offset: 0,
            limit: 50,
            total: 1,
            hasMore: false,
          },
          unreadCount: 0,
        },
      });

      const response = await NotificationService.fetchNotifications();
      const notification = response.data!.notifications[0];

      // Devrait utiliser les valeurs legacy si state n'existe pas
      expect(notification.state.isRead).toBe(true);
      expect(notification.state.readAt).toBeInstanceOf(Date);
      expect(notification.state.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('fetchNotifications', () => {
    it('devrait construire les query params correctement', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [],
          pagination: {
            offset: 0,
            limit: 50,
            total: 0,
            hasMore: false,
          },
          unreadCount: 0,
        },
      });

      await NotificationService.fetchNotifications({
        offset: 10,
        limit: 20,
        type: NotificationTypeEnum.NEW_MESSAGE,
        isRead: false,
        priority: 'high',
        conversationId: 'conv_123',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining('offset=10')
      );
      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining('limit=20')
      );
      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining('type=new_message')
      );
      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining('unreadOnly=true')
      );
      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining('priority=high')
      );
      expect(apiService.get).toHaveBeenCalledWith(
        expect.stringContaining('conversationId=conv_123')
      );
    });

    it('devrait gérer les dates dans les filtres', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [],
          pagination: { offset: 0, limit: 50, total: 0, hasMore: false },
          unreadCount: 0,
        },
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await NotificationService.fetchNotifications({
        startDate,
        endDate,
      });

      const callArg = (apiService.get as jest.Mock).mock.calls[0][0];
      expect(callArg).toContain('startDate=2024-01-01T00');
      expect(callArg).toContain('endDate=2024-01-31T00');
    });

    it('devrait retourner une structure vide en cas de données manquantes', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: null,
      });

      const response = await NotificationService.fetchNotifications();

      expect(response.data?.notifications).toEqual([]);
      expect(response.data?.pagination).toEqual({
        offset: 0,
        limit: 50,
        total: 0,
        hasMore: false,
      });
      expect(response.data?.unreadCount).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('devrait marquer une notification comme lue et parser la réponse', async () => {
      const updatedNotification = {
        id: 'notif_123',
        userId: 'user_123',
        type: NotificationTypeEnum.NEW_MESSAGE,
        content: 'Test',
        // Le backend envoie les champs à la racine
        isRead: true,
        readAt: '2024-01-15T11:00:00Z',
        createdAt: '2024-01-15T10:30:00Z',
        context: {},
        metadata: {},
        delivery: { emailSent: false, pushSent: false },
      };

      (apiService.post as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: updatedNotification,
        },
      });

      const response = await NotificationService.markAsRead('notif_123');

      expect(apiService.post).toHaveBeenCalledWith('/notifications/notif_123/read');
      expect(response.data?.data.state.isRead).toBe(true);
      expect(response.data?.data.state.readAt).toBeInstanceOf(Date);
    });
  });

  describe('markAllAsRead', () => {
    it('devrait marquer toutes les notifications comme lues', async () => {
      (apiService.post as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          count: 5,
        },
      });

      const response = await NotificationService.markAllAsRead();

      expect(apiService.post).toHaveBeenCalledWith('/notifications/read-all');
      expect(response.data?.count).toBe(5);
    });
  });

  describe('deleteNotification', () => {
    it('devrait supprimer une notification', async () => {
      (apiService.delete as jest.Mock).mockResolvedValue({
        success: true,
      });

      await NotificationService.deleteNotification('notif_123');

      expect(apiService.delete).toHaveBeenCalledWith('/notifications/notif_123');
    });
  });

  describe('getUnreadCount', () => {
    it('devrait récupérer le nombre de notifications non lues', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          count: 42,
        },
      });

      const response = await NotificationService.getUnreadCount();

      expect(apiService.get).toHaveBeenCalledWith('/notifications/unread-count');
      expect(response.data?.count).toBe(42);
    });
  });

  describe('getCounts', () => {
    it('devrait récupérer et formater les compteurs', async () => {
      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          count: 15,
        },
      });

      const response = await NotificationService.getCounts();

      expect(response.data?.total).toBe(15);
      expect(response.data?.unread).toBe(15);
    });
  });

  describe('Retry Logic', () => {
    it('devrait réessayer en cas d\'erreur temporaire', async () => {
      (apiService.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          success: true,
          data: {
            data: [],
            pagination: { offset: 0, limit: 50, total: 0, hasMore: false },
            unreadCount: 0,
          },
        });

      const response = await NotificationService.fetchNotifications();

      expect(apiService.get).toHaveBeenCalledTimes(3);
      expect(response.success).toBe(true);
    });

    it('devrait échouer après le nombre max de retries', async () => {
      (apiService.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(NotificationService.fetchNotifications()).rejects.toThrow('Network error');

      // MAX_RETRIES = 3, donc 4 appels au total (1 initial + 3 retries)
      expect(apiService.get).toHaveBeenCalledTimes(4);
    }, 10000);
  });

  describe('Types de Notifications Spécifiques', () => {
    it('devrait parser notification mention avec metadata approprié', async () => {
      const mentionNotification = {
        id: 'notif_mention',
        userId: 'user_123',
        type: NotificationTypeEnum.USER_MENTIONED,
        content: '@bob tu as été mentionné',
        actor: {
          id: 'user_alice',
          username: 'alice',
          displayName: 'Alice',
          avatar: null,
        },
        context: {
          conversationId: 'conv_123',
          messageId: 'msg_456',
        },
        metadata: {
          mentionText: '@bob',
          messagePreview: 'Salut @bob comment ça va?',
        },
        // Le backend envoie les champs à la racine
        isRead: false,
        readAt: null,
        createdAt: '2024-01-15T10:30:00Z',
        delivery: { emailSent: false, pushSent: false },
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [mentionNotification],
          pagination: { offset: 0, limit: 50, total: 1, hasMore: false },
          unreadCount: 1,
        },
      });

      const response = await NotificationService.fetchNotifications({
        type: NotificationTypeEnum.USER_MENTIONED,
      });

      const notification = response.data!.notifications[0];
      expect(notification.type).toBe(NotificationTypeEnum.USER_MENTIONED);
      expect(notification.metadata).toHaveProperty('mentionText');
      expect(notification.metadata).toHaveProperty('messagePreview');
    });

    it('devrait parser notification appel manqué avec context approprié', async () => {
      const missedCallNotification = {
        id: 'notif_call',
        userId: 'user_123',
        type: NotificationTypeEnum.MISSED_CALL,
        content: 'Appel manqué de Alice',
        priority: 'high',
        actor: {
          id: 'user_alice',
          username: 'alice',
          displayName: 'Alice Martin',
          avatar: null,
        },
        context: {
          conversationId: 'conv_123',
          callSessionId: 'call_789',
        },
        metadata: {
          callType: 'video',
          duration: 0,
        },
        // Le backend envoie les champs à la racine
        isRead: false,
        readAt: null,
        createdAt: '2024-01-15T10:30:00Z',
        delivery: { emailSent: false, pushSent: true },
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          data: [missedCallNotification],
          pagination: { offset: 0, limit: 50, total: 1, hasMore: false },
          unreadCount: 1,
        },
      });

      const response = await NotificationService.fetchNotifications({
        type: NotificationTypeEnum.MISSED_CALL,
      });

      const notification = response.data!.notifications[0];
      expect(notification.type).toBe(NotificationTypeEnum.MISSED_CALL);
      expect(notification.priority).toBe('high');
      expect(notification.context).toHaveProperty('callSessionId');
      expect(notification.metadata).toHaveProperty('callType');
    });
  });

  describe('getPreferences', () => {
    it('devrait récupérer les préférences de notifications', async () => {
      const mockPreferences = {
        emailNotifications: true,
        pushNotifications: true,
      };

      (apiService.get as jest.Mock).mockResolvedValue({
        success: true,
        data: mockPreferences,
      });

      const response = await NotificationService.getPreferences();

      expect(apiService.get).toHaveBeenCalledWith('/notifications/preferences');
      expect(response.data).toEqual(mockPreferences);
    });
  });

  describe('updatePreferences', () => {
    it('devrait mettre à jour les préférences de notifications', async () => {
      const updatedPreferences = {
        emailNotifications: false,
        pushNotifications: true,
      };

      (apiService.patch as jest.Mock).mockResolvedValue({
        success: true,
        data: updatedPreferences,
      });

      const response = await NotificationService.updatePreferences(updatedPreferences);

      expect(apiService.patch).toHaveBeenCalledWith('/notifications/preferences', updatedPreferences);
      expect(response.data).toEqual(updatedPreferences);
    });
  });
});
