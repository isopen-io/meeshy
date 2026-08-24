/**
 * Tests for the story deep-link page's enriched share flow (Task 4, point 2).
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

type StoryViewerStubProps = {
  onShare?: (storyId: string) => void;
  stories: Array<{ id: string }>;
};
const mockAddToast = jest.fn();
jest.mock('@/components/v2', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  StoryViewer: ({ onShare, stories }: StoryViewerStubProps) => (
    <div>
      {onShare && (
        <button data-testid="story-share" onClick={() => onShare(stories[0]?.id ?? '')}>
          Share
        </button>
      )}
    </div>
  ),
}));

const mockSharePost = jest.fn();
jest.mock('@/services/posts.service', () => ({
  postsService: { sharePost: (...args: unknown[]) => mockSharePost(...args) },
}));
jest.mock('@/services/report.service', () => ({
  reportService: { reportStory: jest.fn() },
}));

import StoryPage from '@/app/story/[postId]/page';

describe('StoryPage — enriched share', () => {
  let clipboardWriteText: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clipboardWriteText }, configurable: true });
    mockSharePost.mockResolvedValue({ shared: true, shareCount: 1, shortUrl: 'https://meeshy.me/l/storyabc', token: 'storyabc' });
    // @ts-expect-error test-only removal of a browser API
    delete navigator.share;
  });

  it('requests a tracking link and copies it to the clipboard (no navigator.share)', async () => {
    render(<StoryPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('story-share'));
    });

    await waitFor(() => expect(mockSharePost).toHaveBeenCalledWith('story-1', { generateLink: true }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('https://meeshy.me/l/storyabc'));
  });

  it('hands the tracked link to navigator.share when available', async () => {
    const mockNavigatorShare = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<StoryPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('story-share'));
    });

    await waitFor(() =>
      expect(mockNavigatorShare).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://meeshy.me/l/storyabc' })),
    );
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });

  it('does not claim "Link copied!" when the user dismisses the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const mockNavigatorShare = jest.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, 'share', { value: mockNavigatorShare, configurable: true });

    render(<StoryPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('story-share'));
    });

    await waitFor(() => expect(mockNavigatorShare).toHaveBeenCalled());
    expect(clipboardWriteText).not.toHaveBeenCalled();
    expect(mockAddToast).not.toHaveBeenCalledWith('Link copied!', 'success');
    expect(mockAddToast).not.toHaveBeenCalledWith('Shared!', 'success');
  });
});
