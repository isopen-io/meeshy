/**
 * Tests for the reel deep-link page's Report wiring (Task 4, point 0).
 * ReelPlayer exposes an `onReport` callback (Task 3) but this page never
 * wired it to reportService.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'reel-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const mockReel = {
  id: 'reel-1',
  authorId: 'author-2',
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

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useLikePostMutation: () => ({ mutate: jest.fn() }),
  useUnlikePostMutation: () => ({ mutate: jest.fn() }),
  useBookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useUnbookmarkPostMutation: () => ({ mutate: jest.fn() }),
  useSharePostMutation: () => ({ mutate: jest.fn() }),
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: false }),
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

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));
jest.mock('@/components/v2/RepostModal', () => ({ RepostModal: () => null }));

type ReelPlayerStubProps = {
  onReport?: () => void;
};
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onReport }: ReelPlayerStubProps) => (
    <div>{onReport && <button data-testid="reel-report" onClick={onReport}>Report</button>}</div>
  ),
}));

const mockReportPost = jest.fn();
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: (...args: unknown[]) => mockReportPost(...args) },
}));

import ReelPage from '@/app/reel/[postId]/page';

describe('ReelPage — report wiring', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockReportPost.mockResolvedValue({});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('calls reportService.reportPost with reportType inappropriate and no reason after confirm', async () => {
    render(<ReelPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('reel-report'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockReportPost).toHaveBeenCalledWith('reel-1', 'inappropriate', ''));
  });

  it('does not call reportService when the confirm is dismissed', async () => {
    confirmSpy.mockReturnValue(false);
    render(<ReelPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('reel-report'));
    });

    expect(mockReportPost).not.toHaveBeenCalled();
  });

  it('withholds onReport on the author own reel', () => {
    const originalAuthorId = mockReel.authorId;
    mockReel.authorId = 'viewer-1';
    render(<ReelPage />);

    expect(screen.queryByTestId('reel-report')).not.toBeInTheDocument();

    mockReel.authorId = originalAuthorId;
  });
});
