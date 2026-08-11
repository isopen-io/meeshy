/**
 * Tests for StoryViewer reaction wiring (Task 3, point 3).
 * `useReactToStoryMutation` (apps/web/hooks/social/use-stories.ts) was written
 * and tested but never imported anywhere — this wires it to a reaction button
 * in the story viewer.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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
  CommentList: () => <div data-testid="comment-list" />,
}));

const mockCommentMutate = jest.fn();

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentsInfiniteQuery: () => ({
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
  useCommentsList: () => [],
}));

jest.mock('@/hooks/queries/use-comment-mutations', () => ({
  useCreateCommentMutation: () => ({ mutate: mockCommentMutate }),
  useLikeCommentMutation: () => ({ mutate: mockCommentMutate }),
  useUnlikeCommentMutation: () => ({ mutate: mockCommentMutate }),
  useDeleteCommentMutation: () => ({ mutate: mockCommentMutate }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

const mockReactMutate = jest.fn();
const mockUseReactToStoryMutation = jest.fn(() => ({ mutate: mockReactMutate }));

jest.mock('@/hooks/social/use-stories', () => ({
  useReactToStoryMutation: () => mockUseReactToStoryMutation(),
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

describe('StoryViewer — reaction wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a reaction button', () => {
    render(
      <StoryViewer
        stories={[makeStory('story-aaa')]}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.getByTestId('story-reaction-button')).toBeInTheDocument();
  });

  it('opens the emoji picker when the reaction button is clicked', () => {
    render(
      <StoryViewer
        stories={[makeStory('story-bbb')]}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('story-reaction-button'));

    expect(screen.getByTestId('story-reaction-picker')).toBeInTheDocument();
  });

  it('calls useReactToStoryMutation().mutate with the story id and picked emoji', () => {
    render(
      <StoryViewer
        stories={[makeStory('story-ccc')]}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('story-reaction-button'));
    fireEvent.click(screen.getByText('🔥'));

    expect(mockReactMutate).toHaveBeenCalledWith({ storyId: 'story-ccc', emoji: '🔥' });
  });

  it('closes the picker after picking an emoji', () => {
    render(
      <StoryViewer
        stories={[makeStory('story-ddd')]}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('story-reaction-button'));
    fireEvent.click(screen.getByText('❤️'));

    expect(screen.queryByTestId('story-reaction-picker')).not.toBeInTheDocument();
  });
});
