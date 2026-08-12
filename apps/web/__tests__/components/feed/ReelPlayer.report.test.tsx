/**
 * Tests for ReelPlayer's Report action (Task 3, point 2 follow-up).
 * reportPost service exists (report.service.ts) but had no UI entry point
 * on the reel player action rail.
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

function renderPlayer(onReport?: () => void) {
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
      onReport={onReport}
    />
  );
}

describe('ReelPlayer — report action', () => {
  it('shows a Report button when onReport is provided', () => {
    renderPlayer(jest.fn());
    expect(screen.getByLabelText('Report')).toBeInTheDocument();
  });

  it('calls onReport when clicked', () => {
    const onReport = jest.fn();
    renderPlayer(onReport);
    fireEvent.click(screen.getByLabelText('Report'));
    expect(onReport).toHaveBeenCalled();
  });

  it('does not show Report without an onReport handler', () => {
    renderPlayer(undefined);
    expect(screen.queryByLabelText('Report')).not.toBeInTheDocument();
  });
});
