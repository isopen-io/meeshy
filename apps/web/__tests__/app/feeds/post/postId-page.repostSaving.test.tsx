/**
 * Témoin de câblage — moitié « hôte » du constat A (revue adversariale),
 * pour `app/feeds/post/[postId]/page.tsx`. Voir
 * `PostsFeedScreen.repostSaving.test.tsx` pour le contexte complet.
 * Retirer `repostSaving={isReposting}` de ce fichier doit faire rougir
 * CETTE suite.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'post-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/lib/notifications/notification-read-sync', () => ({
  markScopeNotificationsRead: jest.fn(),
}));

const mockPost: Record<string, unknown> = {
  id: 'post-1',
  authorId: 'author-2',
  type: 'POST',
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

// `isPending: true` — un repost EN VOL. Le seul chemin qui doit le refléter
// est `useComposerRepost().isPending` → `repostSaving` sur le meuble.
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: true }),
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

type PostDetailStubProps = { onRepost?: () => void };
jest.mock('@/components/v2/PostDetail', () => ({
  PostDetail: ({ onRepost }: PostDetailStubProps) => (
    <div>
      {onRepost && (
        <button data-testid="detail-open-repost" onClick={onRepost}>
          Repost
        </button>
      )}
    </div>
  ),
}));

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

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: jest.fn() }) }));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'viewer-1', username: 'alice' }, isAuthenticated: true }),
}));

jest.mock('@/services/posts.service', () => ({
  postsService: {
    viewPost: jest.fn().mockResolvedValue(undefined),
    sharePost: jest.fn(),
    recordMediaDownloads: jest.fn(),
  },
  recordAnonymousView: jest.fn(),
}));
jest.mock('@/lib/anonymous-session', () => ({ getOrCreateWebSessionKey: () => 'session-key' }));
jest.mock('@/lib/reactions', () => ({ isHeartLikedByMe: () => false }));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import PostDetailPage from '@/app/feeds/post/[postId]/page';

describe('PostDetailPage — repostSaving atteint le meuble', () => {
  it('un repost EN VOL (useComposerRepost().isPending) atteint repostSaving sur la porte repost', () => {
    render(<PostDetailPage />);
    fireEvent.click(screen.getByTestId('detail-open-repost'));
    expect(screen.getByTestId('composer-repost-saving')).toHaveTextContent('true');
  });
});
