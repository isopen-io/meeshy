/**
 * PostsFeedScreen — StatusComposer/StoryComposer relay of `mentions` (plan
 * post-references-web, Task 5).
 *
 * Same class of bug as `PostsFeedScreen.handlePublish.test.tsx`:
 * `handleStatusPublish`/`handleStoryPublish` hand-pick the fields they
 * forward to `createStatusMutation`/`createStoryMutation`, silently dropping
 * `mentions` — the composer computes the right payload, but it never leaves
 * the client. Every dependency of PostsFeedScreen is mocked.
 *
 * The STORY half is untouched by Task W7 (`storyTray` was NOT bascule'd —
 * `StoryComposer` is still mounted unconditionally, its own `Dialog` gating
 * visibility internally): `StoryComposer` is stubbed exactly as before.
 *
 * The STATUS half changed shape: `StatusComposer` no longer exists in
 * production (`PostsFeedScreen.tsx` now wraps `MeeshyComposer`'s `moodChip`
 * door in a `Dialog` it owns itself), so `MeeshyComposer` is mocked instead,
 * filtered on `door.kind === 'moodChip'`. Unlike the old `StatusComposer`,
 * that instance only MOUNTS once the dialog opens — the tests now click
 * "add status" before invoking the captured `onPublishStatus`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

const capturedOnStatusPublish: { current: ((data: unknown) => void) | null } = { current: null };
const capturedOnStoryPublish: { current: ((data: unknown) => void) | null } = { current: null };

jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: () => <div data-testid="post-card" />,
  StoryTray: () => <div data-testid="story-tray" />,
  StatusBar: ({ onAddStatus }: { onAddStatus?: () => void }) => (
    <button data-testid="status-bar-add-status" onClick={onAddStatus} />
  ),
  StoryViewer: () => null,
  StoryComposer: ({ onPublish }: { onPublish: (data: unknown) => void }) => {
    capturedOnStoryPublish.current = onPublish;
    return <div data-testid="story-composer-stub" />;
  },
}));

jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: ({ door, onPublishStatus }: { door: { kind: string }; onPublishStatus?: (data: unknown) => void }) => {
    if (door.kind === 'moodChip') capturedOnStatusPublish.current = onPublishStatus ?? null;
    return <div data-testid={`meeshy-composer-${door.kind}`} />;
  },
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

const mockCreateStatusMutate = jest.fn();
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: mockCreateStatusMutate }),
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
jest.mock('@/hooks/use-post-translation', () => ({
  usePreferredLanguage: () => 'en', usePreferredLanguages: () => ['en'],
}));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ observe: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; username: string; avatar: string | null } | null }) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — StatusComposer/StoryComposer references relay (Task 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnStatusPublish.current = null;
    capturedOnStoryPublish.current = null;
  });

  it('relays mentions from the mood surface to createStatusMutation', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('status-bar-add-status'));
    expect(capturedOnStatusPublish.current).not.toBeNull();

    capturedOnStatusPublish.current!({
      moodEmoji: '🔥',
      content: 'on fire',
      mentions: [{ userId: 'u-a', display: 'SILENT' }],
    });

    expect(mockCreateStatusMutate).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] }),
      expect.anything(),
    );
  });

  it('omits mentions from createStatusMutation when the mood surface does not send them', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('status-bar-add-status'));

    capturedOnStatusPublish.current!({ moodEmoji: '😴', content: undefined });

    expect(mockCreateStatusMutate.mock.calls[0][0]).not.toHaveProperty('mentions');
  });

  it('relays mentions from StoryComposer to createStoryMutation', () => {
    render(<PostsFeedScreen />);
    expect(capturedOnStoryPublish.current).not.toBeNull();

    capturedOnStoryPublish.current!({
      content: 'Soirée avec elle',
      storyEffects: {},
      visibility: 'FRIENDS',
      mentions: [{ userId: 'u-a', display: 'SILENT' }],
    });

    expect(mockCreateStoryMutate).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] }),
      expect.anything(),
    );
  });

  it('omits mentions from createStoryMutation when StoryComposer does not send them', () => {
    render(<PostsFeedScreen />);

    capturedOnStoryPublish.current!({ content: 'No one referenced', storyEffects: {}, visibility: 'FRIENDS' });

    expect(mockCreateStoryMutate.mock.calls[0][0]).not.toHaveProperty('mentions');
  });
});
