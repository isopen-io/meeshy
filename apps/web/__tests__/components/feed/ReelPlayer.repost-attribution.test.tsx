/**
 * Constat 17 (F7c, rattrapage revue Opus) — B3.2 (« l'icône est le verbe »,
 * `spec:107`) n'était appliquée QUE sur la carte (`PostCard`, Task F4).
 * `ReelPlayer` rendait « Reposted from @bob » en toutes lettres à côté de
 * l'icône `Repeat2` — la 3e des 3 surfaces web de republication restait
 * incohérente avec la carte.
 *
 * Même correctif que F4/constat 16 : le texte verbeux disparaît de l'écran,
 * l'icône reste `aria-hidden`, la phrase complète pour l'accessibilité vit
 * dans un span `.sr-only`.
 */
import { render, screen } from '@testing-library/react';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import type { Post } from '@meeshy/shared/types/post';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'reel-1',
    authorId: 'user-1',
    type: 'REEL',
    visibility: 'PUBLIC',
    content: 'Hello',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Post;
}

const noop = () => {};

function renderReel(reel: Post) {
  return render(
    <ReelPlayer
      reel={reel}
      index={0}
      total={1}
      hasPrev={false}
      hasNext={false}
      isLiked={false}
      isBookmarked={false}
      onPrev={noop}
      onNext={noop}
      onClose={noop}
      onLike={noop}
      onComment={noop}
      onShare={noop}
      onBookmark={noop}
    />,
  );
}

describe('ReelPlayer — repost attribution (constat 17, icon is the verb)', () => {
  it('does NOT render "Reposted from" as plain visible text — the only occurrence lives in the visually-hidden accessible node', () => {
    renderReel(makePost({ repostOf: { id: 'original-1', author: { id: 'author-2', username: 'bob' } } }));
    const matches = screen.getAllByText(/Reposted from/i);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveClass('sr-only');
  });

  it('renders `@handle` visibly, aria-hidden, next to the icon', () => {
    renderReel(makePost({ repostOf: { id: 'original-1', author: { id: 'author-2', username: 'bob' } } }));
    const handle = screen.getByText('@bob');
    expect(handle).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the full sentence for accessibility via a visually-hidden node', () => {
    renderReel(makePost({ repostOf: { id: 'original-1', author: { id: 'author-2', username: 'bob' } } }));
    const repostLink = screen.getByRole('link', { name: 'Reposted from @bob' });
    const srNode = repostLink.querySelector('.sr-only');
    expect(srNode).toHaveTextContent('Reposted from @bob');
    expect(srNode).not.toHaveAttribute('aria-hidden');
  });
});
