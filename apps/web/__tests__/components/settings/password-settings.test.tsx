/**
 * Tests pour le composant PasswordSettings
 * Gere le changement de mot de passe utilisateur
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PasswordSettings } from '@/components/settings/password-settings';

// Mock des hooks i18n
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'security.password.title': 'Changer le mot de passe',
        'security.password.description': 'Modifiez votre mot de passe de connexion',
        'security.password.currentPassword': 'Mot de passe actuel',
        'security.password.currentPasswordPlaceholder': 'Entrez votre mot de passe actuel',
        'security.password.newPassword': 'Nouveau mot de passe',
        'security.password.newPasswordPlaceholder': 'Entrez votre nouveau mot de passe',
        'security.password.confirmPassword': 'Confirmer le mot de passe',
        'security.password.confirmPasswordPlaceholder': 'Confirmez votre nouveau mot de passe',
        'security.password.requirements': 'Min. 8 caracteres, 1 majuscule, 1 chiffre',
        'security.password.update': 'Mettre a jour',
        'security.password.updating': 'Mise a jour...',
        'security.password.cancel': 'Annuler',
        'security.password.updateSuccess': 'Mot de passe mis a jour avec succes',
        'security.password.errors.currentRequired': 'Le mot de passe actuel est requis',
        'security.password.errors.newRequired': 'Le nouveau mot de passe est requis',
        'security.password.errors.mismatch': 'Les mots de passe ne correspondent pas',
        'security.password.errors.samePassword': 'Le nouveau mot de passe doit etre different',
        'security.password.errors.updateFailed': 'Erreur lors de la mise a jour',
        'security.password.showPassword': 'Afficher le mot de passe',
        'security.password.hidePassword': 'Masquer le mot de passe',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

jest.mock('@/hooks/use-accessibility', () => ({
  SoundFeedback: {
    playClick: jest.fn(),
    playToggleOn: jest.fn(),
    playToggleOff: jest.fn(),
    playSuccess: jest.fn(),
    playError: jest.fn(),
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

describe('PasswordSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Rendu initial', () => {
    it('affiche le titre de la section', () => {
      render(<PasswordSettings />);

      expect(screen.getByText('Changer le mot de passe')).toBeInTheDocument();
    });

    it('affiche la description', () => {
      render(<PasswordSettings />);

      expect(screen.getByText('Modifiez votre mot de passe de connexion')).toBeInTheDocument();
    });

    it('affiche les trois champs de mot de passe', () => {
      render(<PasswordSettings />);

      expect(screen.getByLabelText('Mot de passe actuel')).toBeInTheDocument();
      expect(screen.getByLabelText('Nouveau mot de passe')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirmer le mot de passe')).toBeInTheDocument();
    });

    it('affiche les exigences de mot de passe', () => {
      render(<PasswordSettings />);

      expect(screen.getByText(/Min. 8 caracteres/)).toBeInTheDocument();
    });

    it('affiche les boutons d\'action', () => {
      render(<PasswordSettings />);

      expect(screen.getByText('Annuler')).toBeInTheDocument();
      expect(screen.getByText('Mettre a jour')).toBeInTheDocument();
    });

    it('les champs sont de type password par defaut', () => {
      render(<PasswordSettings />);

      expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('type', 'password');
      expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveAttribute('type', 'password');
    });
  });

  describe('Visibilite du mot de passe', () => {
    it('permet de basculer la visibilite du mot de passe actuel', () => {
      render(<PasswordSettings />);

      const currentPasswordInput = screen.getByLabelText('Mot de passe actuel');
      const toggleButton = screen.getAllByRole('button', { name: /afficher le mot de passe/i })[0];

      expect(currentPasswordInput).toHaveAttribute('type', 'password');

      fireEvent.click(toggleButton);

      expect(currentPasswordInput).toHaveAttribute('type', 'text');
    });

    it('permet de basculer la visibilite du nouveau mot de passe', () => {
      render(<PasswordSettings />);

      const newPasswordInput = screen.getByLabelText('Nouveau mot de passe');
      const toggleButtons = screen.getAllByRole('button', { name: /afficher le mot de passe/i });

      fireEvent.click(toggleButtons[1]);

      expect(newPasswordInput).toHaveAttribute('type', 'text');
    });

    it('permet de basculer la visibilite de la confirmation', () => {
      render(<PasswordSettings />);

      const confirmPasswordInput = screen.getByLabelText('Confirmer le mot de passe');
      const toggleButtons = screen.getAllByRole('button', { name: /afficher le mot de passe/i });

      fireEvent.click(toggleButtons[2]);

      expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    });

    it('joue le son au toggle de visibilite', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<PasswordSettings />);

      const toggleButton = screen.getAllByRole('button', { name: /afficher le mot de passe/i })[0];

      fireEvent.click(toggleButton);

      expect(SoundFeedback.playToggleOn).toHaveBeenCalled();

      fireEvent.click(toggleButton);

      expect(SoundFeedback.playToggleOff).toHaveBeenCalled();
    });
  });

  describe('Saisie de formulaire', () => {
    it('met a jour le champ mot de passe actuel', () => {
      render(<PasswordSettings />);

      const input = screen.getByLabelText('Mot de passe actuel');
      fireEvent.change(input, { target: { value: 'oldPassword123' } });

      expect(input).toHaveValue('oldPassword123');
    });

    it('met a jour le champ nouveau mot de passe', () => {
      render(<PasswordSettings />);

      const input = screen.getByLabelText('Nouveau mot de passe');
      fireEvent.change(input, { target: { value: 'newPassword456' } });

      expect(input).toHaveValue('newPassword456');
    });

    it('met a jour le champ confirmation', () => {
      render(<PasswordSettings />);

      const input = screen.getByLabelText('Confirmer le mot de passe');
      fireEvent.change(input, { target: { value: 'newPassword456' } });

      expect(input).toHaveValue('newPassword456');
    });
  });

  describe('Validation', () => {
    it('affiche une erreur si le mot de passe actuel est vide', async () => {
      const { toast } = require('sonner');

      render(<PasswordSettings />);

      fireEvent.click(screen.getByText('Mettre a jour'));

      expect(toast.error).toHaveBeenCalledWith('Le mot de passe actuel est requis');
    });

    it('affiche une erreur si le nouveau mot de passe est vide', async () => {
      const { toast } = require('sonner');

      render(<PasswordSettings />);

      fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
        target: { value: 'oldPassword' },
      });

      fireEvent.click(screen.getByText('Mettre a jour'));

      expect(toast.error).toHaveBeenCalledWith('Le nouveau mot de passe est requis');
    });

    it('affiche une erreur si les mots de passe ne correspondent pas', async () => {
      const { toast } = require('sonner');

      render(<PasswordSettings />);

      fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
        target: { value: 'oldPassword' },
      });
      fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
        target: { value: 'newPassword1' },
      });
      fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
        target: { value: 'newPassword2' },
      });

      fireEvent.click(screen.getByText('Mettre a jour'));

      expect(toast.error).toHaveBeenCalledWith('Les mots de passe ne correspondent pas');
    });

    it('affiche une erreur si le nouveau mot de passe est identique a l\'ancien', async () => {
      const { toast } = require('sonner');

      render(<PasswordSettings />);

      fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
        target: { value: 'samePassword' },
      });
      fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
        target: { value: 'samePassword' },
      });
      fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
        target: { value: 'samePassword' },
      });

      fireEvent.click(screen.getByText('Mettre a jour'));

      expect(toast.error).toHaveBeenCalledWith('Le nouveau mot de passe doit etre different');
    });
  });

  describe('Soumission du formulaire', () => {
    const fillValidForm = () => {
      fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
        target: { value: 'oldPassword123' },
      });
      fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
        target: { value: 'newPassword456' },
      });
      fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
        target: { value: 'newPassword456' },
      });
    };

    it('envoie la requete API avec les bonnes donnees', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Success' }),
      });

      render(<PasswordSettings />);
      fillValidForm();

      fireEvent.click(screen.getByText('Mettre a jour'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/users/me/password',
          expect.objectContaining({
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
            body: JSON.stringify({
              currentPassword: 'oldPassword123',
              newPassword: 'newPassword456',
              confirmPassword: 'newPassword456',
            }),
          })
        );
      });
    });

    it('affiche un message de succes et reinitialise le formulaire', async () => {
      const { toast } = require('sonner');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Mot de passe mis a jour' }),
      });

      render(<PasswordSettings />);
      fillValidForm();

      fireEvent.click(screen.getByText('Mettre a jour'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Mot de passe mis a jour');
      });

      // Formulaire reinitialise
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('');
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('');
      expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveValue('');
    });

    it('affiche "Mise a jour..." pendant le chargement', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({}) }), 100))
      );

      render(<PasswordSettings />);
      fillValidForm();

      fireEvent.click(screen.getByText('Mettre a jour'));

      expect(screen.getByText('Mise a jour...')).toBeInTheDocument();
    });

    it('desactive le bouton pendant le chargement', async () => {
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({}) }), 100))
      );

      render(<PasswordSettings />);
      fillValidForm();

      fireEvent.click(screen.getByText('Mettre a jour'));

      expect(screen.getByText('Mise a jour...')).toBeDisabled();
    });

    it('affiche une erreur si la requete echoue', async () => {
      const { toast } = require('sonner');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Mot de passe incorrect' }),
      });

      render(<PasswordSettings />);
      fillValidForm();

      fireEvent.click(screen.getByText('Mettre a jour'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Mot de passe incorrect');
      });
    });

    it('gere les erreurs reseau', async () => {
      const { toast } = require('sonner');
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<PasswordSettings />);
      fillValidForm();

      fireEvent.click(screen.getByText('Mettre a jour'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network error');
      });

      consoleError.mockRestore();
    });
  });

  describe('Bouton Annuler', () => {
    it('reinitialise le formulaire au clic sur Annuler', () => {
      render(<PasswordSettings />);

      // Remplir le formulaire
      fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
        target: { value: 'oldPassword123' },
      });
      fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
        target: { value: 'newPassword456' },
      });

      // Cliquer sur Annuler
      fireEvent.click(screen.getByText('Annuler'));

      // Verifier que les champs sont vides
      expect(screen.getByLabelText('Mot de passe actuel')).toHaveValue('');
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('');
      expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveValue('');
    });

    it('joue un son au clic sur Annuler', () => {
      const { SoundFeedback } = require('@/hooks/use-accessibility');

      render(<PasswordSettings />);

      fireEvent.click(screen.getByText('Annuler'));

      expect(SoundFeedback.playClick).toHaveBeenCalled();
    });
  });

  describe('Etat du bouton Mettre a jour', () => {
    it('est desactive quand les champs requis sont vides', () => {
      render(<PasswordSettings />);

      expect(screen.getByText('Mettre a jour')).toBeDisabled();
    });

    it('est active quand tous les champs sont remplis', () => {
      render(<PasswordSettings />);

      fireEvent.change(screen.getByLabelText('Mot de passe actuel'), {
        target: { value: 'oldPassword' },
      });
      fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
        target: { value: 'newPassword' },
      });
      fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
        target: { value: 'newPassword' },
      });

      expect(screen.getByText('Mettre a jour')).not.toBeDisabled();
    });
  });

  describe('Accessibilite', () => {
    it('les inputs ont des autocomplete appropries', () => {
      render(<PasswordSettings />);

      expect(screen.getByLabelText('Mot de passe actuel')).toHaveAttribute(
        'autocomplete',
        'current-password'
      );
      expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute(
        'autocomplete',
        'new-password'
      );
      expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveAttribute(
        'autocomplete',
        'new-password'
      );
    });

    it('les boutons de visibilite ont des aria-label', () => {
      render(<PasswordSettings />);

      const toggleButtons = screen.getAllByRole('button', { name: /mot de passe/i });
      expect(toggleButtons.length).toBe(3);
    });

    it('les boutons de visibilite ont aria-pressed', () => {
      render(<PasswordSettings />);

      const toggleButtons = screen.getAllByRole('button', { name: /afficher le mot de passe/i });

      expect(toggleButtons[0]).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(toggleButtons[0]);

      expect(toggleButtons[0]).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
