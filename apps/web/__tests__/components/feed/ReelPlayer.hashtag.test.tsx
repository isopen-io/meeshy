import { render, screen } from '@testing-library/react';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import type { Post } from '@meeshy/shared/types/post';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
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

describe('ReelPlayer — hashtags', () => {
  it('renders the reel caption hashtags as clickable links', () => {
    render(
      <ReelPlayer
        reel={makePost({ content: 'Vue de #paris' })}
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
      />
    );
    expect(screen.getByRole('link', { name: '#paris' })).toHaveAttribute('href', '/hashtag/paris');
  });
});
