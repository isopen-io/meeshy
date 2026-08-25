/**
 * Témoin de câblage — moitié « hôte » du constat A (revue adversariale),
 * pour `ReelsFeedScreen`. Voir `PostsFeedScreen.repostSaving.test.tsx` pour
 * le contexte complet : `MeeshyComposer.repostSaving` sait rendre
 * `composer.repost.posting` (`composer-door-repost.test.tsx`), mais AUCUN
 * témoin ne vérifiait que cet écran fournit réellement cette prop depuis
 * `useComposerRepost().isPending`. Retirer `repostSaving={isReposting}` de
 * `ReelsFeedScreen.tsx` doit faire rougir CETTE suite.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: jest.fn() }) }));
jest.mock('@/components/v2/CommentList', () => ({ CommentList: () => null }));

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

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

type ReelPlayerStubProps = { onRepost?: () => void };
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onRepost }: ReelPlayerStubProps) => (
    <div>{onRepost && <button data-testid="reel-repost" onClick={onRepost}>Repost</button>}</div>
  ),
}));

import { ReelsFeedScreen } from '@/components/feed/ReelsFeedScreen';

describe('ReelsFeedScreen — repostSaving atteint le meuble', () => {
  beforeEach(() => {
    delete mockReel.originalRepostOfId;
  });

  it('un repost EN VOL (useComposerRepost().isPending) atteint repostSaving sur la porte repost', () => {
    render(<ReelsFeedScreen />);
    fireEvent.click(screen.getByTestId('reel-repost'));
    expect(screen.getByTestId('composer-repost-saving')).toHaveTextContent('true');
  });
});
