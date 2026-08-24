/**
 * Tests for ReelsFeedScreen's Repost wiring (Task 4, point 1).
 * ReelPlayer exposes `onRepost` — this wires RepostModal + useRepostMutation,
 * mirroring PostsFeedScreen's PostCard repost flow.
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

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useSharePostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: mockRepostMutate, isPending: false }),
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

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));
jest.mock('@/components/v2/CommentList', () => ({ CommentList: () => null }));

type RepostModalStubProps = {
  open: boolean;
  onRepost: () => void;
  onClose: () => void;
};
jest.mock('@/components/v2/RepostModal', () => ({
  RepostModal: ({ open, onRepost }: RepostModalStubProps) =>
    open ? <button data-testid="repost-modal-confirm" onClick={onRepost}>Confirm repost</button> : null,
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

type ReelPlayerStubProps = {
  onRepost?: () => void;
};
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onRepost }: ReelPlayerStubProps) => (
    <div>{onRepost && <button data-testid="reel-repost" onClick={onRepost}>Repost</button>}</div>
  ),
}));

import { ReelsFeedScreen } from '@/components/feed/ReelsFeedScreen';

describe('ReelsFeedScreen — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  it('opens RepostModal from the reel action rail and reposts via useRepostMutation', async () => {
    render(<ReelsFeedScreen />);

    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(await screen.findByTestId('repost-modal-confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-confirm'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-1', data: { isQuote: false } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});
