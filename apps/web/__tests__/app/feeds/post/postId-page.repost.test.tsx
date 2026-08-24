/**
 * Tests for the post detail page's repost wiring (Task 2, point 4-5).
 * `usePostQuery` already returns the full `Post` (incl. `repostOf`), which
 * PostDetail reads directly — the page only needs to wire `onTapRepost`
 * (navigate to the original) and `onDownloadRepostMedia` (analytics ping
 * against the ORIGINAL's id, not the outer repost record's id).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'post-1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
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
  content: '',
  repostOf: { id: 'original-1', author: { id: 'author-3', username: 'bob' }, content: 'Original', likeCount: 1, commentCount: 0 },
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
  onTapRepost?: (repostId: string) => void;
  onDownloadRepostMedia?: (mediaId: string) => void;
};
jest.mock('@/components/v2/PostDetail', () => ({
  PostDetail: ({ onTapRepost, onDownloadRepostMedia }: PostDetailStubProps) => (
    <div>
      {onTapRepost && (
        <button data-testid="post-detail-tap-repost" onClick={() => onTapRepost('original-1')}>
          Tap repost
        </button>
      )}
      {onDownloadRepostMedia && (
        <button data-testid="post-detail-download-repost-media" onClick={() => onDownloadRepostMedia('media-1')}>
          Download original media
        </button>
      )}
    </div>
  ),
}));
jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: jest.fn() }) }));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice' }, isAuthenticated: true }),
}));

const mockRecordMediaDownloads = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: {
    viewPost: jest.fn().mockResolvedValue(undefined),
    sharePost: jest.fn(),
    recordMediaDownloads: (...args: unknown[]) => mockRecordMediaDownloads(...args),
  },
  recordAnonymousView: jest.fn(),
}));
jest.mock('@/lib/anonymous-session', () => ({ getOrCreateWebSessionKey: () => 'session-key' }));
jest.mock('@/lib/reactions', () => ({ isHeartLikedByMe: () => false }));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import PostDetailPage from '@/app/feeds/post/[postId]/page';

describe('PostDetailPage — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to the original post detail page when the repost banner is tapped', () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('post-detail-tap-repost'));
    expect(mockPush).toHaveBeenCalledWith('/feeds/post/original-1');
  });

  it("pings recordMediaDownloads with the ORIGINAL's id for repost media", () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('post-detail-download-repost-media'));
    expect(mockRecordMediaDownloads).toHaveBeenCalledWith('original-1', ['media-1'], 'detail');
  });
});
