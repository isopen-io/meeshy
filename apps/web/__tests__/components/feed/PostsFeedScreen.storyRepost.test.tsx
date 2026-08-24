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
      Repost post
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

// Le modal de repost d'une CARTE du fil porte les DEUX gestes — repost sec et
// citation. Les deux doivent miroiter le format de la source, donc le stub
// expose les deux rappels plutôt que de rendre `null`.
type RepostModalStubProps = {
  onRepost?: () => void;
  onQuote?: (content: string) => void;
};
jest.mock('@/components/v2/RepostModal', () => ({
  RepostModal: ({ onRepost, onQuote }: RepostModalStubProps) => (
    <div>
      <button data-testid="repost-modal-repost" onClick={() => onRepost?.()}>
        Repost
      </button>
      <button data-testid="repost-modal-quote" onClick={() => onQuote?.('mon commentaire')}>
        Quote
      </button>
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
  useStoryPreferences: () => ({ preferences: { defaultVisibility: 'PUBLIC' } }),
}));
jest.mock('@/hooks/social/use-statuses', () => ({
  useStatusesFeedQuery: () => ({ isLoading: false }),
  useStatusesList: () => [],
  useCreateStatusMutation: () => ({ mutate: jest.fn() }),
}));

// Le fil sert POST **et** REEL (`useFeedPosts` ne filtre pas le type) — c'est
// exactement pourquoi la loi du miroir doit s'y appliquer : sans `targetType`,
// le gateway retombe sur `?? POST` et le réel repartagé quitte le fil des réels.
const mockFeedPosts = {
  current: [] as Array<Record<string, unknown>>,
};

const reelPost = () => ({
  id: 'reel-9',
  authorId: 'author-3',
  type: 'REEL',
  visibility: 'PUBLIC',
  content: 'Un réel',
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
  author: { id: 'author-3', username: 'carol', displayName: 'Carol' },
});

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
  useFeedPosts: () => mockFeedPosts.current,
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

describe('PostsFeedScreen — minimal story repost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoryVisibility.current = 'PUBLIC';
    mockFeedPosts.current = [];
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  /**
   * Loi du miroir (directive produit 2026-08-23). Ce test assérait
   * `{ isQuote: false }` SANS `targetType` : il GRAVAIT le défaut. Le gateway
   * retombait sur son `?? POST` et repartager une story depuis le tray du fil
   * fabriquait un post PERMANENT — le geste disait « repartager », le résultat
   * disait « ancrer ».
   */
  it('reposte une story EN STORY depuis le tray du fil — elle reste éphémère', async () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-repost'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false, targetType: 'STORY' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  /** L'ANCRAGE — « garder ça pour de bon » : le seul chemin vers le permanent. */
  it("offre l'ancrage depuis le tray : reposter la story EN POST", async () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-repost-as-post'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false, targetType: 'POST' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  it('withholds onRepost when the active story is not PUBLIC (gateway 403s non-PUBLIC originals)', () => {
    mockStoryVisibility.current = 'FRIENDS';
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));

    expect(screen.queryByTestId('story-viewer-repost')).not.toBeInTheDocument();
    // La garde d'audience vaut pour les DEUX gestes : l'ancrage publie autant
    // que le miroir, il ne peut pas échapper au verrou de visibilité.
    expect(screen.queryByTestId('story-viewer-repost-as-post')).not.toBeInTheDocument();
  });

  it('shows a failure toast if the repost 403s despite the gate', async () => {
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onError?.());
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('story-tray-open'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-viewer-repost'));
    });

    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('Error', 'error'));
  });
});

/**
 * Loi du miroir, moitié CARTE DU FIL (cycle 108).
 *
 * Le lot précédent a câblé `targetType` sur les quatre sites de story/réel mais
 * a laissé le fil derrière, en le justifiant ainsi : « Le fil ne sert que POST
 * et REEL, donc rien d'observable ne change ici ». C'est l'inverse — si le fil
 * sert REEL, alors reposter un réel depuis le fil produit un POST, et c'est
 * précisément la perte de nature que la loi existe pour empêcher.
 *
 * L'état `repostingPost` ne portait pas le champ `type` : le geste sec lisait
 * `repostingPost.type` (donc `undefined`, et une erreur TS2339 qui a mis le
 * cliquet de dette au rouge sur `main`), et la citation ne l'envoyait pas du
 * tout. Les deux retombaient sur le `?? POST` du gateway.
 */
describe('PostsFeedScreen — la loi du miroir depuis une carte du fil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoryVisibility.current = 'PUBLIC';
    mockFeedPosts.current = [reelPost()];
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  it('reposts a REEL from the feed as a REEL, not as a POST', async () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('post-card-repost'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-repost'));
    });

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'reel-9', data: { isQuote: false, targetType: 'REEL' } },
      expect.anything(),
    );
  });

  it('carries the source format through the QUOTE gesture too', async () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('post-card-repost'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-quote'));
    });

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'reel-9', data: { content: 'mon commentaire', isQuote: true, targetType: 'REEL' } },
      expect.anything(),
    );
  });
});
