/**
 * Tests for the post detail page's repost wiring (Task 2, point 4-5).
 * `usePostQuery` already returns the full `Post` (incl. `repostOf`), which
 * PostDetail reads directly — the page only needs to wire `onTapRepost`
 * (navigate to the original) and `onDownloadRepostMedia` (analytics ping
 * against the ORIGINAL's id, not the outer repost record's id).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'post-1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/lib/notifications/notification-read-sync', () => ({
  markScopeNotificationsRead: jest.fn(),
}));

/**
 * La carte servie ici est ELLE-MÊME un repost : sa racine est `original-1`.
 * C'est la seule forme qui DISCRIMINE la loi de la référence — sur une carte
 * plate, `originalRepostOfId ?? repostOfId ?? id` rend l'id de la carte et un
 * témoin resterait vert quoi qu'il arrive.
 */
function makeMockPost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'post-1',
    authorId: 'author-2',
    type: 'POST',
    visibility: 'PUBLIC',
    content: '',
    repostOfId: 'original-1',
    repostOf: { id: 'original-1', author: { id: 'author-3', username: 'bob' }, content: 'Original', likeCount: 1, commentCount: 0 },
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
    ...overrides,
  };
}

let mockPost: Record<string, unknown> = makeMockPost();

jest.mock('@/hooks/queries/use-post-query', () => ({
  usePostQuery: () => ({ isLoading: false, isError: false, data: mockPost }),
}));

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentsInfiniteQuery: () => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
  useCommentsList: () => [],
}));

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useRepostMutation: () => ({ mutate: (...args: unknown[]) => mockRepostMutate(...args), isPending: false }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-comment-target', () => ({
  useCommentTarget: () => ({ targetCommentId: null, targetParentCommentId: null }),
}));

type PostDetailStubProps = {
  onTapRepost?: (repostId: string) => void;
  onDownloadRepostMedia?: (mediaId: string) => void;
  onRepost?: () => void;
  onRepostAsPost?: () => void;
};
jest.mock('@/components/v2/PostDetail', () => ({
  PostDetail: ({ onTapRepost, onDownloadRepostMedia, onRepost, onRepostAsPost }: PostDetailStubProps) => (
    <div>
      {onTapRepost && (
        <button data-testid="post-detail-tap-repost" onClick={() => onTapRepost('original-1')}>
          Tap repost
        </button>
      )}
      {onDownloadRepostMedia && (
        <button data-testid="post-detail-download-repost-media" onClick={() => onDownloadRepostMedia('media-1')}>
          Download original media
        </button>
      )}
      {onRepost && (
        <button data-testid="detail-open-repost" onClick={onRepost}>
          Repost
        </button>
      )}
      {onRepostAsPost && (
        <button data-testid="detail-repost-as-post" onClick={onRepostAsPost}>
          Keep on my feed
        </button>
      )}
    </div>
  ),
}));

// W8 — le bouton `onRepost` de `PostDetail` ouvre désormais la porte `repost`
// du meuble unifié, pas `RepostModal`. `onRepostAsPost` (l'ANCRAGE direct, un
// tap, aucun dialogue) n'est PAS affecté par ce lot : il n'a jamais mounté
// `RepostModal`, voir `MeeshyComposer.tsx` — donc rien à mocker pour lui ici.
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
        <button data-testid="detail-modal-repost" onClick={() => onRepost?.({ targetType, isQuote: false })}>
          Confirm repost
        </button>
        <button
          data-testid="detail-modal-quote"
          onClick={() => onRepost?.({ targetType, isQuote: true, content: 'mon commentaire' })}
        >
          Confirm quote
        </button>
      </div>
    );
  },
}));
jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: jest.fn() }) }));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice' }, isAuthenticated: true }),
}));

const mockRecordMediaDownloads = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: {
    viewPost: jest.fn().mockResolvedValue(undefined),
    sharePost: jest.fn(),
    recordMediaDownloads: (...args: unknown[]) => mockRecordMediaDownloads(...args),
  },
  recordAnonymousView: jest.fn(),
}));
jest.mock('@/lib/anonymous-session', () => ({ getOrCreateWebSessionKey: () => 'session-key' }));
jest.mock('@/lib/reactions', () => ({ isHeartLikedByMe: () => false }));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import PostDetailPage from '@/app/feeds/post/[postId]/page';

