/**
 * LanguageSwitcher (LanguageSelector) Component Tests
 *
 * Tests the language selector including:
 * - Rendering with default props
 * - Language selection
 * - Custom placeholder
 * - Interface only mode
 * - Custom choices
 * - Disabled state
 * - Search functionality
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Import via the re-export to test the language-switcher.tsx file
// which re-exports from translation/language-selector
import { LanguageSwitcher } from '../../../components/common/language-switcher';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'languageSelector.selectLanguage': 'Select language',
        'languageSelector.searchLanguage': 'Search language...',
        'languageSelector.noLanguageFound': 'No language found',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock language utils
jest.mock('@/utils/language-detection', () => ({
  SUPPORTED_LANGUAGES: [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  ],
  formatLanguageName: (code: string) => {
    const names: Record<string, string> = {
      en: 'English',
      fr: 'Francais',
      es: 'Espanol',
      de: 'Deutsch',
      it: 'Italiano',
      pt: 'Portugues',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      ar: 'Arabic',
      ru: 'Russian',
      hi: 'Hindi',
    };
    return names[code] || code;
  },
}));

// Mock interface languages
jest.mock('@/types/frontend', () => ({
  INTERFACE_LANGUAGES: [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  ],
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// Mock UI components to avoid complex imports
jest.mock('@/components/ui/button', () => ({
  Button: React.forwardRef(({ children, onClick, disabled, className, role, 'aria-expanded': expanded, ...props }: any, ref: any) => (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={className}
      role={role}
      aria-expanded={expanded}
      {...props}
    >
      {children}
    </button>
  )),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open, onOpenChange }: any) => (
    <div data-open={open} data-testid="popover">
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as any, { open, onOpenChange }) : child
      )}
    </div>
  ),
  PopoverTrigger: ({ children, asChild }: any) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children, className }: any) => (
    <div data-testid="popover-content" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/command', () => ({
  Command: ({ children }: any) => <div data-testid="command">{children}</div>,
  CommandInput: ({ placeholder }: any) => (
    <input data-testid="command-input" placeholder={placeholder} />
  ),
  CommandList: ({ children, className }: any) => (
    <div data-testid="command-list" className={className}>{children}</div>
  ),
  CommandEmpty: ({ children }: any) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandGroup: ({ children }: any) => (
    <div data-testid="command-group">{children}</div>
  ),
  CommandItem: ({ children, value, onSelect, className }: any) => (
    <div
      data-testid={`command-item-${value?.split(' ')[1]}`}
      data-value={value}
      className={className}
      onClick={() => onSelect?.()}
      role="option"
    >
      {children}
    </div>
  ),
}));

describe('LanguageSwitcher (LanguageSelector)', () => {
  const defaultProps = {
    value: 'en',
    onValueChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the language selector', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('displays selected language name', () => {
      render(<LanguageSwitcher {...defaultProps} value="en" />);

      expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('displays placeholder when no language selected', () => {
      render(<LanguageSwitcher {...defaultProps} value="" />);

      expect(screen.getByText('Select language')).toBeInTheDocument();
    });

    it('displays custom placeholder', () => {
      render(<LanguageSwitcher {...defaultProps} value="" placeholder="Choose a language" />);

      expect(screen.getByText('Choose a language')).toBeInTheDocument();
    });

    it('renders globe icon', () => {
      const { container } = render(<LanguageSwitcher {...defaultProps} />);

      // Lucide icons render as SVG
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<LanguageSwitcher {...defaultProps} className="custom-class" />);

      const button = screen.getByRole('combobox');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('Language Selection', () => {
    it('calls onValueChange when language is selected', async () => {
      const onValueChange = jest.fn();
      const user = userEvent.setup();

      render(<LanguageSwitcher {...defaultProps} onValueChange={onValueChange} />);

      // Click on a language option
      const frenchOption = screen.getByTestId('command-item-fr');
      await user.click(frenchOption);

      expect(onValueChange).toHaveBeenCalledWith('fr');
    });

    it('displays all supported languages by default', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByTestId('command-item-en')).toBeInTheDocument();
      expect(screen.getByTestId('command-item-fr')).toBeInTheDocument();
      expect(screen.getByTestId('command-item-es')).toBeInTheDocument();
      expect(screen.getByTestId('command-item-de')).toBeInTheDocument();
    });

    it('shows check mark for selected language', () => {
      const { container } = render(<LanguageSwitcher {...defaultProps} value="fr" />);

      // Check mark should be visible for French
      const frenchOption = screen.getByTestId('command-item-fr');
      const checkIcon = frenchOption.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  describe('Interface Only Mode', () => {
    it('shows only interface languages when interfaceOnly is true', () => {
      render(<LanguageSwitcher {...defaultProps} interfaceOnly={true} />);

      // Should have en, fr, pt
      expect(screen.getByTestId('command-item-en')).toBeInTheDocument();
      expect(screen.getByTestId('command-item-fr')).toBeInTheDocument();
      expect(screen.getByTestId('command-item-pt')).toBeInTheDocument();

      // Should not have de, es, etc.
      expect(screen.queryByTestId('command-item-de')).not.toBeInTheDocument();
      expect(screen.queryByTestId('command-item-es')).not.toBeInTheDocument();
    });
  });

  describe('Custom Choices', () => {
    it('displays only custom choices when provided', () => {
      const choices = [
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'French' },
      ];

      render(<LanguageSwitcher {...defaultProps} choices={choices} />);

      expect(screen.getByTestId('command-item-en')).toBeInTheDocument();
      expect(screen.getByTestId('command-item-fr')).toBeInTheDocument();

      // Other languages should not be present
      expect(screen.queryByTestId('command-item-es')).not.toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables button when disabled prop is true', () => {
      render(<LanguageSwitcher {...defaultProps} disabled={true} />);

      const button = screen.getByRole('combobox');
      expect(button).toBeDisabled();
    });

    it('does not call onValueChange when disabled', async () => {
      const onValueChange = jest.fn();
      const user = userEvent.setup();

      render(
        <LanguageSwitcher {...defaultProps} onValueChange={onValueChange} disabled={true} />
      );

      const button = screen.getByRole('combobox');
      await user.click(button);

      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('Search Functionality', () => {
    it('shows search input when more than 10 languages', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      // With 12 mock languages, search should be visible
      expect(screen.getByTestId('command-input')).toBeInTheDocument();
    });

    it('hides search input when 10 or fewer languages', () => {
      const fewChoices = [
        { code: 'en', name: 'English' },
        { code: 'fr', name: 'French' },
        { code: 'es', name: 'Spanish' },
      ];

      render(<LanguageSwitcher {...defaultProps} choices={fewChoices} />);

      // With only 3 languages, search should be hidden
      expect(screen.queryByTestId('command-input')).not.toBeInTheDocument();
    });

    it('shows no results message', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByTestId('command-empty')).toHaveTextContent('No language found');
    });
  });

  describe('Accessibility', () => {
    it('has combobox role', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('has aria-expanded attribute', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      const button = screen.getByRole('combobox');
      expect(button).toHaveAttribute('aria-expanded');
    });

    it('language options have option role', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
    });

    it('is keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<LanguageSwitcher {...defaultProps} />);

      const button = screen.getByRole('combobox');
      button.focus();

      expect(document.activeElement).toBe(button);
    });
  });

  describe('Popover Behavior', () => {
    it('renders popover content', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByTestId('popover-content')).toBeInTheDocument();
    });

    it('renders popover trigger', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
    });

    it('renders command list', () => {
      render(<LanguageSwitcher {...defaultProps} />);

      expect(screen.getByTestId('command-list')).toBeInTheDocument();
    });
  });

  describe('Different Selected Values', () => {
    it('displays French when selected', () => {
      render(<LanguageSwitcher {...defaultProps} value="fr" />);

      expect(screen.getByText('Francais')).toBeInTheDocument();
    });

    it('displays Spanish when selected', () => {
      render(<LanguageSwitcher {...defaultProps} value="es" />);

      expect(screen.getByText('Espanol')).toBeInTheDocument();
    });

    it('displays German when selected', () => {
      render(<LanguageSwitcher {...defaultProps} value="de" />);

      expect(screen.getByText('Deutsch')).toBeInTheDocument();
    });

    it('displays Portuguese when selected', () => {
      render(<LanguageSwitcher {...defaultProps} value="pt" />);

      expect(screen.getByText('Portugues')).toBeInTheDocument();
    });
  });
});
