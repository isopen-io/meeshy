/**
 * Tests for the story deep-link page's minimal repost wiring (Task 4, point 4).
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

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useRepostMutation: () => ({ mutate: mockRepostMutate, isPending: false }),
}));

jest.mock('@/hooks/social/use-post-room', () => ({ usePostRoom: jest.fn() }));
jest.mock('@/hooks/queries/use-post-socket-cache-sync', () => ({
  usePostSocketCacheSync: jest.fn(),
}));
jest.mock('@/hooks/use-post-translation', () => ({ usePreferredLanguage: () => 'fr' }));
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

type StoryViewerStubProps = {
  onRepost?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  StoryViewer: ({ onRepost, stories }: StoryViewerStubProps) => (
    <div>
      {onRepost && (
        <button data-testid="story-repost" onClick={() => onRepost(stories[0]?.id ?? '')}>
          Repost
        </button>
      )}
    </div>
  ),
}));

jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: jest.fn() },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportStory: jest.fn() },
}));

import StoryPage from '@/app/story/[postId]/page';

describe('StoryPage — minimal repost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepostMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
  });

  it('reposts a story directly (no modal) via POST /posts/:id/repost, isQuote:false', async () => {
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-repost'));
    });

    await waitFor(() =>
      expect(mockRepostMutate).toHaveBeenCalledWith(
        { postId: 'story-1', data: { isQuote: false } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
  });
});
