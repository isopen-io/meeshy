/**
 * Tests for the story deep-link page's Report wiring (Task 4, point 0).
 * StoryViewer exposes an `onReport` callback (Task 3) but this page passed
 * `onDelete` without ever wiring `onReport` — non-author viewers had no way
 * to report a story reached via `/story/:id`.
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ postId: 'story-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const mockStoryPost = {
  id: 'story-1',
  authorId: 'author-2',
  type: 'STORY',
  visibility: 'FRIENDS',
  content: 'A story',
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

jest.mock('@/hooks/queries/use-post-query', () => ({
  usePostQuery: () => ({ isLoading: false, isError: false, data: mockStoryPost }),
}));

jest.mock('@/hooks/social/use-stories', () => ({
  useDeleteStoryMutation: () => ({ mutate: jest.fn() }),
  useRecordStoryViewMutation: () => ({ recordView: jest.fn() }),
}));

jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useRepostMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr', usePreferredLanguages: () => ['fr'] }));
jest.mock('@/hooks/use-comment-target', () => ({
  useCommentTarget: () => ({ targetCommentId: null, targetParentCommentId: null }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
      typeof paramsOrFallback === 'string' ? paramsOrFallback : key,
  }),
}));

jest.mock('@/lib/story-transforms', () => ({
  postToStoryData: (post: typeof mockStoryPost) => ({
    id: post.id,
    authorId: post.authorId,
    author: { name: 'Bob' },
    content: post.content,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
    viewCount: post.viewCount,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: 'viewer-1' } }),
}));

const mockAddToast = jest.fn();
type StoryViewerStubProps = {
  onReport?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
jest.mock('@/components/v2', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  StoryViewer: ({ onReport, stories }: StoryViewerStubProps) => (
    <div>
      {onReport && (
        <button data-testid="story-report" onClick={() => onReport(stories[0]?.id ?? '')}>
          Report
        </button>
      )}
    </div>
  ),
}));

const mockReportStory = jest.fn();
jest.mock('@/services/report.service', () => ({
  reportService: { reportStory: (...args: unknown[]) => mockReportStory(...args) },
}));

import StoryPage from '@/app/story/[postId]/page';

describe('StoryPage — report wiring', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockReportStory.mockResolvedValue({});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('calls reportService.reportStory with reportType inappropriate and no reason after confirm', async () => {
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-report'));
    });

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockReportStory).toHaveBeenCalledWith('story-1', 'inappropriate', ''));
  });

  it('does not call reportService when the confirm is dismissed', async () => {
    confirmSpy.mockReturnValue(false);
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-report'));
    });

    expect(mockReportStory).not.toHaveBeenCalled();
  });
});
