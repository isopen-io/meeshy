/**
 * Tests for the reel deep-link page's media download analytics wiring (Task 4, point 3).
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { id: 'viewer-1' } }),
}));

const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({ useToast: () => ({ addToast: mockAddToast }) }));

type ReelPlayerStubProps = {
  onDownload?: (mediaId: string, owningPostId: string) => void;
};
jest.mock('@/components/feed/ReelPlayer', () => ({
  ReelPlayer: ({ onDownload }: ReelPlayerStubProps) => (
    <div>
      {onDownload && (
        <button data-testid="reel-download" onClick={() => onDownload('media-1', 'reel-1')}>
          Download
        </button>
      )}
      {onDownload && (
        <button data-testid="reel-download-repost" onClick={() => onDownload('orig-media-1', 'original-1')}>
          Download (repost)
        </button>
      )}
    </div>
  ),
}));

const mockRecordMediaDownloads = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: { recordMediaDownloads: (...args: unknown[]) => mockRecordMediaDownloads(...args) },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportPost: jest.fn() },
}));

import ReelPage from '@/app/reel/[postId]/page';

describe('ReelPage — media download analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pings recordMediaDownloads with the owning post id, media id and surface reel', () => {
    render(<ReelPage />);
    fireEvent.click(screen.getByTestId('reel-download'));

    expect(mockRecordMediaDownloads).toHaveBeenCalledWith('reel-1', ['media-1'], 'reel');
  });

  it('forwards the ORIGINAL post id ReelPlayer resolved for a reposted reel, not the displayed reel id', () => {
    render(<ReelPage />);
    fireEvent.click(screen.getByTestId('reel-download-repost'));

    expect(mockRecordMediaDownloads).toHaveBeenCalledWith('original-1', ['orig-media-1'], 'reel');
    expect(mockRecordMediaDownloads).not.toHaveBeenCalledWith(mockReel.id, ['orig-media-1'], 'reel');
  });
});
