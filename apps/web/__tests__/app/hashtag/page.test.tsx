import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const mockReportPost = jest.fn();
jest.mock('@/services/report.service', () => ({
  reportService: {
    reportPost: (...args: unknown[]) => mockReportPost(...args),
  },
}));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({
  useToast: () => ({ addToast: mockAddToast }),
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
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="dashboard-layout" data-title={title}>
      {children}
    </div>
  ),
}));

function makePost(overrides: Partial<Post> = {}): Post {
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
    ...overrides,
  } as Post;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HashtagPage />
    </QueryClientProvider>,
  );
}

describe('HashtagPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [makePost()],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    mockGetTrendingHashtags.mockResolvedValue([{ tag: 'paris', usageCount: 42 }]);
  });

  it('shows the tag as the page title', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('dashboard-layout')).toHaveAttribute('data-title', '#paris'),
    );
  });

  it('fetches and renders posts matching the hashtag with clickable hashtag text', async () => {
    renderPage();
    expect(mockGetPostsByHashtag).toHaveBeenCalledWith('paris', { cursor: undefined, limit: 20 });
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: '#paris' }).length).toBeGreaterThan(1),
    );
    for (const link of screen.getAllByRole('link', { name: '#paris' })) {
      expect(link).toHaveAttribute('href', '/hashtag/paris');
    }
  });

  it('renders the trending hashtags list', async () => {
    renderPage();
    await waitFor(() => expect(mockGetTrendingHashtags).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: '#paris' }).length).toBeGreaterThan(0),
    );
  });

  it('shows an empty state when no posts match the tag', async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [],
      meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('No posts with this hashtag yet')).toBeInTheDocument(),
    );
  });

  it('wires PostCard onReport to reportService.reportPost, gated by confirm', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockReportPost.mockResolvedValue({});
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('post.menu')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('post.menu'));

    const reportButton = await screen.findByText('Report');
    await act(async () => {
      fireEvent.click(reportButton);
    });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockReportPost).toHaveBeenCalledWith('post-1', 'inappropriate', ''));
    confirmSpy.mockRestore();
  });

  it('withholds the Report entry on the viewer own post (isAuthor)', async () => {
    mockGetPostsByHashtag.mockResolvedValue({
      success: true,
      data: [makePost({ authorId: 'viewer-1', author: { id: 'viewer-1', username: 'me', displayName: 'Me' } })],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('post.menu')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('post.menu'));

    expect(screen.queryByText('Report')).not.toBeInTheDocument();
  });
});