describe('PostDetailPage — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost = makeMockPost();
  });

  it('navigates to the original post detail page when the repost banner is tapped', () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('post-detail-tap-repost'));
    expect(mockPush).toHaveBeenCalledWith('/feeds/post/original-1');
  });

  it("pings recordMediaDownloads with the ORIGINAL's id for repost media", () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('post-detail-download-repost-media'));
    expect(mockRecordMediaDownloads).toHaveBeenCalledWith('original-1', ['media-1'], 'detail');
  });

  /**
   * Les deux moitiés de la loi partent ensemble et ne se suivent PAS :
   *
   * - la RÉFÉRENCE remonte à la racine (`originalRepostOfId ?? repostOfId ??
   *   id`) — sans ce repli, reposter ce repost donnerait une carte encastrée
   *   VIDE, la coquille `original-1` n'ayant ni contenu ni média propre ;
   * - le FORMAT reste celui de la CARTE agie. Il ne suit pas la racine.
   */
  it("republier un POST envoie targetType 'POST' et l'id de la RACINE", () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('detail-open-repost'));
    fireEvent.click(screen.getByTestId('detail-modal-repost'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'original-1', data: { isQuote: false, targetType: 'POST' } },
      expect.anything(),
    );
  });

  /**
   * Cette page sert aussi `/post/[postId]` et `/mood/[postId]` : `post.type` y
   * vaut POST, REEL ou STATUS selon la carte — jamais un littéral. La citation
   * porte donc la même loi que la republication nue.
   */
  it('citer depuis la page de détail porte le même type que la republication nue', () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('detail-open-repost'));
    fireEvent.click(screen.getByTestId('detail-modal-quote'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'original-1', data: { content: 'mon commentaire', isQuote: true, targetType: 'POST' } },
      expect.anything(),
    );
  });

  /** La racine hydratée prime sur le maillon précédent — une chaîne se replie. */
  it("préfère originalRepostOfId à repostOfId quand le serveur l'a hydraté", () => {
    mockPost = makeMockPost({ repostOfId: 'maillon-2', originalRepostOfId: 'racine-0' });
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('detail-open-repost'));
    fireEvent.click(screen.getByTestId('detail-modal-repost'));

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'racine-0', data: { isQuote: false, targetType: 'POST' } },
      expect.anything(),
    );
  });

  /**
   * Le miroir et l'ancrage partent ENSEMBLE. Cette page est montée sur trois
   * routes — `/feeds/post/:id`, `/post/:id` et `/mood/:id`, cible officielle
   * de résolution des liens tracés de type STATUS — donc sa carte peut être
   * éphémère. Le miroir seul y serait DESTRUCTEUR : un mood reposté en STATUS
   * vit une heure, puis `ExpiredStoriesCleanupService` détruit la ligne, et
   * aucun bouton n'aurait permis de l'éviter.
   */
  describe("l'ancrage — « garder ça pour de bon »", () => {
    it('offre l\'ancrage sur un STATUS et le republie en POST permanent', () => {
      mockPost = makeMockPost({ id: 'mood-1', type: 'STATUS', repostOfId: null });
      render(<PostDetailPage />);

      fireEvent.click(screen.getByTestId('detail-repost-as-post'));

      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'mood-1', data: { isQuote: false, targetType: 'POST' } },
        expect.anything(),
      );
    });

    it('garde le miroir sur le geste nu — un STATUS reposté reste un STATUS', () => {
      mockPost = makeMockPost({ id: 'mood-1', type: 'STATUS', repostOfId: null });
      render(<PostDetailPage />);

      fireEvent.click(screen.getByTestId('detail-open-repost'));
      fireEvent.click(screen.getByTestId('detail-modal-repost'));

      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'mood-1', data: { isQuote: false, targetType: 'STATUS' } },
        expect.anything(),
      );
    });

    it("offre l'ancrage sur une STORY ouverte par la bannière d'un repost", () => {
      mockPost = makeMockPost({ id: 'story-1', type: 'STORY', repostOfId: null });
      render(<PostDetailPage />);

      fireEvent.click(screen.getByTestId('detail-repost-as-post'));

      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false, targetType: 'POST' } },
        expect.anything(),
      );
    });

    it("offre l'ancrage sur un REEL — le jumeau iOS l'offre pour tout format sauf POST", () => {
      mockPost = makeMockPost({ id: 'reel-1', type: 'REEL', repostOfId: null });
      render(<PostDetailPage />);

      expect(screen.getByTestId('detail-repost-as-post')).toBeInTheDocument();
    });

    it("ne le propose PAS sur un POST — il est déjà son propre ancrage", () => {
      render(<PostDetailPage />);
      expect(screen.queryByTestId('detail-repost-as-post')).not.toBeInTheDocument();
    });
  });
});
