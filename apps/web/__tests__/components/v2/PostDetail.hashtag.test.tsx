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

describe('PostDetail — hashtags', () => {
  it('renders hashtags in the caption as clickable links (no translations)', () => {
    render(<PostDetail post={makePost({ content: 'Regarde #paris' })} comments={[]} />);
    expect(screen.getByRole('link', { name: '#paris' })).toHaveAttribute('href', '/hashtag/paris');
  });
});
