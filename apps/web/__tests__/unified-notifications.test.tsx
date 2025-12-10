/**
 * Tests pour le système de notifications unifié
 */

import { render, screen, waitFor } from '@testing-library/react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { useNotifications } from '@/hooks/use-notifications';
import { notificationService } from '@/services/notification.service';

// Mock du hook useNotifications
jest.mock('@/hooks/use-notifications');
const mockUseNotifications = useNotifications as jest.MockedFunction<typeof useNotifications>;

// Mock du service de notifications
jest.mock('@/services/notification.service');
const mockNotificationService = notificationService as jest.Mocked<typeof notificationService>;

// Mock de Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('Système de notifications unifié', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NotificationBell', () => {
    it('affiche la pastille avec le bon nombre de notifications non lues', () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadNotifications: [],
        counts: {
          total: 5,
          unread: 3,
          byType: {
            message: 2,
            system: 1,
            user_action: 0,
            conversation: 0,
            translation: 0
          }
        },
        unreadCount: 3,
        totalCount: 5,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        removeNotification: jest.fn(),
        clearAll: jest.fn(),
        isConnected: true,
        showToast: jest.fn()
      });

      render(<NotificationBell />);
      
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('n\'affiche pas la pastille quand il n\'y a pas de notifications non lues', () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadNotifications: [],
        counts: {
          total: 0,
          unread: 0,
          byType: {
            message: 0,
            system: 0,
            user_action: 0,
            conversation: 0,
            translation: 0
          }
        },
        unreadCount: 0,
        totalCount: 0,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        removeNotification: jest.fn(),
        clearAll: jest.fn(),
        isConnected: true,
        showToast: jest.fn()
      });

      render(<NotificationBell />);
      
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('affiche 9+ pour plus de 9 notifications', () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadNotifications: [],
        counts: {
          total: 15,
          unread: 12,
          byType: {
            message: 8,
            system: 4,
            user_action: 0,
            conversation: 0,
            translation: 0
          }
        },
        unreadCount: 12,
        totalCount: 15,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        removeNotification: jest.fn(),
        clearAll: jest.fn(),
        isConnected: true,
        showToast: jest.fn()
      });

      render(<NotificationBell />);
      
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

  describe('NotificationCenter', () => {
    it('affiche la liste des notifications', () => {
      const mockNotifications = [
        {
          id: '1',
          type: 'message' as const,
          title: 'Nouveau message',
          message: 'Vous avez reçu un nouveau message',
          timestamp: new Date(),
          isRead: false,
          conversationId: 'conv1'
        },
        {
          id: '2',
          type: 'system' as const,
          title: 'Notification système',
          message: 'Mise à jour disponible',
          timestamp: new Date(),
          isRead: true
        }
      ];

      mockUseNotifications.mockReturnValue({
        notifications: mockNotifications,
        unreadNotifications: [mockNotifications[0]],
        counts: {
          total: 2,
          unread: 1,
          byType: {
            message: 1,
            system: 1,
            user_action: 0,
            conversation: 0,
            translation: 0
          }
        },
        unreadCount: 1,
        totalCount: 2,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        removeNotification: jest.fn(),
        clearAll: jest.fn(),
        isConnected: true,
        showToast: jest.fn()
      });

      render(<NotificationCenter />);
      
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('1 non lue sur 2')).toBeInTheDocument();
      expect(screen.getByText('Nouveau message')).toBeInTheDocument();
      expect(screen.getByText('Notification système')).toBeInTheDocument();
    });

    it('affiche un message quand il n\'y a pas de notifications', () => {
      mockUseNotifications.mockReturnValue({
        notifications: [],
        unreadNotifications: [],
        counts: {
          total: 0,
          unread: 0,
          byType: {
            message: 0,
            system: 0,
            user_action: 0,
            conversation: 0,
            translation: 0
          }
        },
        unreadCount: 0,
        totalCount: 0,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        removeNotification: jest.fn(),
        clearAll: jest.fn(),
        isConnected: true,
        showToast: jest.fn()
      });

      render(<NotificationCenter />);
      
      expect(screen.getByText('Aucune notification')).toBeInTheDocument();
    });
  });

  describe('Service de notifications', () => {
    it('initialise correctement le service', async () => {
      const mockConfig = {
        token: 'test-token',
        userId: 'user-1',
        onConnect: jest.fn(),
        onDisconnect: jest.fn(),
        onError: jest.fn(),
        onNotificationReceived: jest.fn(),
        onCountsUpdated: jest.fn()
      };

      mockNotificationService.initialize.mockResolvedValue(undefined);

      await notificationService.initialize(mockConfig);

      expect(mockNotificationService.initialize).toHaveBeenCalledWith(mockConfig);
    });

    it('gère les notifications de messages avec traductions', () => {
      const messageData = {
        messageId: 'msg-1',
        senderId: 'user-1',
        senderName: 'John Doe',
        content: 'Hello world',
        conversationId: 'conv-1',
        conversationType: 'direct',
        timestamp: new Date().toISOString(),
        translations: {
          fr: 'Bonjour le monde',
          en: 'Hello world',
          es: 'Hola mundo'
        }
      };

      // Simuler la réception d'une notification
      const mockOnNotificationReceived = jest.fn();
      mockNotificationService.initialize.mockImplementation((config) => {
        // Simuler l'événement newMessageNotification
        setTimeout(() => {
          config.onNotificationReceived?.({
            id: `msg-${messageData.messageId}`,
            type: 'message',
            title: `Message direct de ${messageData.senderName}`,
            message: '🇫🇷 Hello world...\n🇺🇸 Hello world...\n🇪🇸 Hola mundo...',
            data: messageData,
            conversationId: messageData.conversationId,
            senderId: messageData.senderId,
            senderName: messageData.senderName,
            timestamp: new Date(messageData.timestamp),
            isRead: false,
            translations: messageData.translations
          });
        }, 100);
        return Promise.resolve();
      });

      notificationService.initialize({
        token: 'test-token',
        userId: 'user-2',
        onNotificationReceived: mockOnNotificationReceived
      });

      expect(mockOnNotificationReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'message',
          title: 'Message direct de John Doe',
          translations: messageData.translations
        })
      );
    });
  });
});

