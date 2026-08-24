/**
 * Tests for ReelsFeedScreen's enriched share flow (Task 4, point 2).
 * `postsService.sharePost` now accepts `{ generateLink: true }` and returns a
 * traceable `shortUrl`; `onShare` must mint that link and hand it to
 * `navigator.share` when available, falling back to the clipboard otherwise.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockReel = {
  id: 'reel-1',
  authorId: 'author-2',
  author: { id: 'author-2', displayName: 'Bob' },
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
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

jest.mock('@/hooks/queries/use-reels-feed-query', () => ({
  useReelsFeedQuery: () => ({
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useReelsFeedPosts: () => [mockReel],
}));

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentsInfiniteQuery: () => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
  useCommentsList: () => [],
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ record: jest.fn() }),
}));
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ id: 'viewer-1' }),
}));

const mockSharePost = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: (...args: unknown[]) => mockSharePost(...args) },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));
jest.mock('@/components/v2/CommentList', () => ({ CommentList: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

type ReelPlayerStubProps = {
  onShare?: () => void;
};
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onShare }: ReelPlayerStubProps) => (
    <div>{onShare && <button data-testid="reel-share" onClick={onShare}>Share</button>}</div>
  ),
}));

import { ReelsFeedScreen } from '@/components/feed/ReelsFeedScreen';

describe('ReelsFeedScreen — enriched share', () => {
  let clipboardWriteText: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWriteText }, configurable: true });
    mockSharePost.mockResolvedValue({ shared: true, shareCount: 1, shortUrl: 'https://meeshy.me/l/xyz789', token: 'xyz789' });
    // @ts-expect-error test-only removal of a browser API
    delete navigator.share;
  });

  it('requests a tracking link and copies it to the clipboard (no navigator.share)', async () => {
    render(<ReelsFeedScreen />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('reel-share'));
    });

    await waitFor(() => expect(mockSharePost).toHaveBeenCalledWith('reel-1', { generateLink: true }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('https://meeshy.me/l/xyz789'));
  });

  it('hands the tracked link to navigator.share when available', async () => {
    const mockNavigatorShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<ReelsFeedScreen />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('reel-share'));
    });

    await waitFor(() =>
      expect(mockNavigatorShare).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://meeshy.me/l/xyz789' })),
    );
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it('does not claim "Link copied!" when the user dismisses the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const mockNavigatorShare = jest.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<ReelsFeedScreen />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('reel-share'));
    });

    await waitFor(() => expect(mockNavigatorShare).toHaveBeenCalled());
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(mockAddToast).not.toHaveBeenCalledWith('Link copied!', 'success');
    expect(mockAddToast).not.toHaveBeenCalledWith('Shared!', 'success');
  });
});
