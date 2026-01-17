/**
 * Tests pour le composant EncryptionSettings
 * Gere les parametres de chiffrement E2EE
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EncryptionSettings } from '@/components/settings/encryption-settings';

// Mock des hooks i18n
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'encryption.status.title': 'Statut du chiffrement',
        'encryption.status.description': 'Verifiez l\'etat de vos cles de chiffrement',
        'encryption.status.keysActive': 'Cles actives',
        'encryption.status.keysNotGenerated': 'Cles non generees',
        'encryption.status.registrationId': 'ID d\'enregistrement',
        'encryption.status.generateKeys': 'Generez vos cles pour activer le chiffrement',
        'encryption.status.active': 'Actif',
        'encryption.status.inactive': 'Inactif',
        'encryption.status.generating': 'Generation...',
        'encryption.status.generateButton': 'Generer les cles',
        'encryption.status.keysGenerated': 'Cles generees avec succes',
        'encryption.status.lastRotation': 'Derniere rotation',
        'encryption.newConversations.title': 'Nouvelles conversations',
        'encryption.newConversations.description': 'Parametres par defaut pour les nouvelles conversations',
        'encryption.newConversations.defaultEnabled': 'Chiffrement par defaut',
        'encryption.newConversations.defaultEnabledDescription': 'Activer automatiquement le chiffrement',
        'encryption.newConversations.showIndicator': 'Afficher l\'indicateur',
        'encryption.newConversations.showIndicatorDescription': 'Afficher le statut du chiffrement',
        'encryption.newConversations.encryptMedia': 'Chiffrer les medias',
        'encryption.newConversations.encryptMediaDescription': 'Avertir si non chiffre',
        'encryption.level.title': 'Niveau de chiffrement',
        'encryption.level.description': 'Choisissez votre preference de chiffrement',
        'encryption.level.disabled.label': 'Desactive',
        'encryption.level.disabled.description': 'Pas de chiffrement',
        'encryption.level.optional.label': 'Optionnel',
        'encryption.level.optional.description': 'Chiffrement au choix',
        'encryption.level.always.label': 'Toujours',
        'encryption.level.always.description': 'Chiffrement obligatoire',
        'encryption.actions.save': 'Enregistrer',
        'encryption.actions.saving': 'Enregistrement...',
        'encryption.actions.preferencesUpdated': 'Preferences mises a jour',
        'encryption.errors.updateFailed': 'Erreur lors de la mise a jour',
        'encryption.errors.notAuthenticated': 'Non authentifie',
        'encryption.errors.generateFailed': 'Erreur lors de la generation',
        'encryption.errors.networkError': 'Erreur reseau',
        'encryption.about.title': 'A propos du chiffrement',
        'encryption.about.description': 'Vos messages sont proteges',
        'encryption.about.protocol': 'Protocole Signal',
        'encryption.about.features.privateKeys': 'Cles privees',
        'encryption.about.features.uniqueKeys': 'Cles uniques',
        'encryption.about.features.autoRotation': 'Rotation automatique',
        'encryption.loading': 'Chargement...',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
  SoundFeedback: {
    playClick: jest.fn(),
    playSuccess: jest.fn(),
    playToggleOn: jest.fn(),
    playToggleOff: jest.fn(),
  },
}));

// Mock du store
const mockEncryptionData = {
  encryptionPreference: 'optional' as const,
  hasSignalKeys: false,
  signalRegistrationId: null,
  lastKeyRotation: null,
  localSettings: {
    autoEncryptNewConversations: true,
    showEncryptionStatus: true,
    warnOnUnencrypted: false,
  },
};

const mockUpdateEncryption = jest.fn();
const mockUpdateLocalSettings = jest.fn();
const mockSyncEncryption = jest.fn();

jest.mock('@/stores', () => ({
  useUserPreferencesStore: jest.fn((selector) => {
    const state = {
      isLoading: false,
      isInitialized: true,
    };
    return selector(state);
  }),
  useEncryptionPreferences: () => ({
    preferences: mockEncryptionData,
    update: mockUpdateEncryption,
    updateLocalSettings: mockUpdateLocalSettings,
    sync: mockSyncEncryption,
  }),
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

describe('EncryptionSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockEncryptionData.hasSignalKeys = false;
    mockEncryptionData.encryptionPreference = 'optional';
  });

  describe('Etat de chargement', () => {
    it('affiche le loader pendant le chargement', () => {
      const { useUserPreferencesStore } = require('@/stores');
      useUserPreferencesStore.mockImplementation((selector: any) =>
        selector({ isLoading: true, isInitialized: false })
      );

      render(<EncryptionSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('affiche le contenu une fois initialise', () => {
      const { useUserPreferencesStore } = require('@/stores');
      useUserPreferencesStore.mockImplementation((selector: any) =>
        selector({ isLoading: false, isInitialized: true })
      );

      render(<EncryptionSettings />);

      expect(screen.getByText('Statut du chiffrement')).toBeInTheDocument();
    });
  });

  describe('Affichage du statut des cles', () => {
    it('affiche "Cles non generees" quand hasSignalKeys est false', () => {
      render(<EncryptionSettings />);

      expect(screen.getByText('Cles non generees')).toBeInTheDocument();
      expect(screen.getByText('Inactif')).toBeInTheDocument();
    });

    it('affiche le bouton de generation quand pas de cles', () => {
      render(<EncryptionSettings />);

      expect(screen.getByText('Generer les cles')).toBeInTheDocument();
    });

    it('affiche "Cles actives" quand hasSignalKeys est true', () => {
      mockEncryptionData.hasSignalKeys = true;
      mockEncryptionData.signalRegistrationId = 12345;

      render(<EncryptionSettings />);

      expect(screen.getByText('Cles actives')).toBeInTheDocument();
      expect(screen.getByText('Actif')).toBeInTheDocument();
      expect(screen.getByText(/12345/)).toBeInTheDocument();
    });

    it('n\'affiche pas le bouton de generation quand les cles existent', () => {
      mockEncryptionData.hasSignalKeys = true;

      render(<EncryptionSettings />);

      expect(screen.queryByText('Generer les cles')).not.toBeInTheDocument();
    });

    it('affiche la date de derniere rotation si disponible', () => {
      mockEncryptionData.hasSignalKeys = true;
      mockEncryptionData.lastKeyRotation = '2024-01-15T10:30:00Z';

      render(<EncryptionSettings />);

      expect(screen.getByText(/Derniere rotation/)).toBeInTheDocument();
    });
  });

  describe('Generation des cles', () => {
    it('genere les cles quand on clique sur le bouton', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Generer les cles'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/users/me/encryption-keys',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });

      expect(mockSyncEncryption).toHaveBeenCalled();
    });

    it('affiche le loading pendant la generation', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 100))
      );

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Generer les cles'));

      expect(screen.getByText('Generation...')).toBeInTheDocument();
    });

    it('affiche une erreur si la generation echoue', async () => {
      const { toast } = require('sonner');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Erreur serveur' }),
      });

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Generer les cles'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur serveur');
      });
    });

    it('gere l\'erreur reseau', async () => {
      const { toast } = require('sonner');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Generer les cles'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur reseau');
      });
    });
  });

  describe('Parametres des nouvelles conversations', () => {
    it('affiche les toggles de parametres', () => {
      render(<EncryptionSettings />);

      expect(screen.getByText('Chiffrement par defaut')).toBeInTheDocument();
      expect(screen.getByText('Afficher l\'indicateur')).toBeInTheDocument();
      expect(screen.getByText('Chiffrer les medias')).toBeInTheDocument();
    });

    it('met a jour autoEncryptNewConversations quand on toggle', () => {
      render(<EncryptionSettings />);

      // Trouver le switch associe a "Chiffrement par defaut"
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      expect(mockUpdateLocalSettings).toHaveBeenCalledWith({
        autoEncryptNewConversations: false, // Toggle de true a false
      });
    });

    it('met a jour showEncryptionStatus quand on toggle', () => {
      render(<EncryptionSettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[1]);

      expect(mockUpdateLocalSettings).toHaveBeenCalledWith({
        showEncryptionStatus: false,
      });
    });

    it('met a jour warnOnUnencrypted quand on toggle', () => {
      render(<EncryptionSettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[2]);

      expect(mockUpdateLocalSettings).toHaveBeenCalledWith({
        warnOnUnencrypted: true, // Toggle de false a true
      });
    });
  });

  describe('Preference de chiffrement', () => {
    it('affiche les trois options de preference', () => {
      render(<EncryptionSettings />);

      expect(screen.getByText('Desactive')).toBeInTheDocument();
      expect(screen.getByText('Optionnel')).toBeInTheDocument();
      expect(screen.getByText('Toujours')).toBeInTheDocument();
    });

    it('selectionne l\'option actuelle', () => {
      render(<EncryptionSettings />);

      // L'option "optional" devrait etre selectionnee
      const optionalButton = screen.getByText('Optionnel').closest('button');
      expect(optionalButton).toHaveClass('border-primary');
    });

    it('change la selection quand on clique sur une option', () => {
      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Toujours'));

      // Le bouton Enregistrer devrait apparaitre
      expect(screen.getByText('Enregistrer')).toBeInTheDocument();
    });

    it('affiche le bouton Enregistrer seulement quand il y a des changements', () => {
      render(<EncryptionSettings />);

      // Pas de bouton Enregistrer initialement
      expect(screen.queryByText('Enregistrer')).not.toBeInTheDocument();

      // Changer la preference
      fireEvent.click(screen.getByText('Desactive'));

      // Maintenant le bouton devrait apparaitre
      expect(screen.getByText('Enregistrer')).toBeInTheDocument();
    });

    it('sauvegarde la preference quand on clique sur Enregistrer', async () => {
      const { toast } = require('sonner');
      mockUpdateEncryption.mockResolvedValueOnce(undefined);

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Toujours'));
      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(mockUpdateEncryption).toHaveBeenCalledWith({
          encryptionPreference: 'always',
        });
        expect(toast.success).toHaveBeenCalledWith('Preferences mises a jour');
      });
    });

    it('affiche une erreur si la sauvegarde echoue', async () => {
      const { toast } = require('sonner');
      mockUpdateEncryption.mockRejectedValueOnce(new Error('Save failed'));

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Toujours'));
      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur lors de la mise a jour');
      });
    });

    it('affiche "Enregistrement..." pendant la sauvegarde', async () => {
      mockUpdateEncryption.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Toujours'));
      fireEvent.click(screen.getByText('Enregistrer'));

      expect(screen.getByText('Enregistrement...')).toBeInTheDocument();
    });
  });

  describe('Section A propos', () => {
    it('affiche les informations sur le chiffrement', () => {
      render(<EncryptionSettings />);

      expect(screen.getByText('A propos du chiffrement')).toBeInTheDocument();
      expect(screen.getByText('Cles privees')).toBeInTheDocument();
      expect(screen.getByText('Cles uniques')).toBeInTheDocument();
      expect(screen.getByText('Rotation automatique')).toBeInTheDocument();
    });
  });

  describe('Accessibilite', () => {
    it('les switches ont des labels accessibles', () => {
      render(<EncryptionSettings />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThanOrEqual(3);
    });

    it('les boutons de preference sont accessibles', () => {
      render(<EncryptionSettings />);

      const preferenceButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent?.includes('Desactive') ||
                        btn.textContent?.includes('Optionnel') ||
                        btn.textContent?.includes('Toujours'));

      expect(preferenceButtons.length).toBe(3);
    });
  });

  describe('Authentification', () => {
    it('affiche une erreur si non authentifie', async () => {
      const { toast } = require('sonner');
      const { authManager } = require('@/services/auth-manager.service');
      authManager.getAuthToken = () => null;

      render(<EncryptionSettings />);

      fireEvent.click(screen.getByText('Generer les cles'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Non authentifie');
      });

      // Restaurer le mock
      authManager.getAuthToken = () => 'test-token';
    });
  });
});
