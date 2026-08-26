/**
 * Loi du miroir, moitié « fil » : reposter depuis PostsFeedScreen doit porter
 * le type de la SOURCE, pour les DEUX gestes (republication nue et citation).
 *
 * Sans cette garde, `targetType` partait à `undefined` — l'état local
 * `repostingPost` ne retenait que { id, author, content }, donc le gateway
 * retombait sur son défaut `?? POST` et un REEL reposté quittait le fil des
 * reels en silence. Le type ne rougissait pas non plus : la lecture
 * `repostingPost.type` était la SEULE erreur TS du lot, noyée dans la dette de
 * `apps/web`. Le comportement se verrouille donc ici, pas au compilateur.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

type PostCardStubProps = { content?: string; onRepost?: () => void };
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: ({ content, onRepost }: PostCardStubProps) => (
    <button data-testid={`open-repost-${content}`} onClick={onRepost}>Repost</button>
  ),
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

// W8 — la carte du fil ouvre la porte `repost` du meuble unifié. Le stub ne
// peint la surface repost que pour cette porte ; les autres (`feedComposer`,
// `moodChip`) restent hors de portée de cette suite.
type MeeshyComposerRepostStubProps = {
  door: { kind: string; sourceFormat?: string };
  onRepost?: (payload: { targetType: string; isQuote: boolean; content?: string }) => void;
};
jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: ({ door, onRepost }: MeeshyComposerRepostStubProps) => {
    if (door.kind !== 'repost') return null;
    const targetType = (door.sourceFormat ?? 'post').toUpperCase();
    return (
      <div>
        <button data-testid="modal-repost" onClick={() => onRepost?.({ targetType, isQuote: false })}>
          Confirm repost
        </button>
        <button
          data-testid="modal-quote"
          onClick={() => onRepost?.({ targetType, isQuote: true, content: 'mon commentaire' })}
        >
          Confirm quote
        </button>
      </div>
    );
  },
}));

jest.mock('@/services/posts.service', () => ({
  postsService: { recordMediaDownloads: jest.fn(), sharePost: jest.fn() },
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

const reelPost = {
  id: 'reel-7',
  authorId: 'author-2',
  type: 'REEL',
  visibility: 'PUBLIC',
  content: 'clip',
  author: { id: 'author-2', username: 'bob', displayName: 'Bob' },
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

/**
 * Un repost-de-story tel qu'il apparaît dans le fil : la CARTE est un POST,
 * sa RACINE est une story. Les deux ne se confondent pas — la référence
 * remonte à la racine, le FORMAT reste celui de la carte agie.
 */
const repostOfStoryPost = {
  ...reelPost,
  id: 'repost-9',
  type: 'POST',
  content: 'republie',
  repostOfId: 'story-root',
  repostOf: { id: 'story-root', type: 'STORY', content: 'la story d origine' },
};

jest.mock('@/hooks/queries/use-feed-query', () => ({
  useFeedQuery: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetching: false,
    dataUpdatedAt: 0,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useFeedPosts: () => [reelPost, repostOfStoryPost],
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
  useRepostMutation: () => ({ mutate: (...args: unknown[]) => mockRepostMutate(...args) }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({ usePostSocketCacheSync: jest.fn() }));
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

describe('PostsFeedScreen — le repost miroite le type de sa source', () => {
  beforeEach(() => jest.clearAllMocks());

  it("republier un REEL envoie targetType 'REEL', jamais le defaut POST", () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('open-repost-clip'));
    fireEvent.click(screen.getByTestId('modal-repost'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'reel-7', data: { isQuote: false, targetType: 'REEL' } },
      expect.anything(),
    );
  });

  it("citer un REEL porte le meme type que la republication nue", () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('open-repost-clip'));
    fireEvent.click(screen.getByTestId('modal-quote'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'reel-7', data: { content: 'mon commentaire', isQuote: true, targetType: 'REEL' } },
      expect.anything(),
    );
  });

  /**
   * La RÉFÉRENCE et le FORMAT ne suivent pas le même chemin, et c'est le piège
   * du lot :
   *
   * - la RÉFÉRENCE remonte à la RACINE. `repostPost` écrit `repostOfId` TEL
   *   QUEL (`PostService.repostPost`), et `repostOfInclude` ne fait qu'UN saut
   *   à la relecture : viser le maillon donnerait une carte encastrée vide, la
   *   coquille intermédiaire n'ayant ni contenu ni média propre.
   * - le FORMAT reste celui de la carte agie. Il ne suit PAS la racine —
   *   « corriger » `repostingPost.type` en `post.repostOf?.type` fabriquerait
   *   une story de 20 h dans le tray, jamais demandée.
   */
  it("republier un repost-de-story vise la RACINE mais garde le format de la CARTE", () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('open-repost-republie'));
    fireEvent.click(screen.getByTestId('modal-repost'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'story-root', data: { isQuote: false, targetType: 'POST' } },
      expect.anything(),
    );
  });

  it('la citation vise la même racine que la republication nue', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('open-repost-republie'));
    fireEvent.click(screen.getByTestId('modal-quote'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'story-root', data: { content: 'mon commentaire', isQuote: true, targetType: 'POST' } },
      expect.anything(),
    );
  });
});
