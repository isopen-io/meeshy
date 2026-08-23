/**
 * W1/V0 bis — la loi du miroir sur le FIL (directive produit 2026-08-23).
 *
 * Le repost d'une carte du fil suit le format de LA CARTE. Le cas coûteux ici
 * est le RÉEL : sans `targetType`, le gateway retombait sur son `?? POST` et le
 * repost d'un réel quittait le fil des réels — rétrogradation silencieuse, que
 * personne n'avait demandée.
 *
 * Ce chemin n'avait AUCUN test : le WIP qui a introduit `targetType` au fil a
 * touché les deux sites (miroir simple et repost CITÉ) sans jamais les faire
 * rougir, et `repostingPost` ne transportait même pas le type — `tsc` l'a
 * attrapé, pas la suite. D'où ce fichier.
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
  onRepostAsPost?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: mockAddToast }),
  PostCard: ({ onRepost }: { onRepost?: () => void }) => (
    <button data-testid="post-card-repost" onClick={() => onRepost?.()}>
      Repost
    </button>
  ),
  StoryTray: ({ onStoryPress }: { onStoryPress: (groupId: string) => void }) => (
    <button data-testid="story-tray-open" onClick={() => onStoryPress('author-2')}>Open story</button>
  ),
  StatusBar: () => null,
  StoryViewer: ({ onRepost, onRepostAsPost, stories }: StoryViewerStubProps) => (
    <div>
      {onRepost && (
        <button data-testid="story-viewer-repost" onClick={() => onRepost(stories[0]?.id ?? '')}>
          Repost story
        </button>
      )}
      {onRepostAsPost && (
        <button
          data-testid="story-viewer-repost-as-post"
          onClick={() => onRepostAsPost(stories[0]?.id ?? '')}
        >
          Keep on my feed
        </button>
      )}
    </div>
  ),
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/PostComposer', () => ({ PostComposer: () => null }));
jest.mock('@/components/v2/PostEditor', () => ({ PostEditor: () => null }));
jest.mock('@/components/v2/RepostModal', () => ({
  RepostModal: ({ onRepost, onQuote }: { onRepost?: () => void; onQuote?: (c: string) => void }) => (
    <div>
      <button data-testid="repost-modal-repost" onClick={() => onRepost?.()}>Repost</button>
      <button data-testid="repost-modal-quote" onClick={() => onQuote?.('mon commentaire')}>Quote</button>
    </div>
  ),
}));
jest.mock('@/components/v2/AudioPostComposer', () => ({ AudioPostComposer: () => null }));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: jest.fn(), recordMediaDownloads: jest.fn() },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn(), reportStory: jest.fn() },
}));

// Mutable so tests can flip the active story's visibility — the gateway
// (`PostService.repostPost`) 403s on any non-PUBLIC original, and the web
// default story visibility is FRIENDS (`user-preferences-store.ts`), so the
// "onRepost withheld" branch below covers the actual common case.
const mockStoryVisibility = { current: 'PUBLIC' as 'PUBLIC' | 'FRIENDS' };
jest.mock('@/hooks/social/use-stories', () => ({
  useStoriesFeedQuery: () => ({
    data: [{
      id: 'story-1',
      authorId: 'author-2',
      type: 'STORY',
      visibility: mockStoryVisibility.current,
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
    }],
    isLoading: false,
  }),
  useCreateStoryMutation: () => ({ mutate: jest.fn() }),
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));

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
  useFeedPosts: () => [
    {
      id: 'reel-9',
      type: 'REEL',
      authorId: 'author-2',
      visibility: 'PUBLIC',
      content: 'Un reel',
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
      author: { id: 'author-2', username: 'bob', displayName: 'Bob' },
    },
  ],
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

describe('PostsFeedScreen — le repost du fil miroite le format de la carte', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  async function openRepost() {
    render(<PostsFeedScreen />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('post-card-repost'));
    });
  }

  it("reposte un RÉEL en RÉEL — il ne quitte plus le fil des réels", async () => {
    await openRepost();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-repost'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-9', data: { isQuote: false, targetType: 'REEL' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  /**
   * Le repost CITÉ suit la MÊME loi : citer ne convertit pas. Ce second site
   * était resté en arrière dans le correctif d'origine — le miroir n'était donc
   * vrai que pour la moitié des gestes de la même modale.
   */
  it('reposte un RÉEL CITÉ en RÉEL — citer ne convertit pas', async () => {
    await openRepost();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-quote'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-9', data: { content: 'mon commentaire', isQuote: true, targetType: 'REEL' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});
