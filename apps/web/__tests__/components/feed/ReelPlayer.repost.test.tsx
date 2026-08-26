/**
 * Tests for ReelPlayer's Repost action (Task 4, point 1).
 * The repost mechanism lives above ReelPlayer, in the screen that mounts it
 * (`useComposerRepost` + `MeeshyComposer`, since W8/W9 — `RepostModal.tsx` is
 * retired) — ReelPlayer never exposed an entry point on its action rail.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

function renderPlayer(onRepost?: () => void) {
  return render(
    <ReelPlayer
      reel={makePost()}
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
      onRepost={onRepost}
    />
  );
}

describe('ReelPlayer — repost action', () => {
  it('shows a Repost button when onRepost is provided', () => {
    renderPlayer(jest.fn());
    expect(screen.getByLabelText('Repost')).toBeInTheDocument();
  });

  it('calls onRepost when clicked', () => {
    const onRepost = jest.fn();
    renderPlayer(onRepost);
    fireEvent.click(screen.getByLabelText('Repost'));
    expect(onRepost).toHaveBeenCalled();
  });

  it('does not show Repost without an onRepost handler', () => {
    renderPlayer(undefined);
    expect(screen.queryByLabelText('Repost')).not.toBeInTheDocument();
  });
});
