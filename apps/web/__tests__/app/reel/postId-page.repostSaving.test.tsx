/**
 * Témoin de câblage — moitié « hôte » du constat A (revue adversariale),
 * pour `app/reel/[postId]/page.tsx`. Voir
 * `PostsFeedScreen.repostSaving.test.tsx` pour le contexte complet.
 * Retirer `repostSaving={isReposting}` de ce fichier doit faire rougir
 * CETTE suite.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

// `isPending: true` — un repost EN VOL. Le seul chemin qui doit le refléter
// est `useComposerRepost().isPending` → `repostSaving` sur le meuble.
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useSharePostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: true }),
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

jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: jest.fn() }) }));

// Stub délibérément MUET sur `door`/`onRepost` — le seul champ qui compte
// ici est `repostSaving`, rendu tel quel pour que le témoin discrimine sa
// VALEUR RÉELLE (`isReposting`) d'une absence silencieuse (`undefined`).
type MeeshyComposerRepostSavingStubProps = { door: { kind: string }; repostSaving?: boolean };
jest.mock('@/components/composer/MeeshyComposer', () => ({
  MeeshyComposer: ({ door, repostSaving }: MeeshyComposerRepostSavingStubProps) => {
    if (door.kind !== 'repost') return null;
    return <div data-testid="composer-repost-saving">{String(repostSaving)}</div>;
  },
}));

type ReelPlayerStubProps = { onRepost?: () => void };
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onRepost }: ReelPlayerStubProps) => (
    <div>{onRepost && <button data-testid="reel-repost" onClick={onRepost}>Repost</button>}</div>
  ),
}));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import ReelPage from '@/app/reel/[postId]/page';

describe('ReelPage — repostSaving atteint le meuble', () => {
  beforeEach(() => {
    delete mockReel.repostOfId;
    delete mockReel.originalRepostOfId;
  });

  it('un repost EN VOL (useComposerRepost().isPending) atteint repostSaving sur la porte repost', () => {
    render(<ReelPage />);
    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(screen.getByTestId('composer-repost-saving')).toHaveTextContent('true');
  });
});
