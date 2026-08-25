/**
 * Témoin de câblage — moitié « hôte » du constat A (revue adversariale).
 *
 * `composer-door-repost.test.tsx` prouve que `MeeshyComposer.repostSaving`
 * atteint le libellé `composer.repost.posting` UNE FOIS câblé — mais il monte
 * `MeeshyComposer` en lui passant `repostSaving` À LA MAIN. Aucun témoin ne
 * vérifie que `PostsFeedScreen` fournit RÉELLEMENT cette prop depuis
 * `useComposerRepost().isPending`. Retirer `repostSaving={isReposting}` de
 * `PostsFeedScreen.tsx` doit faire rougir CETTE suite.
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
    <button data-testid={`open-repost-${content}`} onClick={onRepost}>
      Repost
    </button>
  ),
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

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

const mockPost = {
  id: 'post-1',
  authorId: 'author-2',
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'clip',
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
  useFeedPosts: () => [mockPost],
  usePrefetchPost: () => jest.fn(),
}));

// `isPending: true` — un repost EN VOL. Le seul chemin qui doit le refléter
// est `useComposerRepost().isPending` → `repostSaving` sur le meuble.
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: true }),
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

describe('PostsFeedScreen — repostSaving atteint le meuble', () => {
  it('un repost EN VOL (useComposerRepost().isPending) atteint repostSaving sur la porte repost', () => {
    render(<PostsFeedScreen />);
    fireEvent.click(screen.getByTestId('open-repost-clip'));
    expect(screen.getByTestId('composer-repost-saving')).toHaveTextContent('true');
  });
});
