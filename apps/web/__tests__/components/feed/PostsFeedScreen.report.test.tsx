/**
 * Tests for PostsFeedScreen's Report wiring (Task 3, point 2 follow-up).
 * `reportPost`/`reportStory` (report.service.ts) existed with no UI entry
 * point. PostCard and StoryViewer now expose an `onReport` callback — this
 * wires it here to `reportService`, iOS parity: reportType 'inappropriate',
 * no reason, gated behind a simple confirm.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';
import type { Post } from '@meeshy/shared/types/post';

// ── Static / layout ─────────────────────────────────────────────────────────

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

const mockAddToast = jest.fn();

type PostCardStubProps = {
  onReport?: () => void;
};

jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: mockAddToast }),
  PostCard: ({ onReport }: PostCardStubProps) => (
    <div>
      {onReport && <button data-testid="post-card-report" onClick={onReport}>Report post</button>}
    </div>
  ),
  StoryTray: ({ onStoryPress }: { onStoryPress: (groupId: string) => void }) => (
    <button data-testid="story-tray-open" onClick={() => onStoryPress('author-2')}>Open story</button>
  ),
  StatusBar: () => null,
  StoryViewer: ({ onReport, stories }: { onReport?: (storyId: string) => void; stories: Array<{ id: string }> }) => (
    <div>
      {onReport && (
        <button data-testid="story-viewer-report" onClick={() => onReport(stories[0]?.id ?? '')}>
          Report story
        </button>
      )}
    </div>
  ),
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/PostComposer', () => ({ PostComposer: () => null }));
jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));
jest.mock('@/components/v2/AudioPostComposer', () => ({ AudioPostComposer: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

// ── Report service ───────────────────────────────────────────────────────────

const mockReportPost = jest.fn();
const mockReportStory = jest.fn();
jest.mock('@/services/report.service', () => ({
  reportService: {
    reportPost: (...args: unknown[]) => mockReportPost(...args),
    reportStory: (...args: unknown[]) => mockReportStory(...args),
  },
}));

// ── Stories / statuses / feed hooks ─────────────────────────────────────────

jest.mock('@/hooks/social/use-stories', () => {
  const actualStoryPost = {
    id: 'story-1',
    authorId: 'author-2',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'A story',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    author: { id: 'author-2', username: 'bob' },
  };
  return {
    useStoriesFeedQuery: () => ({ data: [actualStoryPost], isLoading: false }),
    useCreateStoryMutation: () => ({ mutate: jest.fn() }),
    useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
    useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
  };
});

jest.mock('@/hooks/social/use-stories-realtime', () => ({
  useStoriesRealtime: jest.fn(),
}));

jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));

jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));

const mockPost: Post = {
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
} as Post;

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
  useSharePostMutation: () => ({ mutate: jest.fn() }),
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

jest.mock('@/hooks/use-post-translation', () => ({
  usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'],
}));

jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice', avatar: null } }),
}));

jest.mock('@/services/tusUploadService', () => ({
  TusUploadService: jest.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PostsFeedScreen — report wiring', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockReportPost.mockResolvedValue({});
    mockReportStory.mockResolvedValue({});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('calls reportService.reportPost with reportType inappropriate and no reason after confirm', async () => {
    render(<PostsFeedScreen />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('post-card-report'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockReportPost).toHaveBeenCalledWith('post-1', 'inappropriate', ''));
  });

  it('does not call reportService when the confirm is dismissed', async () => {
    confirmSpy.mockReturnValue(false);
    render(<PostsFeedScreen />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('post-card-report'));
    });

    expect(mockReportPost).not.toHaveBeenCalled();
  });

  it('calls reportService.reportStory with reportType inappropriate and no reason after confirm', async () => {
    render(<PostsFeedScreen />);

    fireEvent.click(screen.getByTestId('story-tray-open'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-report'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockReportStory).toHaveBeenCalledWith('story-1', 'inappropriate', ''));
  });
});
