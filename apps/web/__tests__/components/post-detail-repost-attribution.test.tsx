/**
 * Constat 17 (F7c, rattrapage revue Opus) — B3.2 (« l'icône est le verbe »,
 * `spec:107`) n'était appliquée QUE sur la carte (`PostCard`, Task F4) ;
 * `PostDetail` rendait toujours « Reposted from @bob » en toutes lettres à
 * côté de l'icône `Repeat2` — icône ET verbe, incohérent avec la carte.
 *
 * Même correctif que F4/constat 16 : le texte verbeux disparaît de l'écran,
 * l'icône reste `aria-hidden`, la phrase complète pour l'accessibilité vit
 * dans un span `.sr-only` (jamais un `aria-label` sur un `<div>` générique —
 * ARIA interdit ce nommage-là).
 */
import { render, screen } from '@testing-library/react';
import { PostDetail } from '@/components/v2/PostDetail';
import type { Post } from '@meeshy/shared/types/post';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
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

const repostOf = {
  id: 'original-1',
  author: { id: 'author-2', username: 'bob', displayName: 'Bob Original', avatar: null },
  content: 'Hello from the original',
  originalLanguage: 'en',
  likeCount: 42,
  commentCount: 7,
  media: [] as unknown[],
};

describe('PostDetail — repost attribution (constat 17, icon is the verb)', () => {
  it('does NOT render "Reposted from" as plain visible text — the only occurrence lives in the visually-hidden accessible node', () => {
    render(<PostDetail post={makePost({ repostOf })} comments={[]} />);
    const matches = screen.getAllByText(/Reposted from/i);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveClass('sr-only');
  });

  it('renders `@handle` visibly next to the (aria-hidden) icon', () => {
    render(<PostDetail post={makePost({ repostOf })} comments={[]} />);
    const block = screen.getByTestId('post-detail-repost-block');
    const handle = screen.getByText('@bob');
    expect(block.contains(handle)).toBe(true);
    expect(handle).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the full sentence for accessibility via a visually-hidden node', () => {
    render(<PostDetail post={makePost({ repostOf })} comments={[]} />);
    const block = screen.getByTestId('post-detail-repost-block');
    expect(block.querySelector('[aria-label]')).toBeNull();
    const srNode = block.querySelector('.sr-only');
    expect(srNode).toHaveTextContent('Reposted from @bob');
    expect(srNode).not.toHaveAttribute('aria-hidden');
  });
});
