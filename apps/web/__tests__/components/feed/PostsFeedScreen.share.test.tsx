/**
 * Tests for PostsFeedScreen's enriched share flow (Task 4, point 2).
 * `postsService.sharePost` now accepts `{ generateLink: true }` and returns a
 * traceable `shortUrl` (`meeshy.me/l/<token>`, iOS parity). `handleShare` must
 * mint that link and hand it to `navigator.share` when available, falling
 * back to the clipboard otherwise (real `shareLink` from `lib/share-utils`).
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
type PostCardStubProps = {
  onShare?: () => void;
};
type StoryViewerStubProps = {
  onShare?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: mockAddToast }),
  PostCard: ({ onShare }: PostCardStubProps) => (
    <div>{onShare && <button data-testid="post-card-share" onClick={onShare}>Share</button>}</div>
  ),
  StoryTray: ({ onStoryPress }: { onStoryPress: (groupId: string) => void }) => (
    <button data-testid="story-tray-open" onClick={() => onStoryPress('author-2')}>Open story</button>
  ),
  StatusBar: () => null,
  StoryViewer: ({ onShare, stories }: StoryViewerStubProps) => (
    <div>
      {onShare && (
        <button data-testid="story-viewer-share" onClick={() => onShare(stories[0]?.id ?? '')}>
          Share story
        </button>
      )}
    </div>
  ),
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

const mockSharePost = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: (...args: unknown[]) => mockSharePost(...args) },
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

describe('PostsFeedScreen — enriched share', () => {
  let clipboardWriteText: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWriteText }, configurable: true });
    mockSharePost.mockResolvedValue({ shared: true, shareCount: 1, shortUrl: 'https://meeshy.me/l/abc123', token: 'abc123' });
  });

  it('requests a tracking link (generateLink:true) and hands it to navigator.share when available', async () => {
    const mockNavigatorShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<PostsFeedScreen />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('post-card-share'));
    });

    await waitFor(() => expect(mockSharePost).toHaveBeenCalledWith('post-1', { generateLink: true }));
    expect(mockNavigatorShare).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://meeshy.me/l/abc123' }),
    );
    expect(clipboardWriteText).not.toHaveBeenCalled();

    // @ts-expect-error test-only cleanup
    delete navigator.share;
  });

  it('falls back to the clipboard with the tracked link when navigator.share is unavailable', async () => {
    // @ts-expect-error test-only removal of a browser API
    delete navigator.share;

    render(<PostsFeedScreen />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('post-card-share'));
    });

    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('https://meeshy.me/l/abc123'));
  });

  it('shares a story via the StoryViewer share button (generateLink + clipboard fallback)', async () => {
    // @ts-expect-error test-only removal of a browser API
    delete navigator.share;
    mockSharePost.mockResolvedValue({ shared: true, shareCount: 1, shortUrl: 'https://meeshy.me/l/story123', token: 'story123' });

    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-share'));
    });

    await waitFor(() => expect(mockSharePost).toHaveBeenCalledWith('story-1', { generateLink: true }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('https://meeshy.me/l/story123'));
  });

  it('does not claim "Link copied!" when the user dismisses the native share sheet (post)', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const mockNavigatorShare = jest.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<PostsFeedScreen />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('post-card-share'));
    });

    await waitFor(() => expect(mockNavigatorShare).toHaveBeenCalled());
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(mockAddToast).not.toHaveBeenCalledWith('Link copied!', 'success');
    expect(mockAddToast).not.toHaveBeenCalledWith('Shared!', 'success');

    // @ts-expect-error test-only cleanup
    delete navigator.share;
  });

  it('does not claim "Link copied!" when the user dismisses the native share sheet (story)', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const mockNavigatorShare = jest.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });
    mockSharePost.mockResolvedValue({ shared: true, shareCount: 1, shortUrl: 'https://meeshy.me/l/story123', token: 'story123' });

    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-share'));
    });

    await waitFor(() => expect(mockNavigatorShare).toHaveBeenCalled());
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(mockAddToast).not.toHaveBeenCalledWith('Link copied!', 'success');
    expect(mockAddToast).not.toHaveBeenCalledWith('Shared!', 'success');

    // @ts-expect-error test-only cleanup
    delete navigator.share;
  });
});
