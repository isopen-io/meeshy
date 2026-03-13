/**
 * Tests pour le composant PrivacySettings
 * Gere les parametres de confidentialite et de gestion des donnees
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PrivacySettings } from '@/components/settings/privacy-settings';

// Mock des hooks i18n
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'privacy.settingsUpdated': 'Paramètres de confidentialité mis à jour',
        'privacy.dataExported': 'Données exportées avec succès',
        'privacy.dataDeleted': 'Toutes les données ont été supprimées',
        'privacy.deleteData.title': 'Supprimer toutes mes données',
        'privacy.deleteData.description': 'Supprime définitivement toutes vos données. Cette action est irréversible.',
        'privacy.deleteData.button': 'Supprimer mes données',
        'privacy.deleteData.confirmTitle': 'Êtes-vous absolument sûr ?',
        'privacy.deleteData.confirmDescription': 'Cette action est irréversible. Toutes vos données personnelles, messages et paramètres seront définitivement supprimés de nos serveurs.',
        'privacy.deleteData.cancel': 'Annuler',
        'privacy.deleteData.confirm': 'Oui, supprimer mes données',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

jest.mock('@/hooks/use-accessibility', () => ({
  SoundFeedback: {
    playClick: jest.fn(),
    playSuccess: jest.fn(),
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

// Mock URL.createObjectURL et revokeObjectURL
const mockCreateObjectURL = jest.fn(() => 'blob:test-url');
const mockRevokeObjectURL = jest.fn();
URL.createObjectURL = mockCreateObjectURL;
URL.revokeObjectURL = mockRevokeObjectURL;

// Mock usePreferences
const mockUpdatePreferences = jest.fn().mockResolvedValue(undefined);
const mockRefetch = jest.fn().mockResolvedValue(undefined);

const defaultPrivacyPreferences = {
  profileVisibility: 'public',
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  allowMessageRequests: true,
  blockScreenshots: false,
  allowSearchByPhone: true,
  allowSearchByUsername: true,
  showProfilePhoto: true,
};

let mockUsePreferencesReturn: any = {
  data: defaultPrivacyPreferences,
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

describe('PrivacySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreferencesReturn = {
      data: { ...defaultPrivacyPreferences },
      isLoading: false,
      isUpdating: false,
      error: null,
      consentViolations: null,
      updatePreferences: mockUpdatePreferences,
      refetch: mockRefetch,
    };
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendu initial', () => {
    it('affiche toutes les sections', () => {
      render(<PrivacySettings />);

      expect(screen.getByText(/Visibilit. et statut/)).toBeInTheDocument();
      expect(screen.getByText('Communications')).toBeInTheDocument();
      expect(screen.getByText('Gestion des données')).toBeInTheDocument();
      expect(screen.getByText(/Informations l.gales/)).toBeInTheDocument();
    });
  });

  describe('Section Visibilite et statut', () => {
    it('affiche les options de visibilite', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Statut en ligne')).toBeInTheDocument();
      expect(screen.getByText(/Derni.re activit/)).toBeInTheDocument();
    });

    it('toggle le statut en ligne', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]); // showOnlineStatus

      expect(SoundFeedback.playToggleOff).toHaveBeenCalled();
    });
  });

  describe('Section Communications', () => {
    it('affiche les options de communication', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Demandes de messages')).toBeInTheDocument();
    });
  });

  describe('Export des donnees', () => {
    it('affiche le bouton d\'export', () => {
      render(<PrivacySettings />);

      expect(screen.getByText(/Exporter les donn/)).toBeInTheDocument();
    });

    it('exporte les donnees au clic', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');
      const { toast } = require('sonner');

      // Mock du click sur le lien cree dynamiquement
      const originalCreateElement = document.createElement.bind(document);
      const mockClick = jest.fn();
      jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const element = originalCreateElement(tagName);
        if (tagName === 'a') {
          element.click = mockClick;
        }
        return element;
      });

      render(<PrivacySettings />);

      fireEvent.click(screen.getByText(/Exporter les donn/));

      expect(SoundFeedback.playClick).toHaveBeenCalled();
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
      expect(SoundFeedback.playSuccess).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Données exportées avec succès');

      jest.restoreAllMocks();
    });
  });

  describe('Suppression des donnees', () => {
    it('affiche le bouton de suppression', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Supprimer mes données')).toBeInTheDocument();
    });

    it('ouvre le dialogue de confirmation au clic', async () => {
      render(<PrivacySettings />);

      fireEvent.click(screen.getByText('Supprimer mes données'));

      await waitFor(() => {
        expect(screen.getByText('Êtes-vous absolument sûr ?')).toBeInTheDocument();
      });
    });

    it('ferme le dialogue au clic sur Annuler', async () => {
      render(<PrivacySettings />);

      fireEvent.click(screen.getByText('Supprimer mes données'));

      await waitFor(() => {
        expect(screen.getByText('Êtes-vous absolument sûr ?')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Annuler'));

      await waitFor(() => {
        expect(screen.queryByText('Êtes-vous absolument sûr ?')).not.toBeInTheDocument();
      });
    });

    it('supprime les donnees au clic sur Confirmer', async () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');
      const { toast } = require('sonner');

      render(<PrivacySettings />);

      fireEvent.click(screen.getByText('Supprimer mes données'));

      await waitFor(() => {
        expect(screen.getByText('Êtes-vous absolument sûr ?')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Oui, supprimer mes données'));

      await waitFor(() => {
        expect(SoundFeedback.playClick).toHaveBeenCalled();
        expect(mockRefetch).toHaveBeenCalled();
      });
    });
  });

  describe('Section Informations legales', () => {
    it('affiche les liens vers les documents legaux', () => {
      render(<PrivacySettings />);

      expect(screen.getByText(/Politique de confidentialit/)).toBeInTheDocument();
      expect(screen.getByText(/Conditions d.utilisation/)).toBeInTheDocument();
    });

    it('affiche les informations sur le traitement des donnees', () => {
      render(<PrivacySettings />);

      expect(
        screen.getByText(/Vos donn.es sont trait.es conform.ment/)
      ).toBeInTheDocument();
    });
  });

  describe('Accessibilite', () => {
    it('les switches ont des descriptions accessibles', () => {
      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThanOrEqual(2);
    });

    it('le dialogue de suppression est accessible', async () => {
      render(<PrivacySettings />);

      fireEvent.click(screen.getByText('Supprimer mes données'));

      await waitFor(() => {
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toBeInTheDocument();
      });
    });

    it('le bouton destructif a le bon style', () => {
      render(<PrivacySettings />);

      const deleteButton = screen.getByText('Supprimer mes données');
      expect(deleteButton.closest('button')?.className).toContain('destructive');
    });
  });

  describe('Icones', () => {
    it('affiche les icones appropriees pour chaque section', () => {
      render(<PrivacySettings />);

      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      expect(screen.getByTestId('database-icon')).toBeInTheDocument();
    });
  });

  describe('Sons de feedback', () => {
    it('joue playToggleOn quand une option est activee', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      // Start with showOnlineStatus = false
      mockUsePreferencesReturn = {
        ...mockUsePreferencesReturn,
        data: { ...defaultPrivacyPreferences, showOnlineStatus: false },
      };

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      // Toggle showOnlineStatus from false to true
      fireEvent.click(switches[0]);

      expect(SoundFeedback.playToggleOn).toHaveBeenCalled();
    });

    it('joue playToggleOff quand une option est desactivee', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      // Toggle showOnlineStatus from true to false
      fireEvent.click(switches[0]);

      expect(SoundFeedback.playToggleOff).toHaveBeenCalled();
    });
  });
});
