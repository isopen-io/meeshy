/**
 * Tests for HashtagPage's repost wiring (Task 2, point 4).
 * Full integration through the real PostCard (only Avatar/LanguageOrb/flags/
 * i18n mocked, like page.test.tsx) — a repost renders its nested original
 * card and the banner navigates to the original's detail page.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import HashtagPage from '@/app/hashtag/[tag]/page';
import type { Post } from '@meeshy/shared/types/post';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ tag: 'paris' }),
  useRouter: () => ({ push: mockPush }),
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

describe('HashtagPage — repost wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrendingHashtags.mockResolvedValue([]);
  });

  it("renders the repost banner and the original's content", async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [
        makePost({
          repostOf: {
            id: 'original-1',
            author: { id: 'user-2', username: 'bob', displayName: 'Bob' },
            content: 'Vue de #paris depuis le ciel',
            likeCount: 5,
            commentCount: 2,
          },
        }),
      ],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Reposted from @bob')).toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it("quote repost: outer bar keeps the quote's OWN counts (isQuote wired through)", async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [
        makePost({
          content: 'My take on this',
          isQuote: true,
          likeCount: 3,
          commentCount: 1,
          repostOf: {
            id: 'original-1',
            author: { id: 'user-2', username: 'bob', displayName: 'Bob' },
            content: 'Original content',
            likeCount: 5,
            commentCount: 2,
          },
        }),
      ],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('post-card-repost-block')).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByTestId('repost-like-count')).toHaveTextContent('5');
  });

  it('navigates to the original post detail page when the repost banner is tapped', async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [
        makePost({
          repostOf: { id: 'original-1', author: { id: 'user-2', username: 'bob' }, content: 'Original', likeCount: 0, commentCount: 0 },
        }),
      ],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('post-card-repost-block')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('post-card-repost-block'));
    expect(mockPush).toHaveBeenCalledWith('/feeds/post/original-1');
  });
});
