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

// Mock de l'auth manager
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => 'test-token',
  },
}));

// Mock de la config API
jest.mock('@/lib/config', () => ({
  API_CONFIG: {
    getApiUrl: () => 'http://localhost:3001',
  },
}));

// Mock de toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch global
const mockFetch = jest.fn();
global.fetch = mockFetch;

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
  const mockPreferences = {
    success: true,
    data: {
      id: 'pref-1',
      userId: 'user-1',
      pushEnabled: true,
      emailEnabled: true,
      soundEnabled: true,
      newMessageEnabled: true,
      missedCallEnabled: true,
      systemEnabled: true,
      conversationEnabled: true,
      replyEnabled: true,
      mentionEnabled: true,
      reactionEnabled: true,
      contactRequestEnabled: true,
      memberJoinedEnabled: true,
      dndEnabled: false,
      dndStartTime: '22:00',
      dndEndTime: '08:00',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    // Par defaut, charger les preferences avec succes
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPreferences),
    });

    // Reset Notification permission
    (global.Notification as any).permission = 'default';
  });

  describe('Etat de chargement', () => {
    it('affiche le loader pendant le chargement', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<NotificationSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('affiche le contenu apres chargement', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Canaux de notification')).toBeInTheDocument();
      });
    });
  });

  describe('Chargement des preferences', () => {
    it('charge les preferences depuis l\'API', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/me/preferences/notification',
          expect.objectContaining({
            headers: {
              Authorization: 'Bearer test-token',
            },
          })
        );
      });
    });

    it('gere l\'erreur de chargement gracieusement', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      // Le composant devrait toujours s'afficher avec les valeurs par defaut
      await waitFor(() => {
        expect(screen.getByText('Canaux de notification')).toBeInTheDocument();
      });

      consoleError.mockRestore();
    });

    it('utilise les valeurs par defaut si non authentifie', async () => {
      const { authManager } = require('@/services/auth-manager.service');
      authManager.getAuthToken = () => null;

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Canaux de notification')).toBeInTheDocument();
      });

      // fetch ne devrait pas etre appele
      expect(mockFetch).not.toHaveBeenCalled();

      // Restaurer
      authManager.getAuthToken = () => 'test-token';
    });
  });

  describe('Canaux de notification', () => {
    it('affiche les trois canaux principaux', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
        expect(screen.getByText('Notifications email')).toBeInTheDocument();
        expect(screen.getByText('Sons de notification')).toBeInTheDocument();
      });
    });

    it('permet de toggler pushEnabled', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      const switches = screen.getAllByRole('switch');
      // Premier switch = push
      fireEvent.click(switches[0]);

      // Devrait marquer hasChanges = true et afficher le bouton save
      await waitFor(() => {
        expect(screen.getByText('Enregistrer les modifications')).toBeInTheDocument();
      });
    });

    it('affiche le bouton "Autoriser" quand les notifications ne sont pas autorisees', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Autoriser')).toBeInTheDocument();
      });
    });

    it('demande la permission de notification au clic sur Autoriser', async () => {
      mockNotificationPermission.mockResolvedValueOnce('granted');

      render(<NotificationSettings />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Autoriser'));
      });

      expect(mockNotificationPermission).toHaveBeenCalled();
    });
  });

  describe('Types de notifications', () => {
    it('affiche tous les types de notifications', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Nouveaux messages')).toBeInTheDocument();
        expect(screen.getByText('Reponses')).toBeInTheDocument();
        expect(screen.getByText('Mentions')).toBeInTheDocument();
        expect(screen.getByText('Reactions')).toBeInTheDocument();
        expect(screen.getByText('Demandes de contact')).toBeInTheDocument();
        expect(screen.getByText('Nouveaux membres')).toBeInTheDocument();
        expect(screen.getByText('Activite de conversation')).toBeInTheDocument();
        expect(screen.getByText('Appels manques')).toBeInTheDocument();
        expect(screen.getByText('Notifications systeme')).toBeInTheDocument();
      });
    });

    it('permet de toggler chaque type', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Mentions')).toBeInTheDocument();
      });

      const switches = screen.getAllByRole('switch');
      // Toggler quelques switches
      fireEvent.click(switches[5]); // mentionEnabled

      await waitFor(() => {
        expect(screen.getByText('Enregistrer les modifications')).toBeInTheDocument();
      });
    });
  });

  describe('Ne pas deranger', () => {
    it('affiche la section DND', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Ne pas deranger')).toBeInTheDocument();
        expect(screen.getByText(/Activer "Ne pas deranger"/)).toBeInTheDocument();
      });
    });

    it('affiche les champs de temps quand DND est active', async () => {
      // Modifier les preferences pour avoir DND active
      const prefsWithDnd = {
        ...mockPreferences,
        data: { ...mockPreferences.data, dndEnabled: true },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(prefsWithDnd),
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Heure de debut')).toBeInTheDocument();
        expect(screen.getByLabelText('Heure de fin')).toBeInTheDocument();
      });
    });

    it('cache les champs de temps quand DND est desactive', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.queryByLabelText('Heure de debut')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Heure de fin')).not.toBeInTheDocument();
      });
    });

    it('permet de modifier les heures DND', async () => {
      const prefsWithDnd = {
        ...mockPreferences,
        data: { ...mockPreferences.data, dndEnabled: true },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(prefsWithDnd),
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        const startInput = screen.getByLabelText('Heure de debut');
        fireEvent.change(startInput, { target: { value: '23:00' } });
      });

      expect(screen.getByText('Enregistrer les modifications')).toBeInTheDocument();
    });
  });

  describe('Etat des permissions', () => {
    it('affiche "Autorisees" quand permission granted', async () => {
      (global.Notification as any).permission = 'granted';

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Autorisees')).toBeInTheDocument();
      });
    });

    it('affiche "Refusees" quand permission denied', async () => {
      (global.Notification as any).permission = 'denied';

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Refusees')).toBeInTheDocument();
      });
    });

    it('affiche "En attente" quand permission default', async () => {
      (global.Notification as any).permission = 'default';

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('En attente')).toBeInTheDocument();
      });
    });

    it('affiche un message explicatif quand les notifications sont refusees', async () => {
      (global.Notification as any).permission = 'denied';

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(
          screen.getByText(/Les notifications ont ete refusees/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Sauvegarde des preferences', () => {
    it('affiche le bouton de sauvegarde quand il y a des changements', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      // Pas de bouton initialement
      expect(screen.queryByText('Enregistrer les modifications')).not.toBeInTheDocument();

      // Faire un changement
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // Bouton visible
      expect(screen.getByText('Enregistrer les modifications')).toBeInTheDocument();
    });

    it('sauvegarde les preferences au clic sur Enregistrer', async () => {
      const { toast } = require('sonner');
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      // Faire un changement
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // Cliquer sur Enregistrer
      fireEvent.click(screen.getByText('Enregistrer les modifications'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/me/preferences/notification',
          expect.objectContaining({
            method: 'PUT',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
          })
        );
        expect(toast.success).toHaveBeenCalledWith(
          'Preferences de notifications enregistrees'
        );
      });
    });

    it('affiche "Enregistrement..." pendant la sauvegarde', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        })
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 100))
        );

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Enregistrer les modifications'));

      expect(screen.getByText('Enregistrement...')).toBeInTheDocument();
    });

    it('affiche une erreur si la sauvegarde echoue', async () => {
      const { toast } = require('sonner');
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'Erreur serveur' }),
        });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Enregistrer les modifications'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur serveur');
      });
    });

    it('gere l\'erreur reseau lors de la sauvegarde', async () => {
      const { toast } = require('sonner');
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Enregistrer les modifications'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur reseau');
      });
    });

    it('cache le bouton de sauvegarde apres succes', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPreferences),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Notifications push')).toBeInTheDocument();
      });

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Enregistrer les modifications'));

      await waitFor(() => {
        expect(screen.queryByText('Enregistrer les modifications')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibilite', () => {
    it('les switches ont des labels accessibles', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        const switches = screen.getAllByRole('switch');
        expect(switches.length).toBeGreaterThan(10);
      });
    });

    it('les inputs de temps ont des labels', async () => {
      const prefsWithDnd = {
        ...mockPreferences,
        data: { ...mockPreferences.data, dndEnabled: true },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(prefsWithDnd),
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Heure de debut')).toBeInTheDocument();
        expect(screen.getByLabelText('Heure de fin')).toBeInTheDocument();
      });
    });
  });

  describe('Navigateur sans support Notification', () => {
    it('affiche un message si les notifications ne sont pas supportees', async () => {
      // Simuler l'absence de l'API Notification
      const originalNotification = global.Notification;
      delete (global as any).Notification;

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(
          screen.getByText(/Les notifications ne sont pas supportees/)
        ).toBeInTheDocument();
      });

      // Restaurer
      (global as any).Notification = originalNotification;
    });
  });
});
