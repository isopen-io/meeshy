/**
 * F7a — l'animation du chemin v3 (addendum rév. 2, arbitrage 1 ; constat 18).
 *
 * Le legacy jouait déjà les keyframes W1 (`resolveKeyframeState`) et les
 * transitions de clip (`resolveClipTransitionOpacity`). Comme `X-Canvas-Caps: 3`
 * fait convertir TOUTE l'archive v1 en v3 dès `CANVAS_V3_READ` armé, un rendu
 * statique retirerait l'animation à 100 % des stories web, pas à une frange.
 * `CanvasV3Scene` reçoit donc un `playheadSec` et branche les résolveurs
 * EXISTANTS sur `timing.keyframes` et `scene.clipTransitions` — un adaptateur de
 * forme, jamais une réécriture.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { CanvasV3Scene } from '@/components/v2/CanvasV3Scene';

function scene(objects: unknown[], clipTransitions?: unknown[]): CanvasV3 {
  return {
    v: 3,
    scenes: [{ id: 's1', objects, ...(clipTransitions ? { clipTransitions } : {}) }],
  } as unknown as CanvasV3;
}

function scaleOf(el: HTMLElement): number {
  const match = /scale\(([-0-9.e]+)\)/.exec(el.style.transform);
  return match ? Number(match[1]) : NaN;
}

const KEYFRAMED_TEXT = {
  id: 't1',
  kind: 'text',
  anchor: { t: 'free', x: 0.2, y: 0.2 },
  plane: 'fg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  timing: {
    start: 0,
    keyframes: [
      { time: 0, x: 0.2, y: 0.2, scale: 1, opacity: 0.2 },
      { time: 2, x: 0.8, y: 0.6, scale: 2, opacity: 1, easing: 'linear' },
    ],
  },
  payload: { text: 'Bonjour' },
};

describe('CanvasV3Scene — keyframes v3 (F7a)', () => {
  it('interpolates position, scale and opacity at the playhead', () => {
    render(<CanvasV3Scene doc={scene([KEYFRAMED_TEXT])} playheadSec={1} />);

    const el = screen.getByTestId('canvas-v3-object-t1');
    expect(parseFloat(el.style.left)).toBeCloseTo(50, 3);
    expect(parseFloat(el.style.top)).toBeCloseTo(40, 3);
    expect(scaleOf(el)).toBeCloseTo(1.5, 4);
    expect(parseFloat(el.style.opacity)).toBeCloseTo(0.6, 4);
  });

  it('honours the keyframe easing curve of the lower keyframe', () => {
    const eased = {
      ...KEYFRAMED_TEXT,
      timing: {
        start: 0,
        keyframes: [
          { time: 0, scale: 1, easing: 'easeOut' },
          { time: 2, scale: 3 },
        ],
      },
    };
    render(<CanvasV3Scene doc={scene([eased])} playheadSec={0.5} />);

    // easeOut(0.25) = 1 - 0.75² = 0.4375 → 1 + 2 × 0.4375 = 1.875
    expect(scaleOf(screen.getByTestId('canvas-v3-object-t1'))).toBeCloseTo(1.875, 4);
  });

  it('reads keyframe times relative to the object start, as the iOS interpolator does', () => {
    const delayed = {
      ...KEYFRAMED_TEXT,
      timing: {
        start: 3,
        keyframes: [
          { time: 0, scale: 1 },
          { time: 2, scale: 3 },
        ],
      },
    };
    render(<CanvasV3Scene doc={scene([delayed])} playheadSec={4} />);

    expect(scaleOf(screen.getByTestId('canvas-v3-object-t1'))).toBeCloseTo(2, 4);
  });

  it('treats an easing the reader does not know (spring) as linear, like StoryEasing(rawValue:)', () => {
    const springy = {
      ...KEYFRAMED_TEXT,
      timing: {
        start: 0,
        keyframes: [
          { time: 0, scale: 1, easing: 'spring' },
          { time: 2, scale: 3 },
        ],
      },
    };
    render(<CanvasV3Scene doc={scene([springy])} playheadSec={0.5} />);

    // linéaire : 1 + 2 × 0.25 = 1.5 (easeInOut aurait rendu 1.25)
    expect(scaleOf(screen.getByTestId('canvas-v3-object-t1'))).toBeCloseTo(1.5, 4);
  });

  it('stays on the static pose when no playhead is provided', () => {
    render(<CanvasV3Scene doc={scene([KEYFRAMED_TEXT])} />);

    const el = screen.getByTestId('canvas-v3-object-t1');
    expect(el.style.left).toBe('20%');
    expect(scaleOf(el)).toBeCloseTo(1, 4);
    expect(parseFloat(el.style.opacity)).toBeCloseTo(1, 4);
  });
});

describe('CanvasV3Scene — transitions de clip (F7a)', () => {
  const posedClip = (id: string, payload: Record<string, unknown>, timing?: Record<string, unknown>) => ({
    id,
    kind: 'media',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'content',
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    ...(timing ? { timing } : {}),
    payload,
  });

  const crossfade = [{ fromClipId: 'm1', toClipId: 'm2', kind: 'crossfade', duration: 1 }];

  it('fades the outgoing clip out over its transition window', () => {
    const doc = scene(
      [posedClip('m1', { mediaURL: '/m/a.jpg', mediaType: 'image' }, { start: 0, end: 2 })],
      crossfade
    );
    render(<CanvasV3Scene doc={doc} playheadSec={1.5} />);

    expect(parseFloat(screen.getByTestId('canvas-v3-object-m1').style.opacity)).toBeCloseTo(0.5, 4);
  });

  it('fades the incoming clip in and takes the clip window from the payload duration', () => {
    const doc = scene(
      [posedClip('m2', { mediaURL: '/m/b.jpg', mediaType: 'image', duration: 4 }, { start: 2 })],
      crossfade
    );
    render(<CanvasV3Scene doc={doc} playheadSec={2.25} />);

    expect(parseFloat(screen.getByTestId('canvas-v3-object-m2').style.opacity)).toBeCloseTo(0.25, 4);
  });

  it('leaves texts out of the clip transition composition, exactly as the legacy path did', () => {
    const doc = scene(
      [
        {
          id: 't1', kind: 'text', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'fg', z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 }, payload: { text: 'Bonjour' },
        },
      ],
      crossfade
    );
    render(<CanvasV3Scene doc={doc} playheadSec={9} />);

    expect(parseFloat(screen.getByTestId('canvas-v3-object-t1').style.opacity)).toBeCloseTo(1, 4);
  });
});

/**
 * F7a (correction de revue) — le facteur de transition de clip est réservé aux
 * médias POSÉS. Le legacy retournait AVANT de calculer `fgOpacity` pour un
 * porteur `isBackground` (`StoryViewer.tsx:925`), et le fond couleur/dégradé
 * n'était même pas un objet : c'était le style du conteneur (`:846`, `:878`),
 * jamais fondu. Or le convertisseur gateway émet un objet `kind:'media'`
 * d'id `bg` pour TOUTE story v1 à fond (`storyEffectsV3.ts:71-75`), sans durée :
 * `resolveClipTransitionOpacity` le juge alors hors fenêtre et rend 0 — fond
 * DISPARU dès qu'un slide porte des transitions.
 */
