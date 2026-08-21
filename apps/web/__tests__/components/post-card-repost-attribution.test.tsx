/**
 * Task F4 — `↻` sans verbe (B3.2, revue 2026-08-19/20). L'attribution de
 * republication sur la carte web disait « Reposted from @handle » en toutes
 * lettres ; le web s'aligne sur iOS (`arrow.2.squarepath` + `@handle`,
 * `accessibilityElement(children: .ignore)` + label complet) : le glyphe
 * `↻` remplace le verbe À L'ÉCRAN, la phrase complète existante
 * (`post.repostedFrom`) reste portée par l'accessibilité seule.
 *
 * Constat 16 (F7c, rattrapage revue Opus) — l'`aria-label` posé sur le `<div>`
 * générique de la ligne d'attribution ne nommait RIEN : un `div` sans `role`
 * porte le rôle `generic`, qui INTERDIT le nommage par auteur (ARIA in HTML
 * AAM). Le lecteur d'écran ignorait l'attribut et lisait le contenu
 * `aria-hidden` — donc rien. La phrase complète vit désormais dans un span
 * `.sr-only` (visible de l'arbre d'accessibilité, invisible à l'écran) ; le
 * glyphe et le handle restent `aria-hidden`.
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

  it('does NOT render "Reposted from" as plain visible text — the only occurrence lives in the visually-hidden accessible node', () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    const matches = screen.getAllByText(/Reposted from/i);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveClass('sr-only');
  });

  it('keeps the full sentence for accessibility via a visually-hidden node — a generic <div> cannot be named by aria-label (constat 16)', () => {
    render(<PostCard {...baseProps} repostOf={repostOf} />);
    const block = screen.getByTestId('post-card-repost-block');
    expect(block).not.toHaveAttribute('aria-label');
    expect(block.querySelector('[aria-label]')).toBeNull();
    const srNode = block.querySelector('.sr-only');
    expect(srNode).toHaveTextContent('Reposted from @bob');
    expect(srNode).not.toHaveAttribute('aria-hidden');
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
