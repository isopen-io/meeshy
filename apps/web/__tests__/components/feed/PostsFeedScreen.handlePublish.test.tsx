/**
 * PostsFeedScreen — handlePublish relay (Task 1, P0 web social parity)
 *
 * `handlePublish` used to destructure only {content, type, visibility} before
 * calling createPostMutation.mutate(...), silently dropping mediaIds and
 * visibilityUserIds from the composer's onPublish payload. This verifies the
 * full payload — including a media-only post — reaches the mutation intact.
 *
 * Every dependency of PostsFeedScreen is mocked; `MeeshyComposer` itself
 * (Task W7 — it replaced `PostComposer` on the `feedComposer` door) is
 * replaced by a stub that captures the `onPublish` callback for that door so
 * the test can invoke it directly with a full `PostPublishPayload`, matching
 * the exact shape the real `onPublish` prop produces. `PostPublishPayload`
 * is an alias of `ComposerDocumentPayload` (`components/composer/payload.ts`)
 * — same type, same shape, only the import path moved with the composer.
 */
import { render } from '@testing-library/react';
import React from 'react';
import type { ComposerDocumentPayload as PostPublishPayload } from '@/components/composer/payload';

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

jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: () => <div data-testid="post-card" />,
  StoryTray: () => <div data-testid="story-tray" />,
  StatusBar: () => <div data-testid="status-bar" />,
  StoryViewer: () => null,
  StoryComposer: () => null,
}));

const capturedOnPublish: { current: ((data: PostPublishPayload) => void) | null } = { current: null };
jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: ({ door, onPublish }: { door: { kind: string }; onPublish: (data: PostPublishPayload) => void }) => {
    if (door.kind === 'feedComposer') capturedOnPublish.current = onPublish;
    return <div data-testid={`meeshy-composer-${door.kind}`} />;
  },
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({ data: [], isLoading: false }),
  useCreateStoryMutation: () => ({ mutate: jest.fn() }),
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

const mockCreatePostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: mockCreatePostMutate, isPending: false }),
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

jest.mock('@/services/tusUploadService', () => ({
  TusUploadService: jest.fn(),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

import { PostsFeedScreen } from '@/components/feed/PostsFeedScreen';

describe('PostsFeedScreen — handlePublish relay (Task 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnPublish.current = null;
  });

  it('relays the full PostComposer payload (content, type, visibility, visibilityUserIds, mediaIds) to createPostMutation', () => {
    render(<PostsFeedScreen />);
    expect(capturedOnPublish.current).not.toBeNull();

    capturedOnPublish.current!({
      content: 'Hello world',
      type: 'POST',
      visibility: 'ONLY',
      visibilityUserIds: ['user-2', 'user-3'],
      mediaIds: ['att-1', 'att-2'],
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      {
        content: 'Hello world',
        type: 'POST',
        visibility: 'ONLY',
        visibilityUserIds: ['user-2', 'user-3'],
        mediaIds: ['att-1', 'att-2'],
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('relays a media-only post (empty content becomes undefined, mediaIds preserved)', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: '',
      type: 'POST',
      visibility: 'PUBLIC',
      mediaIds: ['att-1'],
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ content: undefined, mediaIds: ['att-1'], visibility: 'PUBLIC' }),
      expect.anything(),
    );
  });

  it('relays optimisticMedia to createPostMutation (Task 4, point 0bis)', () => {
    render(<PostsFeedScreen />);

    const optimisticMedia = [
      { id: 'att-1', mimeType: 'image/png', fileUrl: 'https://cdn.test/1.png', thumbnailUrl: undefined, order: 0 },
    ];
    capturedOnPublish.current!({
      content: '',
      type: 'POST',
      visibility: 'PUBLIC',
      mediaIds: ['att-1'],
      optimisticMedia,
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ optimisticMedia }),
      expect.anything(),
    );
  });

  it('omits visibilityUserIds and mediaIds when PostComposer does not send them', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: 'Text only',
      type: 'POST',
      visibility: 'PUBLIC',
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      {
        content: 'Text only',
        type: 'POST',
        visibility: 'PUBLIC',
        visibilityUserIds: undefined,
        mediaIds: undefined,
      },
      expect.anything(),
    );
  });

  // Same class of bug as mediaIds/visibilityUserIds above (plan
  // post-references-web, Task 5): PostComposer's onPublish carries `mentions`,
  // but handlePublish hand-picked fields and dropped it before reaching the
  // mutation — a silent no-op, never a visible error.
  it('relays mentions to createPostMutation (post-references)', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: 'Soirée avec elle',
      type: 'POST',
      visibility: 'PUBLIC',
      mentions: [{ userId: 'u-a', display: 'SILENT' }],
    });

    expect(mockCreatePostMutate).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: [{ userId: 'u-a', display: 'SILENT' }] }),
      expect.anything(),
    );
  });

  it('omits mentions when PostComposer does not send them (tri-state, never [])', () => {
    render(<PostsFeedScreen />);

    capturedOnPublish.current!({
      content: 'No one referenced',
      type: 'POST',
      visibility: 'PUBLIC',
    });

    expect(mockCreatePostMutate.mock.calls[0][0]).not.toHaveProperty('mentions');
  });
});