describe('CanvasV3Scene — le fond hors du fondu de clip (F7a)', () => {
  const crossfade = [{ fromClipId: 'm1', toClipId: 'm2', kind: 'crossfade', duration: 1 }];

  const bgObject = (id: string, payload: Record<string, unknown>) => ({
    id,
    kind: 'media',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'bg',
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  });

  it('keeps the converted background object opaque under clip transitions', () => {
    const doc = scene([bgObject('bg', { background: 'gradient:#101010,#303030', transform: null })], crossfade);
    render(<CanvasV3Scene doc={doc} playheadSec={1.5} />);

    expect(parseFloat(screen.getByTestId('canvas-v3-object-bg').style.opacity)).toBeCloseTo(1, 4);
  });

  it('keeps a background carrier opaque under clip transitions, as the legacy early return did', () => {
    const doc = scene(
      [bgObject('m0', { mediaURL: '/m/bg.mp4', mediaType: 'video', isBackground: true })],
      crossfade
    );
    render(<CanvasV3Scene doc={doc} playheadSec={1.5} />);

    expect(parseFloat(screen.getByTestId('canvas-v3-object-m0').style.opacity)).toBeCloseTo(1, 4);
  });

  // Frontière du correctif, dans les DEUX sens : sous une seule et même
  // `clipTransitions`, le porteur de FOND que la transition nomme (`m1`) garde
  // son opacité, tandis que le clip POSÉ (`m2`) fond bien dans sa fenêtre —
  // l'exclusion du fond n'a rien sur-corrigé.
  it('still fades the posed clip named by a transition — only the background carrier keeps its opacity', () => {
    const doc = scene(
      [
        bgObject('m1', { mediaURL: '/m/bg.mp4', mediaType: 'video', isBackground: true, duration: 2 }),
        {
          id: 'm2',
          kind: 'media',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'content',
          z: 0,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          timing: { start: 2 },
          payload: { mediaURL: '/m/b.jpg', mediaType: 'image', duration: 4 },
        },
      ],
      crossfade
    );
    render(<CanvasV3Scene doc={doc} playheadSec={2.25} />);

    expect(parseFloat(screen.getByTestId('canvas-v3-object-m1').style.opacity)).toBeCloseTo(1, 4);
    expect(parseFloat(screen.getByTestId('canvas-v3-object-m2').style.opacity)).toBeCloseTo(0.25, 4);
  });
});
