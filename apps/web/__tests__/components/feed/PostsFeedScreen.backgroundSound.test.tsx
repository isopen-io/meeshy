/**
 * Constat 2 (F7c, rattrapage revue Opus, BLOQUANT) — `PostsFeedScreen` ne
 * passait JAMAIS `backgroundSound`/`backgroundSoundMeta`/`backgroundSoundMuted`/
 * `onToggleBackgroundSoundMute` à `PostCard` : le badge B3.3-6, bien que
 * déclaré par le composant, n'était alimenté par aucun appelant réel — la
 * carte (1re des 3 surfaces B3.6) n'existait pas.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

type PostCardStubProps = {
  backgroundSound?: unknown;
  backgroundSoundMeta?: { title?: string; username?: string; durationSeconds?: number };
  backgroundSoundMuted?: boolean;
  onToggleBackgroundSoundMute?: () => void;
};
jest.mock('@/components/v2', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  useToast: () => ({ addToast: jest.fn() }),
  PostCard: ({ backgroundSound, backgroundSoundMeta, backgroundSoundMuted, onToggleBackgroundSoundMute }: PostCardStubProps) => (
    <div>
      <div data-testid="post-card-background-sound">{JSON.stringify(backgroundSound ?? null)}</div>
      <div data-testid="post-card-background-sound-meta">{JSON.stringify(backgroundSoundMeta ?? null)}</div>
      <div data-testid="post-card-background-sound-muted">{String(backgroundSoundMuted)}</div>
      {onToggleBackgroundSoundMute && (
        <button data-testid="post-card-toggle-mute" onClick={onToggleBackgroundSoundMute}>Toggle</button>
      )}
    </div>
  ),
  StoryTray: () => null,
  StatusBar: () => null,
  StoryViewer: () => null,
  StoryComposer: () => null,
  StatusComposer: () => null,
}));

jest.mock('@/components/v2/Skeleton', () => ({ Skeleton: () => null }));

jest.mock('@/services/posts.service', () => ({
  postsService: { recordMediaDownloads: jest.fn() },
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
  content: '',
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
  useFeedPosts: () => [mockPost],
  usePrefetchPost: () => jest.fn(),
}));

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useCreatePostMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useTranslatePostMutation: () => ({ mutate: jest.fn() }),
  useDeletePostMutation: () => ({ mutate: jest.fn() }),
  usePinPostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn() }),
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

describe('PostsFeedScreen — background sound wiring (constat 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the v3 sound AND its library credit through to PostCard', () => {
    render(<PostsFeedScreen />);
    expect(screen.getByTestId('post-card-background-sound')).toHaveTextContent(
      JSON.stringify({ source: { t: 'library', soundId: 'snd1' }, volume: 0.5 }),
    );
    expect(screen.getByTestId('post-card-background-sound-meta')).toHaveTextContent(
      JSON.stringify({ title: 'Chill Beat', username: 'dj_zoe', durationSeconds: 42 }),
    );
  });

  it('starts muted and toggles on click', () => {
    render(<PostsFeedScreen />);
    expect(screen.getByTestId('post-card-background-sound-muted')).toHaveTextContent('true');
    fireEvent.click(screen.getByTestId('post-card-toggle-mute'));
    expect(screen.getByTestId('post-card-background-sound-muted')).toHaveTextContent('false');
  });
});
