/**
 * Tests pour les notifications de conversations directes
 */

import { renderHook, act } from '@testing-library/react';
import { useNotifications } from '@/hooks/use-notifications';
import { buildMultilingualNotificationMessage, getNotificationTitle, getNotificationIcon } from '@/utils/notification-translations';

// Mock des dépendances
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: true,
  })),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Notifications pour conversations directes', () => {
  describe('buildMultilingualNotificationMessage', () => {
    it('devrait construire un message multilingue avec traductions', () => {
      const content = 'Bonjour, comment allez-vous ?';
      const translations = {
        fr: 'Bonjour, comment allez-vous ?',
        en: 'Hello, how are you?',
        es: 'Hola, ¿cómo estás?'
      };

      const result = buildMultilingualNotificationMessage(content, translations);
      
      expect(result).toContain('🇫🇷 Bonjour, comment allez-vous ?');
      expect(result).toContain('🇺🇸 Hello, how are you?');
      expect(result).toContain('🇪🇸 Hola, ¿cómo estás?');
    });

    it('devrait retourner le message original si pas de traductions', () => {
      const content = 'Message simple';
      const result = buildMultilingualNotificationMessage(content);
      
      expect(result).toBe('Message simple');
    });

    it('devrait tronquer les messages longs', () => {
      const longContent = 'Ceci est un message très long qui devrait être tronqué à trente caractères maximum';
      const result = buildMultilingualNotificationMessage(longContent);

      // La fonction tronque à 30 caractères puis ajoute "..."
      expect(result).toBe('Ceci est un message très long ...');
    });
  });

  describe('getNotificationTitle', () => {
    it('devrait retourner le bon titre pour une conversation directe', () => {
      const title = getNotificationTitle('direct', 'Jean Dupont');
      expect(title).toBe('Message direct de Jean Dupont');
    });

    it('devrait retourner le bon titre pour une conversation de groupe', () => {
      const title = getNotificationTitle('group', 'Marie Martin');
      expect(title).toBe('Message de groupe de Marie Martin');
    });

    it('devrait retourner le bon titre pour une conversation publique', () => {
      const title = getNotificationTitle('public', 'Pierre Durand');
      expect(title).toBe('Message public de Pierre Durand');
    });
  });

  describe('getNotificationIcon', () => {
    it('devrait retourner la bonne icône pour chaque type de conversation', () => {
      expect(getNotificationIcon('direct')).toBe('💬');
      expect(getNotificationIcon('group')).toBe('👥');
      expect(getNotificationIcon('public')).toBe('🌐');
      expect(getNotificationIcon('global')).toBe('🌍');
    });
  });

  describe('useNotifications hook', () => {
    it('devrait initialiser correctement', () => {
      const { result } = renderHook(() => useNotifications());

      // Vérifier les propriétés initiales du hook
      expect(result.current.notifications).toEqual([]);
      expect(result.current.isConnected).toBe(false);
      expect(typeof result.current.markAsRead).toBe('function');
      expect(typeof result.current.markAllAsRead).toBe('function');
      expect(typeof result.current.clearAll).toBe('function');
      expect(typeof result.current.removeNotification).toBe('function');
      expect(typeof result.current.showToast).toBe('function');
    });

    it('devrait avoir les compteurs initialisés à zéro', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.counts.total).toBe(0);
      expect(result.current.counts.unread).toBe(0);
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.totalCount).toBe(0);
    });

    it('devrait retourner les notifications non lues vides initialement', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.unreadNotifications).toEqual([]);
    });
  });
});

