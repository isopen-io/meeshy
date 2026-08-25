/**
 * PostsFeedScreen — the web story composer must NOT force the reader's
 * preferred (READ) language onto a published story's `originalLanguage`
 * (F5 correction, revue Codex). `usePreferredLanguage()` resolves the
 * language the VIEWER wants to READ content in (Prisme,
 * `resolveUserLanguage()`) — a different concept from the language the
 * AUTHOR just wrote the story in. `handleStoryPublish` used to send
 * `originalLanguage: userLanguage` (the read language) unconditionally;
 * that value must never reach `createStoryMutation` — resolving the
 * active UI locale for `originalLanguage` is `storyService.createStory`'s
 * job now (see `story.service.ts` tests), not this screen's.
 */
import { render } from '@testing-library/react';
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

const capturedOnStoryPublish: { current: ((data: unknown) => void) | null } = { current: null };

jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: () => <div data-testid="post-card" />,
  StoryTray: () => <div data-testid="story-tray" />,
  StatusBar: () => <div data-testid="status-bar" />,
  StoryViewer: () => null,
  StoryComposer: ({ onPublish }: { onPublish: (data: unknown) => void }) => {
    capturedOnStoryPublish.current = onPublish;
    return <div data-testid="story-composer-stub" />;
  },
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

const mockCreateStoryMutate = jest.fn();
jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: mockCreateStoryMutate }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));
jest.mock('@/hooks/social/use-stories-realtime', () => ({ useStoriesRealtime: () => undefined }));
jest.mock('@/lib/story-transforms', () => ({
  postToStoryData: jest.fn(),
  groupStoriesByAuthor: () => new Map(),
  groupToStoryItem: jest.fn(),
}));
jest.mock('@/stores/user-preferences-store', () => ({
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/lib/status-transforms', () => ({ postToStatusItem: jest.fn() }));

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: undefined,
    dataUpdatedAt: 0,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useFeedPosts: () => [],
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
  usePostSocketCacheSync: () => undefined,
}));
// The reader's preferred READ language (Prisme) — deliberately distinct from
// any plausible active UI locale, so a leak into `originalLanguage` is
// unmistakable.
jest.mock('@/hooks/use-post-translation', () => ({
  usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'],
}));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; avatar: string | null } | null }) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

jest.mock('@/services/tusUploadService', () => ({ TusUploadService: jest.fn() }));
jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: jest.fn(), recordMediaDownloads: jest.fn() },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn(), reportStory: jest.fn() },
}));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — story publish never forces the READ language (F5 correction)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnStoryPublish.current = null;
  });

  it('does not send originalLanguage on createStoryMutation — resolving it is storyService.createStory\'s job', () => {
    render(<PostsFeedScreen />);
    expect(capturedOnStoryPublish.current).not.toBeNull();

    capturedOnStoryPublish.current!({
      content: 'Bonjour',
      storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
      visibility: 'FRIENDS',
    });

    expect(mockCreateStoryMutate).toHaveBeenCalled();
    const [sentStory] = mockCreateStoryMutate.mock.calls[0];
    expect(sentStory).not.toHaveProperty('originalLanguage');
  });
});
