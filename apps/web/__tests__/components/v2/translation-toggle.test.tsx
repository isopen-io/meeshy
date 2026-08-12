import { render, screen, fireEvent } from '@testing-library/react';
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

describe('TranslationToggle — reactive Prisme resolution', () => {
  it('surfaces a preferred translation that arrives asynchronously after mount', () => {
    // Prisme: the NLLB pipeline completes AFTER first render — the comment/post is
    // first shown in its original language, then the cache receives the translation.
    const { rerender } = render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={[]}
        userLanguage="fr"
        variant="inline"
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();

    rerender(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={translations}
        userLanguage="fr"
        variant="inline"
      />,
    );
    expect(screen.getByText('Bonjour le monde')).toBeInTheDocument();
    expect(screen.queryByText('Hello world')).not.toBeInTheDocument();
  });

  it('re-resolves when the preferred language changes while mounted', () => {
    const multi = [
      { languageCode: 'fr', languageName: 'FR', content: 'Bonjour le monde' },
      { languageCode: 'es', languageName: 'ES', content: 'Hola mundo' },
    ];
    const { rerender } = render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={multi}
        userLanguage="fr"
        variant="inline"
      />,
    );
    expect(screen.getByText('Bonjour le monde')).toBeInTheDocument();

    rerender(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={multi}
        userLanguage="es"
        variant="inline"
      />,
    );
    expect(screen.getByText('Hola mundo')).toBeInTheDocument();
  });

  it('preserves a manual selection when new translations arrive', () => {
    const { rerender } = render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={translations}
        userLanguage="fr"
        variant="inline"
      />,
    );
    // Auto-resolved to the fr translation. User explores the original.
    fireEvent.click(screen.getByRole('button', { name: /FR/ }));
    fireEvent.click(screen.getByRole('button', { name: /original/i }));
    expect(screen.getByText('Hello world')).toBeInTheDocument();

    // A late translation update re-renders with an enriched translations prop.
    rerender(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={[
          { languageCode: 'fr', languageName: 'FR', content: 'Bonjour le monde (v2)' },
        ]}
        userLanguage="fr"
        variant="inline"
      />,
    );
    // The user's explicit choice (original) is NOT clobbered by the auto-resolution.
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('keeps a manually selected language fresh when its content is re-translated', () => {
    const multi = [
      { languageCode: 'fr', languageName: 'FR', content: 'Bonjour le monde' },
      { languageCode: 'es', languageName: 'ES', content: 'Hola mundo' },
    ];
    const { rerender } = render(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={multi}
        userLanguage="fr"
        variant="inline"
      />,
    );
    // Auto is fr; user manually picks es.
    fireEvent.click(screen.getByRole('button', { name: /FR/ }));
    fireEvent.click(screen.getByRole('button', { name: /ES/ }));
    expect(screen.getByText('Hola mundo')).toBeInTheDocument();

    rerender(
      <TranslationToggle
        originalContent="Hello world"
        originalLanguage="en"
        translations={[
          { languageCode: 'fr', languageName: 'FR', content: 'Bonjour le monde' },
          { languageCode: 'es', languageName: 'ES', content: 'Hola mundo (corregido)' },
        ]}
        userLanguage="fr"
        variant="inline"
      />,
    );
    // Still es (manual), but content refreshed from the new props.
    expect(screen.getByText('Hola mundo (corregido)')).toBeInTheDocument();
  });
});
