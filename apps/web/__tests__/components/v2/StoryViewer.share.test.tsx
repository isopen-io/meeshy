/**
 * Tests for StoryViewer's Share action (Task 4, point 2).
 * The story viewer had no share entry point at all — this adds an `onShare`
 * callback + button next to Report/Close in the header.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));
jest.mock('@/components/v2/TranslationToggle', () => ({ TranslationToggle: () => null }));
jest.mock('@/components/v2/CommentList', () => ({ CommentList: () => <div data-testid="comment-list" /> }));

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
  useCreateCommentMutation: () => ({ mutate: jest.fn() }),
  useLikeCommentMutation: () => ({ mutate: jest.fn() }),
  useUnlikeCommentMutation: () => ({ mutate: jest.fn() }),
  useDeleteCommentMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { id: 'user-1', username: 'alice', avatar: null } }),
}));

jest.mock('@/hooks/social/use-stories', () => ({
  useReactToStoryMutation: () => ({ mutate: jest.fn() }),
}));

import { StoryViewer } from '@/components/v2/StoryViewer';
import type { StoryData } from '@/components/v2/StoryViewer';

function makeStory(id: string, overrides: Partial<StoryData> = {}): StoryData {
  return {
    id,
    author: { name: 'Alice', avatar: undefined },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    viewCount: 5,
    ...overrides,
  };
}

describe('StoryViewer — share action', () => {
  it('shows a Share button when onShare is provided', () => {
    render(
      <StoryViewer stories={[makeStory('story-1')]} onClose={jest.fn()} onShare={jest.fn()} />,
    );

    expect(screen.getByLabelText('Share')).toBeInTheDocument();
  });

  it('calls onShare with the current story id', () => {
    const onShare = jest.fn();
    render(
      <StoryViewer stories={[makeStory('story-2')]} onClose={jest.fn()} onShare={onShare} />,
    );

    fireEvent.click(screen.getByLabelText('Share'));
    expect(onShare).toHaveBeenCalledWith('story-2');
  });

  it('does not show Share without an onShare handler', () => {
    render(<StoryViewer stories={[makeStory('story-3')]} onClose={jest.fn()} />);
    expect(screen.queryByLabelText('Share')).not.toBeInTheDocument();
  });
});
