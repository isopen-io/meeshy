/**
 * Tests for PostsFeedScreen's repost wiring (Task 2, point 4-5).
 * PostCard now renders a repost's nested original card, but only if the host
 * passes `post.repostOf` through, wires `onTapRepost` to navigate to the
 * original's detail page, and `onDownloadRepostMedia` to ping analytics
 * against the ORIGINAL's id (not the outer repost record's id).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

type PostCardStubProps = {
  repostOf?: { id: string };
  isQuote?: boolean;
  onTapRepost?: (repostId: string) => void;
  onDownloadRepostMedia?: (mediaId: string) => void;
};
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: ({ repostOf, isQuote, onTapRepost, onDownloadRepostMedia }: PostCardStubProps) => (
    <div>
      {repostOf && <div data-testid="post-card-repost-of">{repostOf.id}</div>}
      <div data-testid="post-card-is-quote">{String(!!isQuote)}</div>
      {onTapRepost && (
        <button data-testid="post-card-tap-repost" onClick={() => onTapRepost(repostOf!.id)}>
          Tap repost
        </button>
      )}
      {onDownloadRepostMedia && (
        <button data-testid="post-card-download-repost-media" onClick={() => onDownloadRepostMedia('media-1')}>
          Download original media
        </button>
      )}
    </div>
  ),
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/PostComposer', () => ({ PostComposer: () => null }));
jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/AudioPostComposer', () => ({ AudioPostComposer: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

const mockRecordMediaDownloads = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: { recordMediaDownloads: (...args: unknown[]) => mockRecordMediaDownloads(...args) },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn(), reportStory: jest.fn() },
}));

jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: jest.fn() }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));
jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: jest.fn() }));
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));

const mockPost = {
  id: 'post-1',
  authorId: 'author-2',
  type: 'POST',
  visibility: 'PUBLIC',
  content: '',
  repostOf: { id: 'original-1', author: { id: 'author-3', username: 'bob' }, content: 'Original', likeCount: 1, commentCount: 0 },
  isQuote: true,
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

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useFeedPosts: () => [mockPost],
  usePrefetchPost: () => jest.fn(),
}));

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice', avatar: null } }),
}));
jest.mock('@/services/tusUploadService', () => ({ TusUploadService: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes post.repostOf through to PostCard", () => {
    render(<PostsFeedScreen />);
    expect(screen.getByTestId('post-card-repost-of')).toHaveTextContent('original-1');
  });

  it('passes post.isQuote through to PostCard (drives counter placement)', () => {
    render(<PostsFeedScreen />);
    expect(screen.getByTestId('post-card-is-quote')).toHaveTextContent('true');
  });

  it('navigates to the original post detail page when the repost banner is tapped', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('post-card-tap-repost'));
    expect(mockPush).toHaveBeenCalledWith('/feeds/post/original-1');
  });

  it("pings recordMediaDownloads with the ORIGINAL's id for repost media", () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('post-card-download-repost-media'));
    expect(mockRecordMediaDownloads).toHaveBeenCalledWith('original-1', ['media-1'], 'feed');
  });
});
