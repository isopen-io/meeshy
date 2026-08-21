/**
 * Task F4 — `↻` sans verbe (B3.2, revue 2026-08-19/20). L'attribution de
 * republication sur la carte web disait « Reposted from @handle » en toutes
 * lettres ; le web s'aligne sur iOS (`arrow.2.squarepath` + `@handle`,
 * `accessibilityElement(children: .ignore)` + label complet) : le glyphe
 * `↻` remplace le verbe À L'ÉCRAN, la phrase complète existante
 * (`post.repostedFrom`) reste portée par l'accessibilité seule.
 */
import { render, screen } from '@testing-library/react';
import { PostCard } from '@/components/v2/PostCard';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
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
  getFlag: () => '🏳️',
}));

const baseProps = {
  author: { name: 'Alice' },
  lang: 'fr',
  content: '',
  time: '2h',
  likes: 3,
  comments: 1,
};

const repostOf = {
  id: 'original-1',
  author: { id: 'author-2', username: 'bob', displayName: 'Bob Original', avatar: null },
  content: 'Hello from the original',
  originalLanguage: 'en',
  likeCount: 42,
  commentCount: 7,
  media: [] as unknown[],
};

describe('PostCard — repost attribution (F4, icon is the verb)', () => {
  it('renders `↻ @handle`', () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    expect(screen.getByText('↻')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
  });

  it('does NOT render "Reposted from" on screen — the icon is the verb', () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    expect(screen.queryByText(/Reposted from/i)).not.toBeInTheDocument();
  });

  it('keeps the full sentence for accessibility — the icon is mute to the screen reader', () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    expect(screen.getByLabelText('Reposted from @bob')).toBeInTheDocument();
  });

  it('handles a repost with no known handle without throwing', () => {
    render(
      <PostCard
        {...baseProps}
        repostOf={{ ...repostOf, author: { id: 'author-2', username: '', displayName: 'Bob', avatar: null } }}
      />,
    );
    expect(screen.getByText('↻')).toBeInTheDocument();
  });
});
