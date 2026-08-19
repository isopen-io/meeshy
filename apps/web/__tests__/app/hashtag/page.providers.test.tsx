import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import HashtagLayout from '@/app/hashtag/layout';
import HashtagPage from '@/app/hashtag/[tag]/page';
import type { Post } from '@meeshy/shared/types/post';

/**
 * Garde de PROVIDERS pour `/hashtag/:tag`.
 *
 * `page.test.tsx` mocke `@/components/v2` en entier (`useToast: () => ({ addToast })`),
 * si bien que le vrai hook n'y est jamais exercé : aucune de ses assertions ne
 * pouvait tomber quand la route a été livrée SANS `layout.tsx`, et la page
 * plantait en production sur
 * `Error: useToast must be used within a ToastProvider`.
 *
 * Ce fichier monte donc le layout de la route AU-DESSUS de la page avec le VRAI
 * `Toast.tsx` (`requireActual`) des deux côtés du contrat : le provider vient de
 * `FeedProviders`, le hook vient de la page. Seul le reste du barrel — lourd et
 * hors sujet — est stubé.
 *
 * Tombe si : le layout disparaît, ou cesse de monter un `ToastProvider`.
 */

jest.mock('next/navigation', () => ({
  useParams: () => ({ tag: 'paris' }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/v2', () => {
  const actualToast = jest.requireActual('@/components/v2/Toast');
  return {
    ToastProvider: actualToast.ToastProvider,
    useToast: actualToast.useToast,
    V2ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ThemeScript: () => null,
    SplitViewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: true, isChecking: false, isAnonymous: false }),
}));

const mockGetPostsByHashtag = jest.fn();
const mockGetTrendingHashtags = jest.fn();

jest.mock('@/services/posts.service', () => ({
  postsService: {
    getPostsByHashtag: (...args: unknown[]) => mockGetPostsByHashtag(...args),
    getTrendingHashtags: (...args: unknown[]) => mockGetTrendingHashtags(...args),
  },
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

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span data-testid="language-orb" />,
}));

jest.mock('@/components/v2/flags', () => ({
  getLanguageName: (code: string) => code.toUpperCase(),
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="dashboard-layout" data-title={title}>
      {children}
    </div>
  ),
}));

function makePost(): Post {
  return {
    id: 'post-1',
    authorId: 'user-1',
    author: { id: 'user-1', username: 'alice', displayName: 'Alice' },
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Vue de #paris',
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
  } as Post;
}

describe('HashtagPage — provider stack fournie par la route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [makePost()],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    mockGetTrendingHashtags.mockResolvedValue([]);
  });

  it('monte la page sous un vrai ToastProvider — useToast resout au lieu de lever', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HashtagLayout>
          <HashtagPage />
        </HashtagLayout>
      </QueryClientProvider>,
    );

    // Le corps de HashtagPage s'est exécuté jusqu'au bout : `useToast()` a
    // résolu au lieu de lever, et la carte du post est montée.
    await waitFor(() =>
      expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-title', '#paris'),
    );
    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0));
  });
});
