import { render, screen } from '@testing-library/react';
import React from 'react';
import { TranslationToggle } from '@/components/v2/TranslationToggle';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    tArray: () => [],
    locale: 'fr',
    currentLanguage: 'fr',
    setLocale: () => {},
    isLoading: false,
  }),
}));

const translations = [{ languageCode: 'fr', languageName: 'FR', content: 'Bonjour le monde' }];

describe('TranslationToggle — content rendering', () => {
  it('inline variant renders the resolved (preferred-language) content', () => {
    render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={translations}
        userLanguage="fr"
        variant="inline"
      />,
    );
    // Prisme: a fr translation exists and fr is preferred → show the translation.
    expect(screen.getByText('Bonjour le monde')).toBeInTheDocument();
  });

  it('inline variant falls back to the original content when no translation matches', () => {
    render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={translations}
        userLanguage="de"
        variant="inline"
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('inline variant with showContent={false} renders only the language chip (no body text)', () => {
    render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={translations}
        userLanguage="fr"
        variant="inline"
        showContent={false}
      />,
    );
    expect(screen.queryByText('Bonjour le monde')).not.toBeInTheDocument();
    expect(screen.queryByText('Hello world')).not.toBeInTheDocument();
  });

  it('block variant renders the resolved content', () => {
    render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={translations}
        userLanguage="fr"
        variant="block"
      />,
    );
    expect(screen.getByText('Bonjour le monde')).toBeInTheDocument();
  });
});
