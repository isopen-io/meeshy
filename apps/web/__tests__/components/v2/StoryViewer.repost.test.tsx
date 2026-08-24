/**
 * Tests for StoryViewer's minimal Repost action (Task 4, point 4).
 * "Republier" is a direct one-tap action — no canvas reprojection, no quote
 * UI — links to the original story via the generic POST /posts/:id/repost.
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

describe('StoryViewer — minimal repost action', () => {
  it('shows a Repost entry when onRepost is provided', () => {
    render(
      <StoryViewer stories={[makeStory('story-1')]} onClose={jest.fn()} onRepost={jest.fn()} />,
    );

    expect(screen.getByLabelText('Repost')).toBeInTheDocument();
  });

  it('calls onRepost with the current story id, no confirmation UI', () => {
    const onRepost = jest.fn();
    render(
      <StoryViewer stories={[makeStory('story-2')]} onClose={jest.fn()} onRepost={onRepost} />,
    );

    fireEvent.click(screen.getByLabelText('Repost'));
    expect(onRepost).toHaveBeenCalledWith('story-2');
  });

  it('does not show Repost without an onRepost handler', () => {
    render(<StoryViewer stories={[makeStory('story-3')]} onClose={jest.fn()} />);
    expect(screen.queryByLabelText('Repost')).not.toBeInTheDocument();
  });

  /**
   * L'ANCRAGE — « garder ça pour de bon ». Le miroir laisse l'éphémère
   * éphémère (20 h), l'ancrage le rend permanent : deux effets différents,
   * donc DEUX contrôles distincts.
   *
   * Le bouton n'avait aucun témoin ici — les tests de page passent par un stub
   * de StoryViewer, si bien que le supprimer laissait toute la suite verte.
   */
  it("montre l'ancrage, DISTINCT du miroir, quand onRepostAsPost est fourni", () => {
    const onRepost = jest.fn();
    const onRepostAsPost = jest.fn();
    render(
      <StoryViewer
        stories={[makeStory('story-4')]}
        onClose={jest.fn()}
        onRepost={onRepost}
        onRepostAsPost={onRepostAsPost}
      />,
    );

    fireEvent.click(screen.getByLabelText('Keep on my feed'));
    expect(onRepostAsPost).toHaveBeenCalledWith('story-4');
    expect(onRepost).not.toHaveBeenCalled();
  });

  it("n'affiche pas l'ancrage sans onRepostAsPost, même quand le miroir est offert", () => {
    render(
      <StoryViewer stories={[makeStory('story-5')]} onClose={jest.fn()} onRepost={jest.fn()} />,
    );

    expect(screen.getByLabelText('Repost')).toBeInTheDocument();
    expect(screen.queryByLabelText('Keep on my feed')).not.toBeInTheDocument();
  });
});
