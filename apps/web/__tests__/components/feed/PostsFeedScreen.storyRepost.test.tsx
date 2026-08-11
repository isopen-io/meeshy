/**
 * Tests for PostsFeedScreen's minimal story repost wiring (Task 4, point 4).
 * "Republier" is a direct one-tap action on the StoryViewer — no modal, no
 * quote UI, no canvas reprojection — POST /posts/:id/repost via the same
 * useRepostMutation() already used for posts.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

const mockAddToast = jest.fn();
type StoryViewerStubProps = {
  onRepost?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: mockAddToast }),
  PostCard: () => <div />,
  StoryTray: ({ onStoryPress }: { onStoryPress: (groupId: string) => void }) => (
    <button data-testid="story-tray-open" onClick={() => onStoryPress('author-2')}>Open story</button>
  ),
  StatusBar: () => null,
  StoryViewer: ({ onRepost, stories }: StoryViewerStubProps) => (
    <div>
      {onRepost && (
        <button data-testid="story-viewer-repost" onClick={() => onRepost(stories[0]?.id ?? '')}>
          Repost story
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

jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: jest.fn(), recordMediaDownloads: jest.fn() },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn(), reportStory: jest.fn() },
}));

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

jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: jest.fn() }));
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'FRIENDS' } }),
}));
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));

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
  useFeedPosts: () => [],
  usePrefetchPost: () => jest.fn(),
}));

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: mockRepostMutate, isPending: false }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr' }));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice', avatar: null } }),
}));
jest.mock('@/services/tusUploadService', () => ({ TusUploadService: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — minimal story repost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  it('reposts a story directly (no modal) via POST /posts/:id/repost, isQuote:false', async () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-repost'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});
