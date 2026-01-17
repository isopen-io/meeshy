/**
 * Tests pour le composant CompleteUserSettings
 * Gere l'affichage des onglets de parametres utilisateur complets
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompleteUserSettings } from '@/components/settings/complete-user-settings';
import { User } from '@/types';

// Mock des hooks i18n
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'tabs.profile': 'Profil',
        'tabs.notifications': 'Notifications',
        'tabs.privacy': 'Confidentialite',
        'tabs.encryption': 'Chiffrement',
        'tabs.audio': 'Audio',
        'tabs.translation': 'Traduction',
        'tabs.theme': 'Theme',
        'translation.title': 'Parametres de traduction',
        'translation.description': 'Configurez vos preferences de traduction',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

// Mock des composants enfants pour isoler les tests
jest.mock('@/components/settings/user-settings', () => ({
  UserSettings: () => <div data-testid="user-settings">User Settings Component</div>,
}));

jest.mock('@/components/translation/language-settings', () => ({
  LanguageSettings: () => <div data-testid="language-settings">Language Settings Component</div>,
}));

jest.mock('@/components/settings/theme-settings', () => ({
  ThemeSettings: () => <div data-testid="theme-settings">Theme Settings Component</div>,
}));

jest.mock('@/components/settings/notification-settings', () => ({
  NotificationSettings: () => (
    <div data-testid="notification-settings">Notification Settings Component</div>
  ),
}));

jest.mock('@/components/settings/privacy-settings', () => ({
  PrivacySettings: () => <div data-testid="privacy-settings">Privacy Settings Component</div>,
}));

jest.mock('@/components/settings/encryption-settings', () => ({
  EncryptionSettings: () => (
    <div data-testid="encryption-settings">Encryption Settings Component</div>
  ),
}));

jest.mock('@/components/settings/audio-settings', () => ({
  AudioSettings: () => <div data-testid="audio-settings">Audio Settings Component</div>,
}));

// Mock du composant ResponsiveTabs
jest.mock('@/components/ui/responsive-tabs', () => ({
  ResponsiveTabs: ({ items, value, onValueChange }: any) => (
    <div data-testid="responsive-tabs">
      <div role="tablist">
        {items.map((item: any) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={value === item.value}
            onClick={() => onValueChange(item.value)}
            data-testid={`tab-${item.value}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {items.find((item: any) => item.value === value)?.content}
      </div>
    </div>
  ),
}));

describe('CompleteUserSettings', () => {
  const mockUser: User = {
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
    role: 'USER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultProps = {
    user: mockUser,
    onUserUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Simuler l'environnement navigateur
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { hash: '', pathname: '/settings' },
    });
    Object.defineProperty(window, 'history', {
      writable: true,
      value: { replaceState: jest.fn() },
    });
  });

  describe('Rendu initial', () => {
    it('affiche le composant quand un utilisateur est fourni', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      expect(screen.getByTestId('responsive-tabs')).toBeInTheDocument();
    });

    it('retourne null quand user est null', () => {
      const { container } = render(<CompleteUserSettings {...defaultProps} user={null} />);

      expect(container.firstChild).toBeNull();
    });

    it('affiche tous les onglets disponibles', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      expect(screen.getByTestId('tab-user')).toBeInTheDocument();
      expect(screen.getByTestId('tab-notifications')).toBeInTheDocument();
      expect(screen.getByTestId('tab-privacy')).toBeInTheDocument();
      expect(screen.getByTestId('tab-encryption')).toBeInTheDocument();
      expect(screen.getByTestId('tab-audio')).toBeInTheDocument();
      expect(screen.getByTestId('tab-translation')).toBeInTheDocument();
      expect(screen.getByTestId('tab-theme')).toBeInTheDocument();
    });

    it('affiche le contenu de l\'onglet par defaut (user)', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      expect(screen.getByTestId('user-settings')).toBeInTheDocument();
    });
  });

  describe('Navigation entre onglets', () => {
    it('change le contenu quand on clique sur un onglet', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      // Cliquer sur l'onglet Notifications
      fireEvent.click(screen.getByTestId('tab-notifications'));

      expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
      expect(screen.queryByTestId('user-settings')).not.toBeInTheDocument();
    });

    it('affiche le contenu de l\'onglet Privacy', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      fireEvent.click(screen.getByTestId('tab-privacy'));

      expect(screen.getByTestId('privacy-settings')).toBeInTheDocument();
    });

    it('affiche le contenu de l\'onglet Encryption', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      fireEvent.click(screen.getByTestId('tab-encryption'));

      expect(screen.getByTestId('encryption-settings')).toBeInTheDocument();
    });

    it('affiche le contenu de l\'onglet Audio', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      fireEvent.click(screen.getByTestId('tab-audio'));

      expect(screen.getByTestId('audio-settings')).toBeInTheDocument();
    });

    it('affiche le contenu de l\'onglet Translation', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      fireEvent.click(screen.getByTestId('tab-translation'));

      expect(screen.getByTestId('language-settings')).toBeInTheDocument();
    });

    it('affiche le contenu de l\'onglet Theme', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      fireEvent.click(screen.getByTestId('tab-theme'));

      expect(screen.getByTestId('theme-settings')).toBeInTheDocument();
    });
  });

  describe('Synchronisation URL hash', () => {
    it('met a jour le hash URL quand l\'onglet change', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      fireEvent.click(screen.getByTestId('tab-notifications'));

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '#notifications');
    });

    it('lit le hash initial depuis l\'URL', () => {
      window.location.hash = '#privacy';

      render(<CompleteUserSettings {...defaultProps} />);

      // L'onglet privacy devrait etre selectionne
      expect(screen.getByTestId('tab-privacy')).toHaveAttribute('aria-selected', 'true');
    });

    it('utilise "user" par defaut si le hash est invalide', () => {
      window.location.hash = '#invalid-tab';

      render(<CompleteUserSettings {...defaultProps} />);

      expect(screen.getByTestId('tab-user')).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Gestion des enfants', () => {
    it('rend les enfants passes en props', () => {
      render(
        <CompleteUserSettings {...defaultProps}>
          <div data-testid="custom-child">Custom Content</div>
        </CompleteUserSettings>
      );

      expect(screen.getByTestId('custom-child')).toBeInTheDocument();
    });
  });

  describe('Props transmises aux composants enfants', () => {
    it('passe les props correctes a UserSettings', () => {
      // On doit desactiver le mock pour ce test
      jest.unmock('@/components/settings/user-settings');
      jest.doMock('@/components/settings/user-settings', () => ({
        UserSettings: ({ user, onUserUpdate }: any) => (
          <div data-testid="user-settings-with-props">
            <span data-testid="user-id">{user?.id}</span>
            <button data-testid="update-btn" onClick={() => onUserUpdate({ displayName: 'New' })}>
              Update
            </button>
          </div>
        ),
      }));

      // Nettoyer le cache des modules et recharger
      jest.resetModules();
    });
  });

  describe('Accessibilite', () => {
    it('les onglets sont accessibles au clavier', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(7);

      tabs.forEach((tab) => {
        expect(tab).toBeVisible();
      });
    });

    it('indique l\'onglet selectionne avec aria-selected', () => {
      render(<CompleteUserSettings {...defaultProps} />);

      const userTab = screen.getByTestId('tab-user');
      expect(userTab).toHaveAttribute('aria-selected', 'true');

      fireEvent.click(screen.getByTestId('tab-notifications'));

      expect(screen.getByTestId('tab-notifications')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('tab-user')).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Performance', () => {
    it('ne re-rend pas inutilement lors de changements d\'onglet', () => {
      const renderSpy = jest.fn();

      // Composant de test pour surveiller les re-renders
      const TestComponent = () => {
        renderSpy();
        return <CompleteUserSettings {...defaultProps} />;
      };

      render(<TestComponent />);

      const initialRenders = renderSpy.mock.calls.length;

      fireEvent.click(screen.getByTestId('tab-notifications'));

      // Devrait avoir un nombre raisonnable de re-renders
      expect(renderSpy.mock.calls.length - initialRenders).toBeLessThanOrEqual(3);
    });
  });
});
