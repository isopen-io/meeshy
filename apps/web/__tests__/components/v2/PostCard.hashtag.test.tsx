import { render, screen } from '@testing-library/react';
import { PostCard } from '@/components/v2/PostCard';

// Même jeu de mocks que post-card-enhanced.test.tsx — LanguageOrb crashe en
// environnement jest sans ce mock (indépendant des hashtags).
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
}));

describe('PostCard — hashtags', () => {
  it('renders hashtags in the caption as clickable links (no translations)', () => {
    render(
      <PostCard
        author={{ name: 'Alice' }}
        lang="fr"
        content="Regarde #paris"
        time="2h"
        likes={0}
        comments={0}
      />
    );
    expect(screen.getByRole('link', { name: '#paris' })).toHaveAttribute('href', '/hashtag/paris');
  });
});
