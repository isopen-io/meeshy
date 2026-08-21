/**
 * Constat 2 (F7c, rattrapage revue Opus, BLOQUANT) — `HashtagPage` ne passait
 * JAMAIS `backgroundSound`/`backgroundSoundMeta`/`backgroundSoundMuted`/
 * `onToggleBackgroundSoundMute` à `PostCard` : le badge B3.3-6, bien que
 * déclaré par le composant, n'était alimenté par aucun appelant réel — la
 * carte (1re des 3 surfaces B3.6) n'existait pas.
 *
 * Full integration through the real `PostCard` (only Avatar/LanguageOrb/flags/
 * i18n mocked, like `page.repost.test.tsx`) — proves the ANNOUNCEMENT text
 * actually reaches the screen, not just a prop capture.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import React from 'react';
import HashtagPage from '@/app/hashtag/[tag]/page';
import type { Post } from '@meeshy/shared/types/post';

jest.mock('next/navigation', () => ({
  useParams: () => ({ tag: 'paris' }),
  useRouter: () => ({ push: jest.fn() }),
}));

const mockGetPostsByHashtag = jest.fn();
const mockGetTrendingHashtags = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getPostsByHashtag: (...args: unknown[]) => mockGetPostsByHashtag(...args),
    getTrendingHashtags: (...args: unknown[]) => mockGetTrendingHashtags(...args),
  },
}));

jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

jest.mock('@/components/v2', () => ({
  useToast: () => ({ addToast: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'viewer-1' } }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span data-testid="language-orb" />,
}));

jest.mock('@/components/v2/flags', () => ({
  getLanguageName: (code: string) => code.toUpperCase(),
  getFlag: () => '🏳️',
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'user-1',
    author: { id: 'user-1', username: 'alice', displayName: 'Alice' },
    type: 'POST',
    visibility: 'PUBLIC',
    content: '',
    originalLanguage: 'fr',
    likeCount: 3,
    commentCount: 1,
    repostCount: 0,
    viewCount: 10,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  } as Post;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HashtagPage />
    </QueryClientProvider>,
  );
}

describe('HashtagPage — background sound wiring (constat 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrendingHashtags.mockResolvedValue([]);
  });

  it('renders the library credit announcement on the card', async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [
        makePost({
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
        }),
      ],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('background-sound-announcement')).toBeInTheDocument());
    expect(screen.getByTestId('background-sound-announcement')).toHaveTextContent('Chill Beat · @dj_zoe · 0:42');
  });

  it('mounts NO badge for a post without a background sound', async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [makePost()],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('avatar')).toBeInTheDocument());
    expect(screen.queryByTestId('background-sound-badge')).toBeNull();
  });

  it('starts muted and toggles the LOCAL state on click', async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [
        makePost({
          storyEffects: { v: 3, sound: { source: { t: 'original' }, volume: 1 }, scenes: [] },
        }),
      ],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('background-sound-mute-toggle')).toBeInTheDocument());
    expect(screen.getByTestId('background-sound-mute-toggle')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('background-sound-mute-toggle'));
    expect(screen.getByTestId('background-sound-mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
});
