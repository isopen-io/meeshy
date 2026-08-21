/**
 * F7b — `StoryViewer` câble RÉELLEMENT `CanvasV3Scene` (addendum rév. 2 du
 * plan lot F, constats 1, 15 ; note de fermeture des constats 14 et 18).
 *
 * F7a a donné à `CanvasV3Scene` les props `muted`, `playheadSec` et
 * `videoGateHandlers`, et a prouvé son COMPORTEMENT interne une fois nourri
 * (canvas-v3-scene-parity.test.tsx, canvas-v3-scene-animation.test.tsx). Mais
 * le seul appelant de production (`StoryViewer.tsx:886-891`) ne les passait
 * pas : le bouton 🔇 ne coupait rien, l'animation et l'indicateur de mise en
 * mémoire tampon restaient MORTS à l'exécution. `CanvasV3Scene` est ici
 * REMPLACÉ par une sonde qui capture les props REÇUES à chaque rendu — ces
 * tests jugent le CÂBLAGE, jamais le composant pur lui-même.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { CanvasV3SceneProps } from '@/components/v2/CanvasV3Scene';

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

jest.mock('@/hooks/social/use-stories', () => ({
  useReactToStoryMutation: () => ({ mutate: jest.fn() }),
}));

// Constat 15 : un utilisateur avec DEUX préférences in-app (système ET
// régionale) — l'ancien câblage n'en aurait laissé passer qu'une seule.
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: {
        id: 'user-1',
        username: 'alice',
        avatar: null,
        systemLanguage: 'es',
        regionalLanguage: 'fr',
      },
    }),
}));

let capturedProps: CanvasV3SceneProps | null = null;
jest.mock('@/components/v2/CanvasV3Scene', () => ({
  CanvasV3Scene: (props: CanvasV3SceneProps) => {
    capturedProps = props;
    return <div data-testid="canvas-v3-scene-probe" />;
  },
}));

import { StoryViewer } from '@/components/v2/StoryViewer';
import type { StoryData } from '@/components/v2/StoryViewer';

function v3Story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    id: 's-1',
    author: { name: 'Alice', avatar: undefined },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    viewCount: 0,
    storyEffects: {
      v: 3,
      sound: { source: { t: 'original' }, volume: 1 },
      scenes: [{
        id: 's1',
        objects: [{
          id: 't1',
          kind: 'text',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'fg',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          timing: { start: 0, keyframes: [{ time: 0, opacity: 0.2 }, { time: 2, opacity: 1 }] },
          payload: { text: 'Bonjour' },
        }],
      }],
    } as unknown as StoryData['storyEffects'],
    ...overrides,
  };
}

function staticV3Story(): StoryData {
  return v3Story({
    storyEffects: {
      v: 3,
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
  });
}

describe('StoryViewer — câblage réel de CanvasV3Scene (F7b)', () => {
  beforeEach(() => {
    capturedProps = null;
    global.requestAnimationFrame = jest.fn(() => 1) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = jest.fn();
  });

  it('passes the LIVE mute state to the scene — the badge toggle is meant to reach a real player (constat 1)', () => {
    render(<StoryViewer stories={[v3Story()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />);
    expect(capturedProps?.muted).toBe(true);

    fireEvent.click(screen.getByTestId('background-sound-mute-toggle'));
    expect(capturedProps?.muted).toBe(false);
  });

  it('passes the FULL ordered Prisme chain from the authenticated user, not a single language (constat 15)', () => {
    render(<StoryViewer stories={[v3Story()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />);
    // Rangs 1-2 : systemLanguage puis regionalLanguage, dans l'ORDRE — jamais
    // une seule langue (l'ancien câblage passait `[userLanguage]`). Le
    // troisième rang possible (`deviceLocale`, jsdom `navigator.language`)
    // n'est pas jugé ici : seule l'ordonnancement des préférences in-app
    // importe pour ce constat.
    expect(capturedProps?.preferredLanguages?.slice(0, 2)).toEqual(['es', 'fr']);
    expect(capturedProps?.preferredLanguages?.length).toBeGreaterThanOrEqual(2);
  });

  it('passes the primary video gate handlers so the v3 buffering indicator can live (constat 14)', () => {
    render(<StoryViewer stories={[v3Story()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />);
    expect(typeof capturedProps?.videoGateHandlers?.onWaiting).toBe('function');
    expect(typeof capturedProps?.videoGateHandlers?.onStalled).toBe('function');
    expect(typeof capturedProps?.videoGateHandlers?.onPlaying).toBe('function');
    expect(typeof capturedProps?.videoGateHandlers?.onCanPlay).toBe('function');
  });

  it('passes a defined playheadSec — the wire never leaves the scene in undefined/static limbo when the slide is animated', () => {
    render(<StoryViewer stories={[v3Story()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />);
    expect(capturedProps?.playheadSec).toBe(0);
  });

  it('arms the RAF playhead ticker for a v3 slide carrying keyframes — the animation is not dead on arrival (constat 18)', () => {
    render(<StoryViewer stories={[v3Story()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />);
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it('does NOT arm the ticker for a static v3 slide without keyframes or clip transitions', () => {
    render(<StoryViewer stories={[staticV3Story()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />);
    expect(global.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
