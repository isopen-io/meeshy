import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument, type CanvasScene } from './document';
import { clipTransitionOpacity, readClipTransitions } from './clip-transition';

const clip = (id: string, start: number, end: number) => ({
  id,
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'content',
  z: 1,
  transform: {},
  timing: { start, end },
  payload: { postMediaId: id, mediaType: 'video/mp4' },
});

function sceneWith(clipTransitions: readonly unknown[]): CanvasScene {
  const scene = parseCanvasDocument({ v: 3, scenes: [{ id: 's', objects: [clip('a', 0, 4), clip('b', 3, 8)], clipTransitions }] })?.scenes[0];
  if (scene === undefined) throw new Error('scène');
  return scene;
}

const objectOf = (scene: CanvasScene, id: string) => {
  const found = scene.objects.find((object) => object.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

/** Miroir de `ReaderTransitionResolver.opacity` + `StoryRenderer.clipTransitionOpacity` (iOS). */
describe('les transitions entre deux clips d’une slide (#13880)', () => {
  const scene = sceneWith([{ id: 't', fromClipId: 'a', toClipId: 'b', kind: 'crossfade', duration: 1 }]);
  const transitions = readClipTransitions(scene);

  test('le clip sortant s’efface sur la dernière seconde de SA fenêtre', () => {
    const a = objectOf(scene, 'a');
    expect(clipTransitionOpacity(a, transitions, 2)).toBe(1);
    expect(clipTransitionOpacity(a, transitions, 3.5)).toBeCloseTo(0.5);
    expect(clipTransitionOpacity(a, transitions, 4)).toBeCloseTo(0);
  });

  test('le clip entrant monte sur la première seconde de sa fenêtre', () => {
    const b = objectOf(scene, 'b');
    expect(clipTransitionOpacity(b, transitions, 3)).toBeCloseTo(0);
    expect(clipTransitionOpacity(b, transitions, 3.25)).toBeCloseTo(0.25);
    expect(clipTransitionOpacity(b, transitions, 5)).toBe(1);
  });

  test('un fondu « dissolve » se joue comme un fondu enchaîné (le lecteur n’a pas de compositeur par pixel)', () => {
    const dissolve = readClipTransitions(sceneWith([{ id: 't', fromClipId: 'a', toClipId: 'b', kind: 'dissolve', duration: 1 }]));
    expect(clipTransitionOpacity(objectOf(scene, 'b'), dissolve, 3.5)).toBeCloseTo(0.5);
  });

  test('une transition illisible (durée nulle, genre inconnu, clip absent) ne joue rien', () => {
    expect(readClipTransitions(sceneWith([{ fromClipId: 'a', toClipId: 'b', kind: 'crossfade', duration: 0 }]))).toEqual([]);
    expect(readClipTransitions(sceneWith([{ fromClipId: 'a', toClipId: 'b', kind: 'spin', duration: 1 }]))).toEqual([]);
    expect(readClipTransitions(sceneWith([{ toClipId: 'b', kind: 'crossfade', duration: 1 }]))).toEqual([]);
  });

  test('un objet qu’aucune transition ne nomme garde son opacité', () => {
    const other = readClipTransitions(sceneWith([{ fromClipId: 'x', toClipId: 'y', kind: 'crossfade', duration: 1 }]));
    expect(clipTransitionOpacity(objectOf(scene, 'a'), other, 3.9)).toBe(1);
  });
});
