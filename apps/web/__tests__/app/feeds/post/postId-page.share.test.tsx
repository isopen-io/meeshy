/**
 * Tests for the post detail page's enriched share flow (Task 4, point 2).
 * `postsService.sharePost` now accepts `{ generateLink: true }` and returns a
 * traceable `shortUrl`; `handleShare` must mint that link and hand it to
 * `navigator.share` when available, falling back to the clipboard otherwise.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'post-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/lib/notifications/notification-read-sync', () => ({
  markScopeNotificationsRead: jest.fn(),
}));

const mockPost = {
  id: 'post-1',
  authorId: 'author-2',
  author: { id: 'author-2', displayName: 'Bob' },
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'Hello world',
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

jest.mock('@/hooks/queries/use-post-query', () => ({
  usePostQuery: () => ({ isLoading: false, isError: false, data: mockPost }),
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

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-comment-target', () => ({
  useCommentTarget: () => ({ targetCommentId: null, targetParentCommentId: null }),
}));

type PostDetailStubProps = {
  onShare?: () => void;
};
jest.mock('@/components/v2/PostDetail', () => ({
  PostDetail: ({ onShare }: PostDetailStubProps) => (
    <div>{onShare && <button data-testid="post-detail-share" onClick={onShare}>Share</button>}</div>
  ),
}));
jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice' }, isAuthenticated: true }),
}));

const mockSharePost = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: {
    viewPost: jest.fn().mockResolvedValue(undefined),
    sharePost: (...args: unknown[]) => mockSharePost(...args),
  },
  recordAnonymousView: jest.fn(),
}));
jest.mock('@/lib/anonymous-session', () => ({ getOrCreateWebSessionKey: () => 'session-key' }));
jest.mock('@/lib/reactions', () => ({ isHeartLikedByMe: () => false }));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import PostDetailPage from '@/app/feeds/post/[postId]/page';

describe('PostDetailPage — enriched share', () => {
  let clipboardWriteText: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWriteText }, configurable: true });
    mockSharePost.mockResolvedValue({ shared: true, shareCount: 1, shortUrl: 'https://meeshy.me/l/post123', token: 'post123' });
    // @ts-expect-error test-only removal of a browser API
    delete navigator.share;
  });

  it('requests a tracking link and copies it to the clipboard (no navigator.share)', async () => {
    render(<PostDetailPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('post-detail-share'));
    });

    await waitFor(() => expect(mockSharePost).toHaveBeenCalledWith('post-1', { generateLink: true }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('https://meeshy.me/l/post123'));
  });

  it('hands the tracked link to navigator.share when available', async () => {
    const mockNavigatorShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<PostDetailPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('post-detail-share'));
    });

    await waitFor(() =>
      expect(mockNavigatorShare).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://meeshy.me/l/post123' })),
    );
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it('does not claim "Link copied!" when the user dismisses the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const mockNavigatorShare = jest.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<PostDetailPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('post-detail-share'));
    });

    await waitFor(() => expect(mockNavigatorShare).toHaveBeenCalled());
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(mockAddToast).not.toHaveBeenCalledWith('Link copied!', 'success');
    expect(mockAddToast).not.toHaveBeenCalledWith('Shared!', 'success');
  });
});
