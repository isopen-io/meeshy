/**
 * Tests for ReelsFeedScreen's Repost wiring (Task 4, point 1).
 * ReelPlayer exposes `onRepost` — this wires RepostModal + useRepostMutation,
 * mirroring PostsFeedScreen's PostCard repost flow.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const mockReel: Record<string, unknown> = {
  id: 'reel-1',
  authorId: 'author-2',
  author: { id: 'author-2', displayName: 'Bob' },
  type: 'REEL',
  visibility: 'PUBLIC',
  content: 'Hello',
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

jest.mock('@/hooks/queries/use-reels-feed-query', () => ({
  useReelsFeedQuery: () => ({
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  }),
  useReelsFeedPosts: () => [mockReel],
}));

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useSharePostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: mockRepostMutate, isPending: false }),
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

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ record: jest.fn() }),
}));
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ id: 'viewer-1' }),
}));

jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));
jest.mock('@/components/v2/CommentList', () => ({ CommentList: () => null }));

type RepostModalStubProps = {
  open: boolean;
  onRepost: () => void;
  onQuote: (content: string) => void;
  onClose: () => void;
};
jest.mock('@/components/v2/RepostModal', () => ({
  RepostModal: ({ open, onRepost, onQuote }: RepostModalStubProps) =>
    open ? (
      <div>
        <button data-testid="repost-modal-confirm" onClick={onRepost}>Confirm repost</button>
        <button data-testid="repost-modal-quote" onClick={() => onQuote('mon commentaire')}>Confirm quote</button>
      </div>
    ) : null,
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

type ReelPlayerStubProps = {
  onRepost?: () => void;
};
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onRepost }: ReelPlayerStubProps) => (
    <div>{onRepost && <button data-testid="reel-repost" onClick={onRepost}>Repost</button>}</div>
  ),
}));

import { ReelsFeedScreen } from '@/components/feed/ReelsFeedScreen';

describe('ReelsFeedScreen — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockReel.originalRepostOfId;
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  /**
   * Moitié RÉFÉRENCE de la loi : un réel repartagé n'a AUCUN média propre
   * (`repostPost` ne duplique les médias que pour une source éphémère). Viser
   * ce pointeur au lieu de la racine produirait un réel plein écran vide —
   * un dégradé portant un nom, en boucle, pour tous les spectateurs.
   */
  it("vise la RACINE quand le réel courant est lui-même un repost", async () => {
    mockReel.originalRepostOfId = 'reel-root';
    render(<ReelsFeedScreen />);

    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(await screen.findByTestId('repost-modal-confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-confirm'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-root', data: { isQuote: false, targetType: 'REEL' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  /**
   * Loi du miroir : un réel repartagé RESTE un réel. Ce test gravait le défaut
   * — il assérait l'égalité EXACTE `{ isQuote: false }`, sans `targetType` —,
   * si bien que le seul témoin du geste attestait l'absence du champ. Le
   * gateway retombait donc sur `?? POST` et le repost quittait le fil des
   * réels sans que personne ne l'ait demandé.
   *
   * Le format vient de la CARTE agie (`current.type`), jamais de la racine
   * d'une chaîne de reposts : c'est le gateway qui remonte la racine.
   */
  it('opens RepostModal from the reel action rail and reposts A REEL, not a POST', async () => {
    render(<ReelsFeedScreen />);

    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(await screen.findByTestId('repost-modal-confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-confirm'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-1', data: { isQuote: false, targetType: 'REEL' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });

  /**
   * La citation publie autant que le repost sec : elle porte la même loi. Ce
   * geste n'avait AUCUN témoin de charge utile — il partait sans garde, et
   * corriger le seul geste testé l'aurait laissé menteur.
   */
  it('carries the source format through the QUOTE gesture too', async () => {
    render(<ReelsFeedScreen />);

    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(await screen.findByTestId('repost-modal-quote')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-quote'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-1', data: { content: 'mon commentaire', isQuote: true, targetType: 'REEL' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});
