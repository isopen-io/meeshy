/**
 * Constat 2 (F7c, rattrapage revue Opus, BLOQUANT) — le détail de post
 * (`/feeds/post/:postId`, la 2e des 3 surfaces B3.6) ne passait JAMAIS
 * `backgroundSound`/`backgroundSoundMeta`/`backgroundSoundMuted`/
 * `onToggleBackgroundSoundMute` à `PostDetail` : le badge, bien que déclaré
 * par le composant, n'était alimenté par aucun appelant réel.
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

const mockPost = {
  id: 'post-1',
  authorId: 'author-2',
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'Hello world',
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
  storyEffects: {
    v: 3,
    sound: { source: { t: 'library', soundId: 'snd1' }, volume: 0.5 },
    scenes: [{
      id: 's1',
      objects: [{
        id: 'a1', kind: 'audio', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'content', z: 0,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        payload: { isBackground: true, name: 'Chill Beat', soundAuthorUsername: 'dj_zoe', duration: 42 },
      }],
    }],
  },
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

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  useUpdatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: false }),
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
  backgroundSound?: unknown;
  backgroundSoundMeta?: { title?: string; username?: string; durationSeconds?: number };
  backgroundSoundMuted?: boolean;
  onToggleBackgroundSoundMute?: () => void;
};
jest.mock('@/components/v2/PostDetail', () => ({
  PostDetail: ({ backgroundSound, backgroundSoundMeta, backgroundSoundMuted, onToggleBackgroundSoundMute }: PostDetailStubProps) => (
    <div>
      <div data-testid="post-detail-background-sound">{JSON.stringify(backgroundSound ?? null)}</div>
      <div data-testid="post-detail-background-sound-meta">{JSON.stringify(backgroundSoundMeta ?? null)}</div>
      <div data-testid="post-detail-background-sound-muted">{String(backgroundSoundMuted)}</div>
      {onToggleBackgroundSoundMute && (
        <button data-testid="post-detail-toggle-mute" onClick={onToggleBackgroundSoundMute}>Toggle</button>
      )}
    </div>
  ),
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

describe('PostDetailPage — background sound wiring (constat 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the v3 sound AND its library credit through to PostDetail', () => {
    render(<PostDetailPage />);
    expect(screen.getByTestId('post-detail-background-sound')).toHaveTextContent(
      JSON.stringify({ source: { t: 'library', soundId: 'snd1' }, volume: 0.5 }),
    );
    expect(screen.getByTestId('post-detail-background-sound-meta')).toHaveTextContent(
      JSON.stringify({ title: 'Chill Beat', username: 'dj_zoe', durationSeconds: 42 }),
    );
  });

  it('starts muted and toggles on click', () => {
    render(<PostDetailPage />);
    expect(screen.getByTestId('post-detail-background-sound-muted')).toHaveTextContent('true');
    fireEvent.click(screen.getByTestId('post-detail-toggle-mute'));
    expect(screen.getByTestId('post-detail-background-sound-muted')).toHaveTextContent('false');
  });
});
