/**
 * Tests d'intégration pour le système de notifications unifié
 *
 * Ces tests utilisent les VRAIS composants et hooks avec seulement
 * les dépendances bas-niveau mockées (service API, auth, router)
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

// === MOCKS DES DÉPENDANCES BAS-NIVEAU ===

// Mock de Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock de sonner (toast)
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Variables pour contrôler le mock du service
let mockNotifications: any[] = [];
let mockCounts = {
  total: 0,
  unread: 0,
  byType: { message: 0, system: 0, user_action: 0, conversation: 0, translation: 0 }
};

// Mock du service de notifications avec toutes les méthodes attendues par le hook
jest.mock('@/services/notification.service', () => ({
  notificationService: {
    initialize: jest.fn(),
    disconnect: jest.fn(),
    getNotifications: jest.fn(() => mockNotifications),
    getUnreadNotifications: jest.fn(() => mockNotifications.filter(n => !n.isRead)),
    getCounts: jest.fn(() => mockCounts),
    markAsRead: jest.fn().mockResolvedValue(undefined),
    markAllAsRead: jest.fn().mockResolvedValue(undefined),
    removeNotification: jest.fn(),
    clearAll: jest.fn(),
    // Méthodes API supplémentaires
    fetchNotifications: jest.fn().mockResolvedValue({ data: { notifications: [], pagination: {} }, success: true }),
    getUnreadCount: jest.fn().mockResolvedValue({ data: { count: 0 }, success: true }),
    deleteNotification: jest.fn().mockResolvedValue({ success: true }),
  },
  Notification: {},
  NotificationCounts: {},
}));

// Mock de useAuth
let mockIsAuthenticated = false;
let mockUser: any = null;

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
  }),
}));

// Mock de authManager
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(() => mockIsAuthenticated ? 'test-token' : null),
  },
}));

// Helper pour setup les notifications de test
function setupNotifications(notifications: any[], counts?: any) {
  mockNotifications = notifications;
  if (counts) {
    mockCounts = counts;
  } else {
    mockCounts = {
      total: notifications.length,
      unread: notifications.filter(n => !n.isRead).length,
      byType: { message: 0, system: 0, user_action: 0, conversation: 0, translation: 0 }
    };
  }
}

// Helper pour setup l'authentification
function setupAuth(authenticated: boolean, user?: any) {
  mockIsAuthenticated = authenticated;
  mockUser = user || (authenticated ? { id: 'user-1', username: 'testuser' } : null);
}

describe('Système de notifications unifié - Tests d\'intégration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    // Reset à l'état non authentifié par défaut
    setupAuth(false);
    setupNotifications([]);
  });

  describe('NotificationBell - Composant réel', () => {
    it('affiche le badge avec le nombre correct de notifications non lues', () => {
      setupNotifications([
        { id: '1', type: 'message', title: 'Test 1', isRead: false, timestamp: new Date() },
        { id: '2', type: 'message', title: 'Test 2', isRead: false, timestamp: new Date() },
        { id: '3', type: 'message', title: 'Test 3', isRead: true, timestamp: new Date() },
      ], {
        total: 3,
        unread: 2,
        byType: { message: 3, system: 0, user_action: 0, conversation: 0, translation: 0 }
      });

      render(<NotificationBell />);

      // Le composant utilise unreadCount du hook qui vient de counts.unread
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('n\'affiche pas le badge quand unreadCount est 0', () => {
      setupNotifications([], {
        total: 0,
        unread: 0,
        byType: { message: 0, system: 0, user_action: 0, conversation: 0, translation: 0 }
      });

      render(<NotificationBell />);

      // Pas de badge visible
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('affiche 9+ pour plus de 9 notifications non lues', () => {
      setupNotifications([], {
        total: 15,
        unread: 12,
        byType: { message: 12, system: 0, user_action: 0, conversation: 0, translation: 0 }
      });

      render(<NotificationBell />);

      expect(screen.getByText('9+')).toBeInTheDocument();
    });

    it('appelle onClick quand fourni au lieu de naviguer', () => {
      const handleClick = jest.fn();

      render(<NotificationBell onClick={handleClick} />);

      const bellButton = screen.getByRole('button');
      fireEvent.click(bellButton);

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('navigue vers /notifications quand onClick n\'est pas fourni', () => {
      render(<NotificationBell />);

      // Sans onClick, le composant rend un Link (rôle link) au lieu d'un Button
      const bellLink = screen.getByRole('link');
      // Le Link navigue via href="/notifications", pas via router.push
      expect(bellLink).toHaveAttribute('href', '/notifications');
    });

    it('affiche le aria-label correct selon l\'état de connexion', () => {
      // Non connecté par défaut (isConnected = false dans le hook initial)
      render(<NotificationBell />);

      // Sans onClick, le composant rend un Link (rôle link)
      const bellLink = screen.getByRole('link');
      // Le composant utilise aria-label, pas title
      expect(bellLink).toHaveAttribute('aria-label', 'Notifications (hors ligne)');
    });
  });

  describe('NotificationCenter - Composant réel', () => {
    it('affiche le bouton cloche initialement (état fermé)', () => {
      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      expect(bellButton).toBeInTheDocument();
    });

    it('ouvre le panneau de notifications au clic', async () => {
      setupNotifications([
        {
          id: '1',
          type: 'message',
          title: 'Nouveau message',
          message: 'Contenu du message',
          isRead: false,
          timestamp: new Date()
        }
      ]);

      render(<NotificationCenter />);

      // Cliquer pour ouvrir
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      // Vérifier que le panneau est ouvert
      await waitFor(() => {
        expect(screen.getByText('Nouveau message')).toBeInTheDocument();
      });
    });

    it('affiche "Aucune notification" quand la liste est vide', async () => {
      setupNotifications([]);

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Aucune notification')).toBeInTheDocument();
      });
    });

    it('affiche le compteur correct dans le header', async () => {
      setupNotifications([
        { id: '1', type: 'message', title: 'Test 1', message: 'msg', isRead: false, timestamp: new Date() },
        { id: '2', type: 'system', title: 'Test 2', message: 'msg', isRead: true, timestamp: new Date() },
      ], {
        total: 2,
        unread: 1,
        byType: { message: 1, system: 1, user_action: 0, conversation: 0, translation: 0 }
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText(/1 non lue sur 2/)).toBeInTheDocument();
      });
    });

    it('ferme le panneau au clic sur X', async () => {
      setupNotifications([
        { id: '1', type: 'message', title: 'Test', message: 'msg', isRead: false, timestamp: new Date() }
      ]);

      render(<NotificationCenter />);

      // Ouvrir
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Test')).toBeInTheDocument();
      });

      // Fermer - le dernier bouton dans le header est le bouton X
      // Structure: markAllAsRead?, clearAll?, X (close)
      const header = screen.getByText('Notifications').closest('[data-slot="card-header"]');
      const headerButtons = header?.querySelectorAll('button') || [];
      // Le bouton de fermeture est le dernier bouton du header (après markAllAsRead et clearAll)
      const closeButton = headerButtons[headerButtons.length - 1];

      if (closeButton) {
        await act(async () => {
          fireEvent.click(closeButton);
        });
      }

      // Le panneau devrait être fermé - retour au bouton cloche simple
      await waitFor(() => {
        expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
      });
    });

    it('appelle markAsRead quand on clique sur une notification non lue', async () => {
      const { notificationService } = require('@/services/notification.service');

      setupNotifications([
        {
          id: 'notif-1',
          type: 'message',
          title: 'Message non lu',
          message: 'Contenu',
          isRead: false,
          timestamp: new Date()
        }
      ]);

      render(<NotificationCenter />);

      // Ouvrir le panneau
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Message non lu')).toBeInTheDocument();
      });

      // Cliquer sur la notification
      const notificationElement = screen.getByText('Message non lu').closest('div[class*="cursor-pointer"]');
      if (notificationElement) {
        fireEvent.click(notificationElement);
      }

      // Vérifier que markAsRead a été appelé
      expect(notificationService.markAsRead).toHaveBeenCalledWith('notif-1');
    });

    it('appelle markAllAsRead quand on clique sur le bouton', async () => {
      const { notificationService } = require('@/services/notification.service');

      setupNotifications([
        { id: '1', type: 'message', title: 'Test 1', message: 'msg', isRead: false, timestamp: new Date() },
        { id: '2', type: 'message', title: 'Test 2', message: 'msg', isRead: false, timestamp: new Date() },
      ], {
        total: 2,
        unread: 2,
        byType: { message: 2, system: 0, user_action: 0, conversation: 0, translation: 0 }
      });

      render(<NotificationCenter />);

      // Ouvrir
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Test 1')).toBeInTheDocument();
      });

      // Cliquer sur "Marquer tout comme lu"
      const markAllButton = screen.getByTitle('Marquer tout comme lu');
      fireEvent.click(markAllButton);

      expect(notificationService.markAllAsRead).toHaveBeenCalled();
    });

    it('appelle removeNotification quand on clique sur le X d\'une notification', async () => {
      const { notificationService } = require('@/services/notification.service');

      setupNotifications([
        {
          id: 'notif-to-remove',
          type: 'message',
          title: 'A supprimer',
          message: 'Contenu',
          isRead: false,
          timestamp: new Date()
        }
      ]);

      render(<NotificationCenter />);

      // Ouvrir
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('A supprimer')).toBeInTheDocument();
      });

      // Trouver le bouton X dans la notification (pas celui du header)
      const notificationItem = screen.getByText('A supprimer').closest('div[class*="cursor-pointer"]');
      const removeButton = notificationItem?.querySelector('button');

      if (removeButton) {
        fireEvent.click(removeButton);
      }

      expect(notificationService.removeNotification).toHaveBeenCalledWith('notif-to-remove');
    });

    it('appelle clearAll quand on clique sur le bouton supprimer tout', async () => {
      const { notificationService } = require('@/services/notification.service');

      setupNotifications([
        { id: '1', type: 'message', title: 'Test', message: 'msg', isRead: true, timestamp: new Date() },
      ], {
        total: 1,
        unread: 0,
        byType: { message: 1, system: 0, user_action: 0, conversation: 0, translation: 0 }
      });

      render(<NotificationCenter />);

      // Ouvrir
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Test')).toBeInTheDocument();
      });

      // Cliquer sur "Supprimer toutes les notifications"
      const clearAllButton = screen.getByTitle('Supprimer toutes les notifications');
      fireEvent.click(clearAllButton);

      expect(notificationService.clearAll).toHaveBeenCalled();
    });

    it('affiche les différentes icônes selon le type de notification', async () => {
      setupNotifications([
        { id: '1', type: 'message', title: 'Message', message: 'msg', isRead: false, timestamp: new Date() },
        { id: '2', type: 'conversation', title: 'Conversation', message: 'msg', isRead: false, timestamp: new Date() },
        { id: '3', type: 'translation', title: 'Translation', message: 'msg', isRead: false, timestamp: new Date() },
        { id: '4', type: 'system', title: 'System', message: 'msg', isRead: false, timestamp: new Date() },
      ]);

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Message')).toBeInTheDocument();
        expect(screen.getByText('Conversation')).toBeInTheDocument();
        expect(screen.getByText('Translation')).toBeInTheDocument();
        expect(screen.getByText('System')).toBeInTheDocument();
      });
    });
  });

  describe('Intégration Hook + Composants', () => {
    it('le hook initialise le service quand l\'utilisateur est authentifié', () => {
      const { notificationService } = require('@/services/notification.service');

      setupAuth(true, { id: 'user-123', username: 'testuser' });

      render(<NotificationBell />);

      // Le hook devrait appeler initialize quand isAuthenticated=true et user existe
      expect(notificationService.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-token',
          userId: 'user-123',
        })
      );
    });

    it('le hook n\'initialise pas le service quand non authentifié', () => {
      const { notificationService } = require('@/services/notification.service');

      setupAuth(false);

      render(<NotificationBell />);

      expect(notificationService.initialize).not.toHaveBeenCalled();
    });
  });
});
