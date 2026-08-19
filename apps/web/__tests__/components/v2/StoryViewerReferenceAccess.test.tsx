/**
 * Task 6 (plan post-references-web) — le viewer ouvre un contenu EXPIRÉ quand
 * le serveur l'autorise (`referenceAccess`), jamais via un recalcul local sur
 * `expiresAt`. Le rendu ne consomme jamais le droit — seule la vue affichée
 * le fait (`onView`).
 */
import { render, screen } from '@testing-library/react';
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

function expiredStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    id: 'story-expired',
    author: { name: 'Alice', avatar: undefined },
    createdAt: new Date(Date.now() - 25 * 3600_000).toISOString(),
    expiresAt: new Date(Date.now() - 3600_000).toISOString(),
    viewCount: 3,
    ...overrides,
  };
}

describe('StoryViewer — accès par référence', () => {
  it('affiche une story expirée quand le droit est intact', () => {
    render(
      <StoryViewer stories={[expiredStory({ referenceAccess: 'granted' })]} onClose={jest.fn()} />
    );
    expect(screen.queryByText(/plus disponible/i)).toBeNull();
  });

  it("affiche l'écran de fin quand le droit est éteint", () => {
    render(
      <StoryViewer stories={[expiredStory({ referenceAccess: 'consumed' })]} onClose={jest.fn()} />
    );
    expect(screen.getByText(/plus disponible/i)).toBeInTheDocument();
  });

  it('garde le comportement actuel sans référence', () => {
    render(
      <StoryViewer stories={[expiredStory({ referenceAccess: 'none' })]} onClose={jest.fn()} />
    );
    expect(screen.getByText(/plus disponible/i)).toBeInTheDocument();
  });

  it('bloque aussi quand le champ est absent (serveur non déployé = none)', () => {
    render(<StoryViewer stories={[expiredStory({ referenceAccess: undefined })]} onClose={jest.fn()} />);
    expect(screen.getByText(/plus disponible/i)).toBeInTheDocument();
  });

  it('ne consomme aucun droit au simple rendu', () => {
    const onView = jest.fn();
    render(
      <StoryViewer
        stories={[expiredStory({ referenceAccess: 'granted' })]}
        onClose={jest.fn()}
        onView={onView}
      />
    );
    expect(onView).not.toHaveBeenCalled();
  });

  it('continue de marquer une story VIVANTE comme vue au montage (non-régression)', () => {
    const onView = jest.fn();
    const liveStory: StoryData = {
      id: 'story-live',
      author: { name: 'Alice', avatar: undefined },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      viewCount: 1,
    };
    render(<StoryViewer stories={[liveStory]} onClose={jest.fn()} onView={onView} />);
    expect(onView).toHaveBeenCalledWith('story-live');
  });
});
