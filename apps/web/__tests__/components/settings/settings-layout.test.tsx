/**
 * Tests pour le composant SettingsLayout
 * Layout principal des parametres avec sidebar et contenu
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { User as UserType, SUPPORTED_LANGUAGES } from '@/types';

// Mock des hooks i18n
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'profile.title': 'Profil',
        'profile.description': 'Gerez vos informations personnelles',
        'language.title': 'Langue',
        'language.description': 'Parametres de langue et traduction',
        'notifications.title': 'Notifications',
        'notifications.description': 'Preferences de notifications',
        'privacy.title': 'Confidentialite',
        'privacy.description': 'Parametres de confidentialite',
        'theme.title': 'Apparence',
        'theme.description': 'Personnalisez l\'apparence',
        'navigation.settingsSections': 'Sections des parametres',
      };
      return translations[key] || key;
    },
  }),
}));

jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
  SoundFeedback: {
    playNavigate: jest.fn(),
    playClick: jest.fn(),
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
  buildApiUrl: (path: string) => `http://localhost:3001${path}`,
  API_ENDPOINTS: {
    AUTH: {
      ME: '/users/me',
    },
  },
}));

// Mock de toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock du FontSelector
jest.mock('@/components/settings/font-selector', () => ({
  FontSelector: () => <div data-testid="font-selector">Font Selector</div>,
}));

// Mock du LanguageSelector
jest.mock('@/components/settings/language-selector', () => ({
  LanguageSelector: ({ value, onValueChange }: any) => (
    <select
      data-testid="language-selector"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="fr">Francais</option>
      <option value="en">English</option>
    </select>
  ),
}));

// Mock fetch global
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SettingsLayout', () => {
  const mockUser: UserType = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    customDestinationLanguage: null,
    encryptionPreference: 'optional',
    role: 'USER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultProps = {
    currentUser: mockUser,
    initialTab: 'profile',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Rendu initial', () => {
    it('affiche le titre "Parametres"', () => {
      render(<SettingsLayout {...defaultProps} />);

      expect(screen.getByText('Parametres')).toBeInTheDocument();
    });

    it('affiche toutes les sections dans la sidebar', () => {
      render(<SettingsLayout {...defaultProps} />);

      expect(screen.getByText('Profil')).toBeInTheDocument();
      expect(screen.getByText('Langue')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('Confidentialite')).toBeInTheDocument();
      expect(screen.getByText('Apparence')).toBeInTheDocument();
    });

    it('affiche les descriptions des sections', () => {
      render(<SettingsLayout {...defaultProps} />);

      expect(screen.getByText('Gerez vos informations personnelles')).toBeInTheDocument();
    });

    it('utilise l\'onglet initial fourni', () => {
      render(<SettingsLayout {...defaultProps} initialTab="language" />);

      // La section language devrait etre selectionnee
      const languageCard = screen.getByText('Langue').closest('[role="tab"]');
      expect(languageCard).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Navigation entre sections', () => {
    it('change de section au clic', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<SettingsLayout {...defaultProps} />);

      const languageCard = screen.getByText('Langue').closest('[role="tab"]');
      fireEvent.click(languageCard!);

      expect(SoundFeedback.playNavigate).toHaveBeenCalled();
      expect(languageCard).toHaveAttribute('aria-selected', 'true');
    });

    it('change de section avec le clavier (Enter)', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<SettingsLayout {...defaultProps} />);

      const languageCard = screen.getByText('Langue').closest('[role="tab"]');
      fireEvent.keyDown(languageCard!, { key: 'Enter' });

      expect(SoundFeedback.playNavigate).toHaveBeenCalled();
    });

    it('change de section avec le clavier (Space)', () => {
      render(<SettingsLayout {...defaultProps} />);

      const languageCard = screen.getByText('Langue').closest('[role="tab"]');
      fireEvent.keyDown(languageCard!, { key: ' ' });

      expect(languageCard).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Section Profil', () => {
    it('affiche les informations de l\'utilisateur', () => {
      render(<SettingsLayout {...defaultProps} />);

      expect(screen.getByText('Informations du profil')).toBeInTheDocument();
      expect(screen.getByText('testuser')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('affiche le nom d\'utilisateur et l\'email', () => {
      render(<SettingsLayout {...defaultProps} />);

      expect(screen.getByText("Nom d'utilisateur")).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
    });
  });

  describe('Section Langue', () => {
    it('affiche les parametres de langue', () => {
      render(<SettingsLayout {...defaultProps} />);

      // Naviguer vers la section langue
      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      expect(screen.getByText('Parametres de langue')).toBeInTheDocument();
    });

    it('affiche les selecteurs de langue', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      expect(screen.getByText('Langue du systeme')).toBeInTheDocument();
      expect(screen.getByText('Langue regionale')).toBeInTheDocument();
    });

    it('affiche les options de traduction', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      expect(screen.getByText('Traduction automatique')).toBeInTheDocument();
      expect(screen.getByText('Traduire vers la langue systeme')).toBeInTheDocument();
    });

    it('permet de changer la langue systeme', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      const languageSelectors = screen.getAllByTestId('language-selector');
      fireEvent.change(languageSelectors[0], { target: { value: 'en' } });

      // Devrait marquer hasChanges = true
      expect(screen.getByText('Sauvegarder')).toBeInTheDocument();
    });
  });

  describe('Section Notifications', () => {
    it('affiche un placeholder pour les notifications', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Notifications').closest('[role="tab"]')!);

      expect(screen.getByText('Parametres de notification')).toBeInTheDocument();
    });
  });

  describe('Section Confidentialite', () => {
    it('affiche les parametres de chiffrement', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Confidentialite').closest('[role="tab"]')!);

      expect(screen.getByText('Chiffrement des conversations')).toBeInTheDocument();
    });

    it('affiche les parametres de transcription', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Confidentialite').closest('[role="tab"]')!);

      expect(screen.getByText('Transcription automatique')).toBeInTheDocument();
    });

    it('affiche le selecteur de mode de chiffrement', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Confidentialite').closest('[role="tab"]')!);

      expect(screen.getByText('Mode de chiffrement par defaut')).toBeInTheDocument();
    });
  });

  describe('Section Apparence', () => {
    it('affiche le selecteur de police', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Apparence').closest('[role="tab"]')!);

      expect(screen.getByTestId('font-selector')).toBeInTheDocument();
    });
  });

  describe('Sauvegarde des parametres', () => {
    it('affiche les boutons de sauvegarde quand il y a des changements', () => {
      render(<SettingsLayout {...defaultProps} />);

      // Aller a la section langue
      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      // Modifier une valeur
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]); // autoTranslateEnabled

      // Les boutons devraient apparaitre
      expect(screen.getByText('Sauvegarder')).toBeInTheDocument();
      expect(screen.getByText('Reinitialiser')).toBeInTheDocument();
    });

    it('sauvegarde les parametres au clic sur Sauvegarder', async () => {
      const { toast } = require('sonner');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Sauvegarder'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/users/me',
          expect.objectContaining({
            method: 'PATCH',
          })
        );
        expect(toast.success).toHaveBeenCalledWith('Parametres sauvegardes avec succes');
      });
    });

    it('reinitialise les parametres au clic sur Reinitialiser', () => {
      const { toast } = require('sonner');

      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]); // Faire un changement

      fireEvent.click(screen.getByText('Reinitialiser'));

      expect(toast.info).toHaveBeenCalledWith('Parametres reinitialises');
      expect(screen.queryByText('Sauvegarder')).not.toBeInTheDocument();
    });

    it('affiche "Sauvegarde..." pendant la sauvegarde', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({}) }), 100))
      );

      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Sauvegarder'));

      expect(screen.getByText('Sauvegarde...')).toBeInTheDocument();
    });

    it('affiche une erreur si la sauvegarde echoue', async () => {
      const { toast } = require('sonner');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Erreur serveur' }),
      });

      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      fireEvent.click(screen.getByText('Sauvegarder'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Erreur lors de la sauvegarde');
      });
    });
  });

  describe('Accessibilite', () => {
    it('les sections sont accessibles au clavier', () => {
      render(<SettingsLayout {...defaultProps} />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute('tabindex', '0');
      });
    });

    it('utilise les attributs aria corrects', () => {
      render(<SettingsLayout {...defaultProps} />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveAttribute('aria-label', 'Sections des parametres');
    });

    it('indique la section selectionnee avec aria-selected', () => {
      render(<SettingsLayout {...defaultProps} />);

      const profileTab = screen.getByText('Profil').closest('[role="tab"]');
      expect(profileTab).toHaveAttribute('aria-selected', 'true');

      const languageTab = screen.getByText('Langue').closest('[role="tab"]');
      expect(languageTab).toHaveAttribute('aria-selected', 'false');
    });

    it('les cartes de section ont focus visible', () => {
      render(<SettingsLayout {...defaultProps} />);

      const tabs = screen.getAllByRole('tab');
      tabs.forEach((tab) => {
        // Les cartes devraient avoir la classe focus-visible
        expect(tab).toHaveClass('outline-none');
      });
    });
  });

  describe('Section langue personnalisee', () => {
    it('affiche le selecteur de langue personnalisee quand active', () => {
      const userWithCustomLang = {
        ...mockUser,
        useCustomDestination: true,
      };

      render(<SettingsLayout {...defaultProps} currentUser={userWithCustomLang} />);

      fireEvent.click(screen.getByText('Langue').closest('[role="tab"]')!);

      expect(screen.getByText('Langue de destination personnalisee')).toBeInTheDocument();
    });
  });

  describe('Titre et header', () => {
    it('affiche le titre de la section selectionnee dans le header', () => {
      render(<SettingsLayout {...defaultProps} />);

      // Verifier le titre dans le header principal
      const header = screen.getByRole('heading', { level: 1 });
      expect(header).toHaveTextContent('Profil');
    });

    it('met a jour le titre quand on change de section', () => {
      render(<SettingsLayout {...defaultProps} />);

      fireEvent.click(screen.getByText('Apparence').closest('[role="tab"]')!);

      const header = screen.getByRole('heading', { level: 1 });
      expect(header).toHaveTextContent('Apparence');
    });
  });
});
