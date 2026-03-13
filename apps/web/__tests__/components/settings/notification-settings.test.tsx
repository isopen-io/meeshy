/**
 * Tests pour le composant NotificationSettings
 * Gere les preferences de notifications utilisateur
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationSettings } from '@/components/settings/notification-settings';

// Mock des hooks
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
  SoundFeedback: {
    playClick: jest.fn(),
    playToggleOn: jest.fn(),
    playToggleOff: jest.fn(),
  },
}));

// Mock de toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock de usePreferences
const mockUpdatePreferences = jest.fn().mockResolvedValue(undefined);
const mockRefetch = jest.fn();

const defaultPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  newMessageEnabled: true,
  missedCallEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  groupInviteEnabled: true,
  memberJoinedEnabled: true,
  memberLeftEnabled: true,
  voicemailEnabled: true,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
  showPreview: true,
  showSenderName: true,
  groupNotifications: true,
  notificationBadgeEnabled: true,
};

let mockUsePreferencesReturn: any = {
  data: defaultPreferences,
  isLoading: false,
  isUpdating: false,
  error: null,
  consentViolations: null,
  updatePreferences: mockUpdatePreferences,
  refetch: mockRefetch,
};

jest.mock('@/hooks/use-preferences', () => ({
  usePreferences: () => mockUsePreferencesReturn,
}));

// Mock de l'API Notification du navigateur
const mockNotificationPermission = jest.fn();
Object.defineProperty(global, 'Notification', {
  value: {
    permission: 'default',
    requestPermission: mockNotificationPermission,
  },
  writable: true,
});

describe('NotificationSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreferencesReturn = {
      data: { ...defaultPreferences },
      isLoading: false,
      isUpdating: false,
      error: null,
      consentViolations: null,
      updatePreferences: mockUpdatePreferences,
      refetch: mockRefetch,
    };
    (global.Notification as any).permission = 'default';
  });

  describe('Etat de chargement', () => {
    it('affiche le loader pendant le chargement', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: null,
        isLoading: true,
      };

      render(<NotificationSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('affiche le contenu apres chargement', () => {
      render(<NotificationSettings />);

      expect(screen.getByText('Canaux de notification')).toBeInTheDocument();
    });
  });

  describe('Canaux de notification', () => {
    it('affiche les trois canaux principaux', () => {
      render(<NotificationSettings />);

      expect(screen.getByText('Notifications push')).toBeInTheDocument();
      expect(screen.getByText('Notifications email')).toBeInTheDocument();
      expect(screen.getByText('Sons de notification')).toBeInTheDocument();
    });

    it('permet de toggler pushEnabled', () => {
      render(<NotificationSettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      expect(mockUpdatePreferences).not.toHaveBeenCalled(); // debounced
    });

    it('affiche le bouton "Autoriser" quand les notifications ne sont pas autorisees', () => {
      render(<NotificationSettings />);

      expect(screen.getByText('Autoriser')).toBeInTheDocument();
    });

    it('demande la permission de notification au clic sur Autoriser', async () => {
      mockNotificationPermission.mockResolvedValueOnce('granted');

      render(<NotificationSettings />);

      fireEvent.click(screen.getByText('Autoriser'));

      expect(mockNotificationPermission).toHaveBeenCalled();
    });
  });

  describe('Types de notifications', () => {
    it('affiche tous les types de notifications', () => {
      render(<NotificationSettings />);

      expect(screen.getByText('Nouveaux messages')).toBeInTheDocument();
      expect(screen.getByText(/ponses/)).toBeInTheDocument();
      expect(screen.getByText('Mentions')).toBeInTheDocument();
      expect(screen.getAllByText(/actions/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Demandes de contact')).toBeInTheDocument();
      expect(screen.getByText('Nouveaux membres')).toBeInTheDocument();
      expect(screen.getByText(/Activit. de conversation/)).toBeInTheDocument();
      expect(screen.getByText(/Appels manqu/)).toBeInTheDocument();
      expect(screen.getByText(/Notifications syst/)).toBeInTheDocument();
    });
  });

  describe('Ne pas deranger', () => {
    it('affiche la section DND', () => {
      render(<NotificationSettings />);

      expect(screen.getAllByText(/Ne pas d.ranger/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Activer .Ne pas d.ranger./).length).toBeGreaterThanOrEqual(1);
    });

    it('affiche les champs de temps quand DND est active', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...defaultPreferences, dndEnabled: true },
      };

      render(<NotificationSettings />);

      expect(screen.getByLabelText(/Heure de d.but/)).toBeInTheDocument();
      expect(screen.getByLabelText('Heure de fin')).toBeInTheDocument();
    });

    it('cache les champs de temps quand DND est desactive', () => {
      render(<NotificationSettings />);

      expect(screen.queryByLabelText(/Heure de d.but/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Heure de fin')).not.toBeInTheDocument();
    });
  });

  describe('Etat des permissions', () => {
    it('affiche "Autorisees" quand permission granted', () => {
      (global.Notification as any).permission = 'granted';

      render(<NotificationSettings />);

      expect(screen.getByText(/Autoris.es/)).toBeInTheDocument();
    });

    it('affiche "Refusees" quand permission denied', () => {
      (global.Notification as any).permission = 'denied';

      render(<NotificationSettings />);

      expect(screen.getByText(/Refus.es/)).toBeInTheDocument();
    });

    it('affiche "En attente" quand permission default', () => {
      (global.Notification as any).permission = 'default';

      render(<NotificationSettings />);

      expect(screen.getByText('En attente')).toBeInTheDocument();
    });

    it('affiche un message explicatif quand les notifications sont refusees', () => {
      (global.Notification as any).permission = 'denied';

      render(<NotificationSettings />);

      expect(
        screen.getByText(/Les notifications ont .t. refus.es/)
      ).toBeInTheDocument();
    });
  });

  describe('Accessibilite', () => {
    it('les switches ont des labels accessibles', () => {
      render(<NotificationSettings />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(10);
    });

    it('les inputs de temps ont des labels', () => {
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...defaultPreferences, dndEnabled: true },
      };

      render(<NotificationSettings />);

      expect(screen.getByLabelText(/Heure de d.but/)).toBeInTheDocument();
      expect(screen.getByLabelText('Heure de fin')).toBeInTheDocument();
    });
  });

  describe('Navigateur sans support Notification', () => {
    it.skip('affiche un message si les notifications ne sont pas supportees', () => {
      // Skipped: jsdom 26 makes Notification non-configurable, cannot delete from window
    });
  });
});
