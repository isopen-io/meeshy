/**
 * Tests for the post detail page's Report wiring (Task 4, point 0).
 * PostDetail exposes an `onReport` callback (Task 3) but the page never wired
 * it to reportService — non-author viewers had no way to actually report a
 * post from `/feeds/post/:id`.
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
  useSharePostMutation: () => ({ mutate: jest.fn() }),
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
  onReport?: () => void;
};
jest.mock('@/components/v2/PostDetail', () => ({
  PostDetail: ({ onReport }: PostDetailStubProps) => (
    <div>{onReport && <button data-testid="post-detail-report" onClick={onReport}>Report post</button>}</div>
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

jest.mock('@/services/posts.service', () => ({
  postsService: { viewPost: jest.fn().mockResolvedValue(undefined) },
  recordAnonymousView: jest.fn(),
}));
jest.mock('@/lib/anonymous-session', () => ({ getOrCreateWebSessionKey: () => 'session-key' }));
jest.mock('@/lib/reactions', () => ({ isHeartLikedByMe: () => false }));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

const mockReportPost = jest.fn();
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: (...args: unknown[]) => mockReportPost(...args) },
}));

import PostDetailPage from '@/app/feeds/post/[postId]/page';

describe('PostDetailPage — report wiring', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockReportPost.mockResolvedValue({});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('calls reportService.reportPost with reportType inappropriate and no reason after confirm', async () => {
    render(<PostDetailPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('post-detail-report'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockReportPost).toHaveBeenCalledWith('post-1', 'inappropriate', ''));
  });

  it('does not call reportService when the confirm is dismissed', async () => {
    confirmSpy.mockReturnValue(false);
    render(<PostDetailPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('post-detail-report'));
    });

    expect(mockReportPost).not.toHaveBeenCalled();
  });
});
