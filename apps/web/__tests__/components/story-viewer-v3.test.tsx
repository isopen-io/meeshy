/**
 * F2 — `StoryViewer` monte le v3, le legacy devient le repli.
 *
 * Une story dont `storyEffects.v === 3` rend `CanvasV3Scene` et PAS le
 * chemin legacy `textStyleClass` (le bloc texte unique `story.content`).
 * Une story legacy (sans `v`) et une story sans `storyEffects` du tout
 * gardent le chemin ACTUEL — tolérance, même si le fil ne devrait plus
 * servir que du v3.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema, type CanvasV3 } from '@meeshy/shared/types/canvas-v3';

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
  CommentList: () => null,
}));

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

const FIXTURES = join(__dirname, '../../../../packages/shared/fixtures/canvas-v3');

function v3Fixture(name: string): CanvasV3 {
  return CanvasV3Schema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')));
}

function baseStory(overrides: Partial<StoryData> = {}): StoryData {
  return {
    id: 's-1',
    author: { name: 'Alice', avatar: undefined },
    content: 'Legende historique',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    viewCount: 0,
    ...overrides,
  };
}

describe('StoryViewer — le v3 monte CanvasV3Scene, le legacy devient le repli (F2)', () => {
  it('renders CanvasV3Scene and skips the legacy textStyleClass block when storyEffects.v === 3', () => {
    render(
      <StoryViewer
        stories={[baseStory({ storyEffects: v3Fixture('minimal-text') as StoryData['storyEffects'] })]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.getByTestId('canvas-v3-scene')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Bonjour');
    expect(screen.queryByText('Legende historique')).toBeNull();
  });

  it('keeps the current legacy path for a story without v (tolerance)', () => {
    render(
      <StoryViewer
        stories={[
          baseStory({
            storyEffects: {
              textStyle: 'neon',
              textColor: '#ffffff',
              textPosition: { x: 50, y: 50 },
            },
          }),
        ]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('canvas-v3-scene')).toBeNull();
    expect(screen.getByText('Legende historique')).toBeInTheDocument();
  });

  it('keeps the current behaviour when storyEffects is absent entirely', () => {
    render(
      <StoryViewer
        stories={[baseStory({ storyEffects: undefined })]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('canvas-v3-scene')).toBeNull();
    expect(screen.getByText('Legende historique')).toBeInTheDocument();
  });

  // Constat 12 — un futur `v:4` (le gateway le sert TEL QUEL à un client
  // caps-3) reste lisible best-effort, jamais rejeté vers le chemin legacy vide.
  it('renders CanvasV3Scene for a forward-compatible v:4 blob (v >= 3, not v === 3)', () => {
    render(
      <StoryViewer
        stories={[baseStory({
          storyEffects: {
            v: 4,
            scenes: [{
              id: 's1',
              objects: [{
                id: 't1',
                kind: 'text',
                anchor: { t: 'free', x: 0.5, y: 0.5 },
                plane: 'fg',
                z: 0,
                transform: { scale: 1, rotation: 0, opacity: 1 },
                payload: { text: 'Bonjour' },
              }],
            }],
          } as unknown as StoryData['storyEffects'],
        })]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.getByTestId('canvas-v3-scene')).toBeInTheDocument();
  });

  // Constat 19 — le voile de lisibilité legacy (StoryViewer.tsx:915-916)
  // n'avait pas d'équivalent sur le chemin v3 : un texte blanc posé sur une
  // photo claire perdait son scrim (CLAUDE.md « NE PAS retirer effets visuels »).
  it('keeps the readability scrim over the v3 background', () => {
    render(
      <StoryViewer
        stories={[baseStory({ storyEffects: v3Fixture('minimal-text') as StoryData['storyEffects'] })]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    expect(screen.getByTestId('story-readability-scrim')).toBeInTheDocument();
  });

  // Constat 3 — le crédit de bibliothèque voyage sur l'objet `kind:audio` de
  // fond de la scène (name, soundAuthorUsername, duration), jamais dégradé en
  // `♫ —` par défaut alors que la métadonnée est SUR LE FIL.
  it('shows the library credit on the badge — the metadata rides the background kind:audio object', () => {
    render(
      <StoryViewer
        stories={[baseStory({
          storyEffects: {
            v: 3,
            sound: { source: { t: 'library', soundId: 'snd-1' }, volume: 1 },
            scenes: [{
              id: 's1',
              objects: [
                {
                  id: 't1',
                  kind: 'text',
                  anchor: { t: 'free', x: 0.5, y: 0.5 },
                  plane: 'fg',
                  z: 0,
                  transform: { scale: 1, rotation: 0, opacity: 1 },
                  payload: { text: 'Bonjour' },
                },
                {
                  id: 'a1',
                  kind: 'audio',
                  anchor: { t: 'free', x: 0.5, y: 0.5 },
                  plane: 'content',
                  z: 0,
                  transform: { scale: 1, rotation: 0, opacity: 1 },
                  payload: { isBackground: true, name: 'Chill Beat', soundAuthorUsername: 'dj_zoe', duration: 42 },
                },
              ],
            }],
          } as unknown as StoryData['storyEffects'],
        })]}
        initialIndex={0}
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );

    const announcement = screen.getByTestId('background-sound-announcement');
    expect(announcement).toHaveTextContent('Chill Beat');
    expect(announcement).toHaveTextContent('@dj_zoe');
  });
});
