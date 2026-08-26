/**
 * Tests for the reel deep-link page's Repost wiring (Task 4, point 1).
 * ReelPlayer exposes `onRepost`; this page never wired RepostModal + useRepostMutation.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'reel-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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

jest.mock('@/hooks/queries/use-post-query', () => ({
  usePostQuery: () => ({ isLoading: false, isError: false, data: mockReel }),
}));

jest.mock('@/hooks/queries/use-reels-feed-query', () => ({
  useReelsFeedQuery: () => ({ hasNextPage: false, isFetchingNextPage: false, fetchNextPage: jest.fn() }),
  useReelsFeedPosts: () => [],
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

jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-impression-tracking', () => ({
  useImpressionTracking: () => ({ record: jest.fn() }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/lib/notifications/notification-read-sync', () => ({
  markScopeNotificationsRead: jest.fn(),
}));
jest.mock('@/lib/clipboard', () => ({ copyToClipboard: jest.fn() }));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { id: 'viewer-1' } }),
}));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));

// W8 — le rail d'action ouvre désormais la porte `repost` du meuble unifié.
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
        <button data-testid="repost-modal-confirm" onClick={() => onRepost?.({ targetType, isQuote: false })}>
          Confirm repost
        </button>
        <button
          data-testid="repost-modal-quote"
          onClick={() => onRepost?.({ targetType, isQuote: true, content: 'mon commentaire' })}
        >
          Confirm quote
        </button>
      </div>
    );
  },
}));

type ReelPlayerStubProps = {
  onRepost?: () => void;
};
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onRepost }: ReelPlayerStubProps) => (
    <div>{onRepost && <button data-testid="reel-repost" onClick={onRepost}>Repost</button>}</div>
  ),
}));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import ReelPage from '@/app/reel/[postId]/page';

describe('ReelPage — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockReel.repostOfId;
    delete mockReel.originalRepostOfId;
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  /**

   * Loi du miroir (directive 2026-08-23) : un réel repartagé RESTE un réel.

   * Ce test assérait `{ isQuote: false }` sans `targetType` — donc il gravait

   * la rétrogradation silencieuse : le gateway retombait sur `?? POST` et le

   * repost quittait le fil des réels sans que rien ne le signale.

   */

  it('opens RepostModal from the reel action rail and reposts via useRepostMutation', async () => {
    render(<ReelPage />);

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
   * Moitié RÉFÉRENCE de la même loi : le repli remonte la chaîne
   * (`originalRepostOfId ?? repostOfId ?? id`). Le test ci-dessus reste vert
   * sur une carte plate — c'est le troisième terme du repli —, donc seul ce
   * témoin-ci discrimine.
   */
  it("vise la RACINE quand le réel affiché est lui-même un repost", async () => {
    mockReel.repostOfId = 'reel-root';
    render(<ReelPage />);

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

  it('la citation porte la même racine et le même format que la republication nue', async () => {
    mockReel.repostOfId = 'reel-root';
    render(<ReelPage />);

    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(await screen.findByTestId('repost-modal-quote')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('repost-modal-quote'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'reel-root', data: { content: 'mon commentaire', isQuote: true, targetType: 'REEL' } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});
