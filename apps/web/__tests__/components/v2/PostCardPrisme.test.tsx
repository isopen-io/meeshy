/**
 * Cycle 123 — le CORPS d'un post du fil ne servait JAMAIS de traduction.
 *
 * `PostCard` monte `TranslationToggle` en `variant="block" showContent={false}`
 * (la puce ne rend pas le texte, l'hôte le positionne lui-même) puis rend
 * `PostContentText content={content}` — l'ORIGINAL, inconditionnellement.
 * Personne ne branchait `onDisplayedChange`. Deux conséquences, la seconde
 * pire que la première :
 *
 *  1. Le Prisme est ANNONCÉ sans être APPLIQUÉ : la zone « traductions
 *     disponibles » annonce la langue résolue au-dessus d'un corps resté en
 *     version originale.
 *  2. Le contrôle est INERTE : cliquer une traduction change la sélection
 *     interne de la puce — donc la liste des « autres » versions — sans jamais
 *     changer une ligne du texte lu.
 *
 * Même défaut que celui trouvé sur `StoryViewer` dans le même cycle, sur la
 * surface la plus vue du produit. Trouvé en cherchant le motif que la leçon 266
 * prescrit : `showContent={false}` SANS `onDisplayedChange`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Même jeu de mocks que les autres suites PostCard — `LanguageOrb` crashe en
// environnement jest sans son mock (styled-jsx), indépendamment du Prisme.
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    tArray: () => [],
    locale: 'en',
    currentLanguage: 'en',
    setLocale: () => {},
    isLoading: false,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span data-testid="language-orb" />,
}));

jest.mock('@/components/v2/flags', () => ({
  getLanguageName: (code: string) => code.toUpperCase(),
  getFlag: (code: string) => code.toUpperCase(),
}));

import { PostCard } from '@/components/v2/PostCard';

const BASE = {
  author: { name: 'Bob' },
  lang: 'en',
  content: 'Hello',
  time: '1h',
  likes: 0,
  comments: 0,
};

describe('PostCard — le corps sert ce que la puce ANNONCE', () => {
  it('sert la traduction du rang 2 quand le rang 1 est absent', () => {
    render(
      <PostCard
        {...BASE}
        translations={[{ languageCode: 'fr', languageName: 'Français', content: 'Bonjour' }]}
        preferredLanguages={['de', 'fr']}
      />,
    );

    // Le CORPS, pas la zone « traductions disponibles » — qui liste
    // légitimement l'original en tant qu'AUTRE version consultable.
    expect(screen.getAllByTestId('post-content-text')[0]).toHaveTextContent('Bonjour');
    expect(screen.getAllByTestId('post-content-text')[0]).not.toHaveTextContent('Hello');
  });

  it('sert l’original quand aucune langue du prisme n’est disponible', () => {
    render(
      <PostCard
        {...BASE}
        translations={[{ languageCode: 'es', languageName: 'Español', content: 'Hola' }]}
        preferredLanguages={['de', 'fr']}
      />,
    );

    expect(screen.getAllByTestId('post-content-text')[0]).toHaveTextContent('Hello');
  });

  it('applique l’exploration manuelle au CORPS, pas seulement à la liste', () => {
    render(
      <PostCard
        {...BASE}
        translations={[{ languageCode: 'es', languageName: 'Español', content: 'Hola' }]}
        preferredLanguages={['en']}
      />,
    );

    expect(screen.getAllByTestId('post-content-text')[0]).toHaveTextContent('Hello');

    fireEvent.click(screen.getByText('Hola'));

    expect(screen.getAllByTestId('post-content-text')[0]).toHaveTextContent('Hola');
    expect(screen.getAllByTestId('post-content-text')[0]).not.toHaveTextContent('Hello');
  });
});
