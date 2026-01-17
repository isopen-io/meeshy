/**
 * Tests pour le composant LanguageSelector
 * Composant de selection de langue avec recherche et filtrage
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LanguageSelector } from '@/components/settings/language-selector';
import { SupportedLanguageInfo } from '@/types';

// Mock des hooks i18n
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'languageSelector.placeholder': 'Selectionnez une langue',
        'languageSelector.searchPlaceholder': 'Rechercher une langue...',
        'languageSelector.noLanguageFound': 'Aucune langue trouvee',
      };
      return translations[key] || key;
    },
  }),
}));

describe('LanguageSelector', () => {
  const mockLanguages: SupportedLanguageInfo[] = [
    { code: 'fr', name: 'French', nativeName: 'Francais', flag: '🇫🇷' },
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish', nativeName: 'Espanol', flag: '🇪🇸' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Portugues', flag: '🇵🇹' },
  ];

  const defaultProps = {
    value: '',
    onValueChange: jest.fn(),
    languages: mockLanguages,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendu initial', () => {
    it('affiche le placeholder par defaut', () => {
      render(<LanguageSelector {...defaultProps} />);

      expect(screen.getByText('Selectionnez une langue')).toBeInTheDocument();
    });

    it('affiche un placeholder personnalise', () => {
      render(<LanguageSelector {...defaultProps} placeholder="Choisissez" />);

      expect(screen.getByText('Choisissez')).toBeInTheDocument();
    });

    it('affiche la langue selectionnee', () => {
      render(<LanguageSelector {...defaultProps} value="fr" />);

      expect(screen.getByText('🇫🇷')).toBeInTheDocument();
      expect(screen.getByText('French')).toBeInTheDocument();
    });

    it('affiche l\'icone chevron', () => {
      render(<LanguageSelector {...defaultProps} />);

      expect(screen.getByTestId('chevronsupdown-icon')).toBeInTheDocument();
    });
  });

  describe('Ouverture du popover', () => {
    it('ouvre le popover au clic', async () => {
      render(<LanguageSelector {...defaultProps} />);

      const trigger = screen.getByRole('combobox');
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Rechercher une langue...')).toBeInTheDocument();
      });
    });

    it('affiche toutes les langues dans le popover', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('French')).toBeInTheDocument();
        expect(screen.getByText('English')).toBeInTheDocument();
        expect(screen.getByText('Spanish')).toBeInTheDocument();
        expect(screen.getByText('German')).toBeInTheDocument();
        expect(screen.getByText('Portuguese')).toBeInTheDocument();
      });
    });

    it('affiche les noms natifs des langues', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('Francais')).toBeInTheDocument();
        expect(screen.getByText('Espanol')).toBeInTheDocument();
        expect(screen.getByText('Deutsch')).toBeInTheDocument();
      });
    });

    it('affiche les drapeaux des langues', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const flags = screen.getAllByText(/🇫🇷|🇬🇧|🇪🇸|🇩🇪|🇵🇹/);
        expect(flags.length).toBeGreaterThanOrEqual(5);
      });
    });
  });

  describe('Recherche', () => {
    it('filtre les langues par nom', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        fireEvent.change(searchInput, { target: { value: 'French' } });
      });

      await waitFor(() => {
        expect(screen.getByText('French')).toBeInTheDocument();
        expect(screen.queryByText('German')).not.toBeInTheDocument();
      });
    });

    it('filtre les langues par code', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        fireEvent.change(searchInput, { target: { value: 'de' } });
      });

      await waitFor(() => {
        expect(screen.getByText('German')).toBeInTheDocument();
      });
    });

    it('filtre les langues par nom natif', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        fireEvent.change(searchInput, { target: { value: 'Deutsch' } });
      });

      await waitFor(() => {
        expect(screen.getByText('German')).toBeInTheDocument();
      });
    });

    it('affiche "Aucune langue trouvee" si aucun resultat', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        fireEvent.change(searchInput, { target: { value: 'xyz123' } });
      });

      await waitFor(() => {
        expect(screen.getByText('Aucune langue trouvee')).toBeInTheDocument();
      });
    });

    it('la recherche est insensible a la casse', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        fireEvent.change(searchInput, { target: { value: 'FRENCH' } });
      });

      await waitFor(() => {
        expect(screen.getByText('French')).toBeInTheDocument();
      });
    });
  });

  describe('Selection', () => {
    it('appelle onValueChange avec le code de la langue selectionnee', async () => {
      const onValueChange = jest.fn();
      render(<LanguageSelector {...defaultProps} onValueChange={onValueChange} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const germanOption = screen.getByText('German').closest('[data-value]');
        if (germanOption) {
          fireEvent.click(germanOption);
        }
      });

      expect(onValueChange).toHaveBeenCalledWith('de');
    });

    it('deselectionne si on clique sur la langue deja selectionnee', async () => {
      const onValueChange = jest.fn();
      render(<LanguageSelector {...defaultProps} value="fr" onValueChange={onValueChange} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const frenchOption = screen.getAllByText('French')[0].closest('[data-value]');
        if (frenchOption) {
          fireEvent.click(frenchOption);
        }
      });

      expect(onValueChange).toHaveBeenCalledWith('');
    });

    it('ferme le popover apres selection', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const germanOption = screen.getByText('German').closest('[data-value]');
        if (germanOption) {
          fireEvent.click(germanOption);
        }
      });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Rechercher une langue...')).not.toBeInTheDocument();
      });
    });

    it('reinitialise la recherche apres selection', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        fireEvent.change(searchInput, { target: { value: 'German' } });
      });

      await waitFor(() => {
        const germanOption = screen.getByText('German').closest('[data-value]');
        if (germanOption) {
          fireEvent.click(germanOption);
        }
      });

      // Rouvrir le popover
      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Rechercher une langue...');
        expect(searchInput).toHaveValue('');
      });
    });
  });

  describe('Affichage de la selection', () => {
    it('affiche une icone Check pour la langue selectionnee', async () => {
      render(<LanguageSelector {...defaultProps} value="fr" />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        // L'icone Check devrait etre visible pour French
        const frenchOption = screen.getAllByText('French')[0].closest('[data-value]');
        const checkIcon = frenchOption?.querySelector('[data-testid="check-icon"]');
        expect(checkIcon).toHaveClass('opacity-100');
      });
    });

    it('cache l\'icone Check pour les langues non selectionnees', async () => {
      render(<LanguageSelector {...defaultProps} value="fr" />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const germanOption = screen.getByText('German').closest('[data-value]');
        const checkIcon = germanOption?.querySelector('[data-testid="check-icon"]');
        expect(checkIcon).toHaveClass('opacity-0');
      });
    });
  });

  describe('Accessibilite', () => {
    it('le trigger a le role combobox', () => {
      render(<LanguageSelector {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('indique l\'etat d\'expansion avec aria-expanded', () => {
      render(<LanguageSelector {...defaultProps} />);

      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(combobox);

      expect(combobox).toHaveAttribute('aria-expanded', 'true');
    });

    it('les options sont accessibles au clavier', async () => {
      render(<LanguageSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBe(5);
      });
    });
  });

  describe('Styles', () => {
    it('applique la className personnalisee', () => {
      render(<LanguageSelector {...defaultProps} className="custom-class" />);

      const button = screen.getByRole('combobox');
      expect(button).toHaveClass('custom-class');
    });

    it('applique le style muted quand aucune valeur n\'est selectionnee', () => {
      render(<LanguageSelector {...defaultProps} />);

      const button = screen.getByRole('combobox');
      expect(button).toHaveClass('text-muted-foreground');
    });

    it('n\'applique pas le style muted quand une valeur est selectionnee', () => {
      render(<LanguageSelector {...defaultProps} value="fr" />);

      const button = screen.getByRole('combobox');
      expect(button).not.toHaveClass('text-muted-foreground');
    });
  });

  describe('Langues sans nom natif', () => {
    it('gere les langues sans nativeName', async () => {
      const languagesWithoutNative: SupportedLanguageInfo[] = [
        { code: 'xx', name: 'Test Language', flag: '🏴' },
      ];

      render(
        <LanguageSelector
          {...defaultProps}
          languages={languagesWithoutNative}
        />
      );

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('Test Language')).toBeInTheDocument();
        // Pas de nom natif affiche
      });
    });

    it('n\'affiche pas le nom natif si identique au nom', async () => {
      const languagesSameName: SupportedLanguageInfo[] = [
        { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
      ];

      render(
        <LanguageSelector
          {...defaultProps}
          languages={languagesSameName}
        />
      );

      fireEvent.click(screen.getByRole('combobox'));

      await waitFor(() => {
        // Ne devrait avoir qu'une seule occurrence de "English"
        const englishTexts = screen.getAllByText('English');
        expect(englishTexts.length).toBe(1);
      });
    });
  });
});
