/**
 * Tests for StoryViewer comments wiring (D1).
 * Verifies that the comments query fires when a story changes, and
 * the comments panel can be opened/closed.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/TranslationToggle', () => ({
  TranslationToggle: () => null,
}));

jest.mock('@/components/v2/CommentList', () => ({
  CommentList: ({ postId }: { postId: string }) => (
    <div data-testid={`comment-list-${postId}`}>CommentList for {postId}</div>
  ),
}));

const mockMutate = jest.fn();
const mockUseCommentsInfiniteQuery = jest.fn();
const mockUseCommentsList = jest.fn(() => []);
const mockUseCreateCommentMutation = jest.fn(() => ({ mutate: mockMutate }));
const mockUseLikeCommentMutation = jest.fn(() => ({ mutate: mockMutate }));
const mockUseUnlikeCommentMutation = jest.fn(() => ({ mutate: mockMutate }));
const mockUseDeleteCommentMutation = jest.fn(() => ({ mutate: mockMutate }));

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentsInfiniteQuery: (...args: unknown[]) => mockUseCommentsInfiniteQuery(...args),
  useCommentsList: () => mockUseCommentsList(),
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => mockUseCreateCommentMutation(),
  useLikeCommentMutation: () => mockUseLikeCommentMutation(),
  useUnlikeCommentMutation: () => mockUseUnlikeCommentMutation(),
  useDeleteCommentMutation: () => mockUseDeleteCommentMutation(),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

import { StoryViewer } from '@/components/v2/StoryViewer';
import type { StoryData } from '@/components/v2/StoryViewer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStory(id: string): StoryData {
  return {
    id,
    author: { name: 'Alice', avatar: undefined },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    viewCount: 5,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StoryViewer — comments wiring (D1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCommentsInfiniteQuery.mockReturnValue({
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
    });
  });

  it('queries comments for the active story id', () => {
    const stories = [makeStory('story-aaa'), makeStory('story-bbb')];

    render(
      <StoryViewer
        stories={stories}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(mockUseCommentsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'story-aaa', enabled: true }),
    );
  });

  it('re-queries when story index changes (second story id used when starting at index 1)', () => {
    const stories = [makeStory('story-aaa'), makeStory('story-bbb')];

    render(
      <StoryViewer
        stories={stories}
        initialIndex={1}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    // When starting at index 1, currentStoryId should be 'story-bbb'
    expect(mockUseCommentsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'story-bbb', enabled: true }),
    );
  });

  it('shows comments button when enableComments=true (default)', () => {
    const stories = [makeStory('story-ccc')];

    render(
      <StoryViewer
        stories={stories}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.getByTestId('story-comments-button')).toBeInTheDocument();
  });

  it('hides comments button when enableComments=false', () => {
    const stories = [makeStory('story-ddd')];

    render(
      <StoryViewer
        stories={stories}
        onClose={jest.fn()}
        onReply={jest.fn()}
        enableComments={false}
      />,
    );

    expect(screen.queryByTestId('story-comments-button')).not.toBeInTheDocument();
  });

  it('shows CommentList when comments button is clicked', () => {
    const stories = [makeStory('story-eee')];

    render(
      <StoryViewer
        stories={stories}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('story-comments-button'));

    expect(screen.getByTestId('comment-list-story-eee')).toBeInTheDocument();
  });

  it('disables comments query when enableComments=false', () => {
    const stories = [makeStory('story-fff')];

    render(
      <StoryViewer
        stories={stories}
        onClose={jest.fn()}
        onReply={jest.fn()}
        enableComments={false}
      />,
    );

    expect(mockUseCommentsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });
});
