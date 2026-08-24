/**
 * Cycle 123 — le chemin LEGACY de `StoryViewer` (web) et le Prisme.
 *
 * Deux défauts DISTINCTS, tous deux sur le chemin legacy (le chemin v3 passe
 * déjà `preferredLanguages` à `CanvasV3Scene`) :
 *
 *  A. Le CORPS de la story rendait `story.content` — l'ORIGINAL — pendant que
 *     la puce de `TranslationToggle` (montée en `showContent={false}`)
 *     annonçait la langue résolue. Le Prisme était ANNONCÉ sans être APPLIQUÉ :
 *     la puce disait « Français » au-dessus d'un paragraphe anglais.
 *  B. Les overlays de texte (`storyEffects.textObjects`) ne descendaient que le
 *     RANG 1 (`resolvePrismeText(t, userLanguage)`), donc rataient toute
 *     traduction d'un rang inférieur.
 *
 * Les deux témoins s'écrivent sur un rang AUTRE que le premier (leçon 261) :
 * au rang 1 la règle juste et le défaut rendent le même verdict.
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

jest.mock('@/hooks/social/use-stories', () => ({
  useReactToStoryMutation: () => ({ mutate: jest.fn() }),
}));

/// Lecteur dont le Prisme est ['de', 'fr'] : le rang 1 (allemand) n'est JAMAIS
/// servi par les fixtures, le rang 2 (français) l'est. Un résolveur bloqué au
/// rang 1 retombe donc sur l'original et le témoin tombe.
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: {
        id: 'user-1',
        username: 'alice',
        avatar: null,
        systemLanguage: 'de',
        regionalLanguage: 'fr',
      },
    }),
}));

import { StoryViewer } from '@/components/v2/StoryViewer';
import type { StoryData, StoryTextObjectData } from '@/components/v2/StoryViewer';

function baseStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    id: 'story-1',
    author: { name: 'Bob', avatar: undefined },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    viewCount: 1,
    ...overrides,
  };
}

function textObject(overrides: Partial<StoryTextObjectData> = {}): StoryTextObjectData {
  return {
    id: 'text-1',
    content: 'Hello',
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    sourceLanguage: 'en',
    ...overrides,
  };
}

describe('StoryViewer (legacy) — le Prisme descend sur TOUT le contenu de la slide', () => {
  it('sert le CORPS de la story dans la première langue servie du prisme, pas l’original', () => {
    render(
      <StoryViewer
        stories={[
          baseStory({
            content: 'Hello',
            originalLanguage: 'en',
            translations: [{ languageCode: 'fr', languageName: 'Français', content: 'Bonjour' }],
          }),
        ]}
        userLanguage="de"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('descend le prisme sur un overlay de texte (rang 2), jamais le rang 1 seul', () => {
    render(
      <StoryViewer
        stories={[
          baseStory({
            storyEffects: {
              textObjects: [textObject({ translations: { fr: 'Bonjour le monde' } , content: 'Hello world' })],
            },
          }),
        ]}
        userLanguage="de"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Bonjour le monde')).toBeInTheDocument();
    expect(screen.queryByText('Hello world')).toBeNull();
  });

  it('sert l’original quand AUCUNE langue du prisme n’est disponible', () => {
    render(
      <StoryViewer
        stories={[
          baseStory({
            content: 'Hello',
            originalLanguage: 'en',
            translations: [{ languageCode: 'es', languageName: 'Español', content: 'Hola' }],
          }),
        ]}
        userLanguage="de"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('Hola')).toBeNull();
  });
});
