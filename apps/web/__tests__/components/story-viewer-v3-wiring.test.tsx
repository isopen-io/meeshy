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
import { render, screen, fireEvent, act } from '@testing-library/react';
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
// Mutable : le test du visiteur SANS compte (BLOQUANT, revue) bascule
// `mockAuthUser` à `null` — `/story/:id` est une route PUBLIQUE
// (`middleware.ts` ne garde que `/admin`), `useAuthStore.user` y vaut bien
// `null` pour un visiteur anonyme.
let mockAuthUser: Record<string, unknown> | null = {
  id: 'user-1',
  username: 'alice',
  avatar: null,
  systemLanguage: 'es',
  regionalLanguage: 'fr',
};
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: mockAuthUser }),
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
    mockAuthUser = {
      id: 'user-1',
      username: 'alice',
      avatar: null,
      systemLanguage: 'es',
      regionalLanguage: 'fr',
    };
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

  // BLOQUANT (revue) — `/story/:id` est une route PUBLIQUE : un visiteur SANS
  // compte a `authUser === null`, mais garde `userLanguage` (prop, langue
  // persistante hors-compte). Vider `preferredLanguages` dans ce cas fait
  // retomber `resolveText()` sur l'ORIGINAL pour tout visiteur anonyme —
  // régression du Prisme. Le repli n'est engagé QUE sans compte : avec
  // compte, la chaîne complète (constat 15 ci-dessus) prime toujours.
  it('falls back to the single userLanguage prop for a visitor WITHOUT an account — never an empty Prisme chain', () => {
    mockAuthUser = null;
    render(
      <StoryViewer
        stories={[v3Story()]}
        initialIndex={0}
        userLanguage="es"
        onClose={jest.fn()}
        onReply={jest.fn()}
      />,
    );
    expect(capturedProps?.preferredLanguages).toEqual(['es']);
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

/**
 * W2 — l'enchaînement multi-scènes (parité iOS ⇄ Web, directive du 2026-08-23).
 *
 * `CanvasV3Scene` ne peint que `scenes[sceneIndex]` — c'est son contrat, et le
 * miroir exact de `MeeshyScenePlayer`, qui reçoit lui aussi un `sceneIndex`
 * (Binding) et laisse l'HÔTE décider quand il change. Sauf que l'hôte web ne le
 * faisait jamais bouger : un document à 3 scènes n'en montrait qu'une, et la
 * story passait à la suivante à la fin de la scène 1.
 *
 * L'écart était LATENT (iOS n'émet qu'une scène aujourd'hui) ; il devient LIVE
 * au multi-diapositives du lot C. D'où W2 AVANT le lot C.
 *
 * Ces tests jugent le CÂBLAGE de l'hôte : la sonde capture le `sceneIndex` reçu
 * et la tête de lecture qui l'accompagne, jamais le composant pur lui-même.
 */
function multiSceneStory(): StoryData {
  const scene = (id: string, text: string) => ({
    id,
    objects: [{
      id: `t-${id}`,
      kind: 'text',
      anchor: { t: 'free', x: 0.5, y: 0.5 },
      plane: 'fg',
      z: 0,
      transform: { scale: 1, rotation: 0, opacity: 1 },
      timing: { start: 0, keyframes: [{ time: 0, opacity: 0.2 }, { time: 2, opacity: 1 }] },
      payload: { text },
    }],
  });
  return {
    id: 's-multi',
    author: { name: 'Alice', avatar: undefined },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    viewCount: 0,
    storyEffects: {
      v: 3,
      // Trois scènes STATIQUES : 6 s chacune (`defaultStaticDuration`), 18 s en
      // tout — la durée que `computeStoryDurationMs` somme désormais.
      scenes: [scene('s1', 'Premiere'), scene('s2', 'Deuxieme'), scene('s3', 'Troisieme')],
      // Ce que `postToStoryData` pose en production. Il est PORTANT et non
      // décoratif : sans lui, la tête de lecture story-absolue (le défaut que
      // W2 corrige) rendrait la même valeur que la tête relative, et le test
      // ci-dessous passerait au vert en ayant perdu sa garde.
      slideDurationMs: 18000,
    } as unknown as StoryData['storyEffects'],
  };
}

describe('StoryViewer — enchaînement multi-scènes (W2)', () => {
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    capturedProps = null;
    rafCallback = null;
    mockAuthUser = { id: 'user-1', username: 'alice', avatar: null, systemLanguage: 'fr' };
    // ORDRE IMPOSÉ : `useFakeTimers` réinstalle SON propre `requestAnimationFrame`
    // (il fait partie des minuteries qu'il feint). L'installer après la sonde
    // l'écraserait, `rafCallback` resterait nul, et le test de la tête de
    // lecture se jugerait sur un tick qu'il ne contrôle pas.
    jest.useFakeTimers();
    // rAF PILOTÉ à la main : le tick de la tête de lecture doit pouvoir être
    // déclenché à un instant choisi, sans quoi `playheadSec` reste figé à 0 et
    // ne prouve rien de sa relativité à la scène.
    global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    }) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('walks the scenes one after another at each scene duration, and only THEN leaves the story', () => {
    const onClose = jest.fn();
    render(
      <StoryViewer stories={[multiSceneStory()]} initialIndex={0} onClose={onClose} onReply={jest.fn()} />,
    );
    expect(capturedProps?.sceneIndex).toBe(0);

    act(() => { jest.advanceTimersByTime(6000); });
    expect(capturedProps?.sceneIndex).toBe(1);
    // La story ne s'est PAS refermée : c'est tout l'écart que W2 corrige — avant
    // lui, la fin de la scène 1 était la fin de la story.
    expect(onClose).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(6000); });
    expect(capturedProps?.sceneIndex).toBe(2);
    expect(onClose).not.toHaveBeenCalled();

    // Dernière scène épuisée → la story cède la place (ici : dernière story de
    // la pile, donc fermeture).
    act(() => { jest.advanceTimersByTime(6000); });
    expect(onClose).toHaveBeenCalled();
  });

  it('serves the scene-RELATIVE playhead — a keyframe at t=2s fires in every scene, not only the first', () => {
    render(
      <StoryViewer stories={[multiSceneStory()]} initialIndex={0} onClose={jest.fn()} onReply={jest.fn()} />,
    );

    // Deux avances DISTINCTES, et non un saut de 9 s : `act` ne vide sa file de
    // rendu qu'à sa sortie, si bien qu'un seul bond ferait rearmer le timer de
    // la scène 1 à t=9 s — l'horloge de la scène naîtrait déjà en retard, et le
    // test mesurerait cet artefact plutôt que le comportement.
    act(() => { jest.advanceTimersByTime(6000); });
    // 3 s DANS la scène 1 (= 9 s de story). Les `timing.start`/`keyframes` d'un
    // objet sont écrits dans le repère de SA scène (une scène projetée par
    // `StoryEffects(rendering:sceneIndex:)` démarre à 0) : servir 9 s ferait
    // jouer toutes les scènes suivantes hors de leur fenêtre d'animation.
    act(() => { jest.advanceTimersByTime(3000); });
    act(() => { rafCallback?.(0); });

    expect(capturedProps?.sceneIndex).toBe(1);
    expect(capturedProps?.playheadSec).toBeCloseTo(3, 3);
  });

  it('restarts at the first scene when the reader moves to another story', () => {
    const onClose = jest.fn();
    render(
      <StoryViewer
        stories={[multiSceneStory(), staticV3Story()]}
        initialIndex={0}
        onClose={onClose}
        onReply={jest.fn()}
      />,
    );

    act(() => { jest.advanceTimersByTime(6000); });
    expect(capturedProps?.sceneIndex).toBe(1);

    // Tap à droite : la story suivante n'a qu'une scène — l'index doit repartir
    // de zéro, jamais rester sur un rang que le nouveau document n'a pas.
    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    expect(capturedProps?.sceneIndex).toBe(0);
  });

  it('leaves a single-scene story exactly as before — its only scene ends the story', () => {
    const onClose = jest.fn();
    render(<StoryViewer stories={[staticV3Story()]} initialIndex={0} onClose={onClose} onReply={jest.fn()} />);
    expect(capturedProps?.sceneIndex).toBe(0);

    act(() => { jest.advanceTimersByTime(6000); });
    expect(onClose).toHaveBeenCalled();
    expect(capturedProps?.sceneIndex).toBe(0);
  });
});
