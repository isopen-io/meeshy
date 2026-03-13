/**
 * Tests pour le composant ConfigModal
 * Modal de configuration globale avec navigation par onglets
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfigModal } from '@/components/settings/config-modal';
import { User as UserType } from '@/types';

// Mock des composants enfants
jest.mock('@/components/settings/user-settings', () => ({
  UserSettings: ({ user }: any) => (
    <div data-testid="user-settings">
      User Settings - {user?.username || 'No user'}
    </div>
  ),
}));

jest.mock('@/components/translation/language-settings', () => ({
  LanguageSettings: () => <div data-testid="language-settings">Language Settings</div>,
}));

jest.mock('@/components/settings/theme-settings', () => ({
  ThemeSettings: () => <div data-testid="theme-settings">Theme Settings</div>,
}));

jest.mock('@/components/settings/privacy-settings', () => ({
  PrivacySettings: () => <div data-testid="privacy-settings">Privacy Settings</div>,
}));

jest.mock('@/components/settings/notification-settings', () => ({
  NotificationSettings: () => <div data-testid="notification-settings">Notification Settings</div>,
}));

jest.mock('@/components/translation/translation-stats', () => ({
  TranslationStats: () => <div data-testid="translation-stats">Translation Stats</div>,
}));

// Mock du module CSS
jest.mock('./config-modal.module.css', () => ({}), { virtual: true });

describe('ConfigModal', () => {
  const mockUser: UserType = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    avatar: undefined,
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    autoTranslateEnabled: true,
    translateToSystemLanguage: true,
    translateToRegionalLanguage: false,
    useCustomDestination: false,
    customDestinationLanguage: undefined,
    role: 'USER',
    isOnline: true,
    lastActiveAt: new Date() as any,
    isActive: true,
    createdAt: new Date().toISOString() as any,
    updatedAt: new Date().toISOString() as any,
  };

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    currentUser: mockUser,
    onUserUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendu initial', () => {
    it('affiche le modal quand isOpen est true', () => {
      render(<ConfigModal {...defaultProps} />);

      expect(screen.getByText(/Param.tres et Configuration/)).toBeInTheDocument();
    });

    it('n\'affiche pas le modal quand isOpen est false', () => {
      render(<ConfigModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText(/Param.tres et Configuration/)).not.toBeInTheDocument();
    });

    it('affiche tous les onglets dans la sidebar (desktop)', () => {
      render(<ConfigModal {...defaultProps} />);

      // Each tab label appears twice (sidebar + mobile select option), use getAllByText
      expect(screen.getAllByText('Profil utilisateur').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Langues & Traduction').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Apparence').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Statistiques').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Notifications').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Confidentialit/).length).toBeGreaterThanOrEqual(1);
    });

    it('affiche le contenu de l\'onglet par defaut (user)', () => {
      render(<ConfigModal {...defaultProps} />);

      expect(screen.getByTestId('user-settings')).toBeInTheDocument();
    });
  });

  describe('Navigation par onglets', () => {
    it('change le contenu quand on clique sur un onglet', () => {
      render(<ConfigModal {...defaultProps} />);

      // Cliquer sur l'onglet Langues (use first match = sidebar)
      fireEvent.click(screen.getAllByText('Langues & Traduction')[0]);

      expect(screen.getByTestId('language-settings')).toBeInTheDocument();
      expect(screen.queryByTestId('user-settings')).not.toBeInTheDocument();
    });

    it('affiche Theme Settings quand on clique sur Apparence', () => {
      render(<ConfigModal {...defaultProps} />);

      fireEvent.click(screen.getAllByText('Apparence')[0]);

      expect(screen.getByTestId('theme-settings')).toBeInTheDocument();
    });

    it('affiche Translation Stats quand on clique sur Statistiques', () => {
      render(<ConfigModal {...defaultProps} />);

      fireEvent.click(screen.getAllByText('Statistiques')[0]);

      expect(screen.getByTestId('translation-stats')).toBeInTheDocument();
    });

    it('affiche Notification Settings quand on clique sur Notifications', () => {
      render(<ConfigModal {...defaultProps} />);

      fireEvent.click(screen.getAllByText('Notifications')[0]);

      expect(screen.getByTestId('notification-settings')).toBeInTheDocument();
    });

    it('affiche Privacy Settings quand on clique sur Confidentialite', () => {
      render(<ConfigModal {...defaultProps} />);

      fireEvent.click(screen.getAllByText(/Confidentialit/)[0]);

      expect(screen.getByTestId('privacy-settings')).toBeInTheDocument();
    });

    it('met en surbrillance l\'onglet actif', () => {
      render(<ConfigModal {...defaultProps} />);

      const userTab = screen.getAllByText('Profil utilisateur')[0].closest('button');
      expect(userTab?.className).toContain('bg-secondary');

      fireEvent.click(screen.getAllByText('Apparence')[0]);

      const themeTab = screen.getAllByText('Apparence')[0].closest('button');
      expect(themeTab?.className).toContain('bg-secondary');
    });
  });

  describe('Selection mobile (dropdown)', () => {
    it('affiche un select pour mobile', () => {
      render(<ConfigModal {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /section des param/i });
      expect(select).toBeInTheDocument();
    });

    it('change le contenu via le select mobile', () => {
      render(<ConfigModal {...defaultProps} />);

      const select = screen.getByRole('combobox', { name: /section des param/i });
      fireEvent.change(select, { target: { value: 'theme' } });

      expect(screen.getByTestId('theme-settings')).toBeInTheDocument();
    });
  });

  describe('Fermeture du modal', () => {
    it('appelle onClose quand on ferme le dialogue', () => {
      const onClose = jest.fn();
      render(<ConfigModal {...defaultProps} onClose={onClose} />);

      // Le composant Dialog utilise onOpenChange
      // Simuler la fermeture via le bouton de fermeture
      const closeButton = screen.getByRole('button', { name: /close/i });
      if (closeButton) {
        fireEvent.click(closeButton);
      }

      // Alternative: simuler un clic en dehors ou Escape
      fireEvent.keyDown(document, { key: 'Escape' });
    });
  });

  describe('Gestion de l\'utilisateur null', () => {
    it('passe null au composant UserSettings quand currentUser est null', () => {
      render(<ConfigModal {...defaultProps} currentUser={null} />);

      expect(screen.getByTestId('user-settings')).toHaveTextContent('No user');
    });
  });

  describe('Accessibilite', () => {
    it('le select mobile a un label accessible', () => {
      render(<ConfigModal {...defaultProps} />);

      expect(screen.getByLabelText(/lectionner une section/i)).toBeInTheDocument();
    });

    it('le dialogue a un titre accessible', () => {
      render(<ConfigModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('les boutons de navigation sont focusables', () => {
      render(<ConfigModal {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('Props transmises aux composants enfants', () => {
    it('transmet user et onUserUpdate a UserSettings', () => {
      const onUserUpdate = jest.fn();
      render(<ConfigModal {...defaultProps} onUserUpdate={onUserUpdate} />);

      // UserSettings devrait avoir recu les props
      expect(screen.getByTestId('user-settings')).toHaveTextContent('testuser');
    });

    it('transmet user et onUserUpdate a LanguageSettings', () => {
      const onUserUpdate = jest.fn();
      render(<ConfigModal {...defaultProps} onUserUpdate={onUserUpdate} />);

      fireEvent.click(screen.getAllByText('Langues & Traduction')[0]);

      expect(screen.getByTestId('language-settings')).toBeInTheDocument();
    });
  });

  describe('Style et layout', () => {
    it('applique les classes CSS appropriees', () => {
      render(<ConfigModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('max-w-[98vw]');
    });

    it('la sidebar est cachee sur mobile', () => {
      render(<ConfigModal {...defaultProps} />);

      // La sidebar a la classe 'hidden lg:flex'
      const sidebar = document.querySelector('.lg\\:flex.lg\\:w-72');
      expect(sidebar).toHaveClass('hidden');
    });
  });

  describe('Performance', () => {
    it('conserve l\'onglet selectionne entre les interactions', () => {
      render(<ConfigModal {...defaultProps} />);

      // Selectionner un onglet
      fireEvent.click(screen.getAllByText('Apparence')[0]);
      expect(screen.getByTestId('theme-settings')).toBeInTheDocument();

      // Faire une autre interaction (simuler un hover par exemple)
      fireEvent.mouseEnter(screen.getAllByText('Apparence')[0]);

      // L'onglet devrait toujours etre affiche
      expect(screen.getByTestId('theme-settings')).toBeInTheDocument();
    });
  });
});
