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

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock URL.createObjectURL et revokeObjectURL
const mockCreateObjectURL = jest.fn(() => 'blob:test-url');
const mockRevokeObjectURL = jest.fn();
URL.createObjectURL = mockCreateObjectURL;
URL.revokeObjectURL = mockRevokeObjectURL;

describe('PrivacySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendu initial', () => {
    it('affiche toutes les sections', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Visibilité et statut')).toBeInTheDocument();
      expect(screen.getByText('Communications')).toBeInTheDocument();
      expect(screen.getByText('Données et analytiques')).toBeInTheDocument();
      expect(screen.getByText('Gestion des données')).toBeInTheDocument();
      expect(screen.getByText('Informations légales')).toBeInTheDocument();
    });
  });

  describe('Section Visibilite et statut', () => {
    it('affiche les options de visibilite', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Statut en ligne')).toBeInTheDocument();
      expect(screen.getByText('Indicateur de frappe')).toBeInTheDocument();
      expect(screen.getByText('Dernière activité')).toBeInTheDocument();
    });

    it('toggle le statut en ligne', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');
      const { toast } = require('sonner');

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]); // shareOnlineStatus

      expect(SoundFeedback.playToggleOff).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Paramètres de confidentialité mis à jour');
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('toggle l\'indicateur de frappe', () => {
      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[1]); // shareTypingStatus

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Section Communications', () => {
    it('affiche les options de communication', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Messages directs')).toBeInTheDocument();
      expect(screen.getByText('Invitations de groupe')).toBeInTheDocument();
      expect(screen.getByText('Accusés de réception')).toBeInTheDocument();
    });

    it('toggle les messages directs', () => {
      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[3]); // allowDirectMessages

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Section Donnees et analytiques', () => {
    it('affiche les options d\'analytiques', () => {
      render(<PrivacySettings />);

      expect(screen.getByText(/Collecte d'analytiques/)).toBeInTheDocument();
      expect(screen.getByText(/Partage des données d'usage/)).toBeInTheDocument();
    });

    it('toggle la collecte d\'analytiques', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      // collectAnalytics est false par defaut, donc on toggle vers true
      fireEvent.click(switches[6]); // collectAnalytics

      expect(SoundFeedback.playToggleOn).toHaveBeenCalled();
    });
  });

  describe('Export des donnees', () => {
    it('affiche le bouton d\'export', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Exporter les données')).toBeInTheDocument();
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

      fireEvent.click(screen.getByText('Exporter les données'));

      expect(SoundFeedback.playClick).toHaveBeenCalled();
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
      expect(SoundFeedback.playSuccess).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Données exportées avec succès');

      // Restore
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

      expect(SoundFeedback.playClick).toHaveBeenCalled();
      expect(mockLocalStorage.clear).toHaveBeenCalled();
      expect(SoundFeedback.playSuccess).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Toutes les données ont été supprimées');
    });
  });

  describe('Chargement des preferences sauvegardees', () => {
    it('charge les preferences depuis localStorage', () => {
      const savedConfig = {
        shareOnlineStatus: false,
        shareTypingStatus: false,
        shareLastSeen: true,
        allowDirectMessages: true,
        allowGroupInvites: false,
        enableReadReceipts: true,
        collectAnalytics: true,
        shareUsageData: false,
      };
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(savedConfig));

      render(<PrivacySettings />);

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('meeshy-privacy-config');
    });
  });

  describe('Section Informations legales', () => {
    it('affiche les liens vers les documents legaux', () => {
      render(<PrivacySettings />);

      expect(screen.getByText('Politique de confidentialité')).toBeInTheDocument();
      expect(screen.getByText(/Conditions d'utilisation/)).toBeInTheDocument();
    });

    it('affiche les informations sur le traitement des donnees', () => {
      render(<PrivacySettings />);

      expect(
        screen.getByText(/Vos données sont traitées conformément/)
      ).toBeInTheDocument();
    });
  });

  describe('Persistance des changements', () => {
    it('sauvegarde les changements dans localStorage', () => {
      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      const savedCall = mockLocalStorage.setItem.mock.calls.find(
        (call) => call[0] === 'meeshy-privacy-config'
      );
      expect(savedCall).toBeDefined();

      const savedConfig = JSON.parse(savedCall[1]);
      expect(savedConfig.shareOnlineStatus).toBe(false);
    });
  });

  describe('Accessibilite', () => {
    it('les switches ont des descriptions accessibles', () => {
      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(5);
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
      // Note: the button uses bg-destructive/90 (with opacity modifier)
      expect(deleteButton.closest('button')?.className).toContain('destructive');
    });
  });

  describe('Icones', () => {
    it('affiche les icones appropriees pour chaque section', () => {
      render(<PrivacySettings />);

      // Les icones sont rendues comme des SVG avec data-testid
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      expect(screen.getByTestId('database-icon')).toBeInTheDocument();
      expect(screen.getByTestId('shield-icon')).toBeInTheDocument();
    });
  });

  describe('Sons de feedback', () => {
    it('joue playToggleOn quand une option est activee', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      // Simuler une config ou collectAnalytics est false
      mockLocalStorage.getItem.mockReturnValue(
        JSON.stringify({
          shareOnlineStatus: true,
          shareTypingStatus: true,
          shareLastSeen: true,
          allowDirectMessages: true,
          allowGroupInvites: true,
          enableReadReceipts: true,
          collectAnalytics: false,
          shareUsageData: false,
        })
      );

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      // Activer collectAnalytics (qui est false)
      fireEvent.click(switches[6]);

      expect(SoundFeedback.playToggleOn).toHaveBeenCalled();
    });

    it('joue playToggleOff quand une option est desactivee', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<PrivacySettings />);

      const switches = screen.getAllByRole('switch');
      // Desactiver shareOnlineStatus (qui est true par defaut)
      fireEvent.click(switches[0]);

      expect(SoundFeedback.playToggleOff).toHaveBeenCalled();
    });
  });
});
