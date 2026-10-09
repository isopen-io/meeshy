import { describe, expect, test } from 'bun:test';

import type { FeedCardMedia, FeedCardScene } from '@/lib/feed/card-model';
import { parseCanvasDocument } from '@/lib/canvas/document';

import { reelPrimeSourceOf, reelSceneDuration, reelScenePlays, reelSceneProgress, reelStageOf } from './scene';

/**
 * T2 (#6903) — la loi d'un réel composé, miroir `ReelSceneRouting` /
 * `ReelSceneProgress` / `ReelMediaAutostart`.
 */
function sceneOf(): FeedCardScene {
  const document = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects: [] }] });
  if (document === null) throw new Error('vecteur invalide');
  return { document, carrier: { postId: 'p1', media: [] } };
}

const video: FeedCardMedia = { id: 'm1', kind: 'video', src: 'clip.mp4', ratio: 9 / 16 };

describe('reelStageOf — la scène décide AVANT le média', () => {
  test('un modèle avec scène ⇒ { kind: "scene" }, MÊME si media porte une vidéo', () => {
    const scene = sceneOf();
    expect(reelStageOf({ scene, media: [video] })).toEqual({ kind: 'scene', scene });
  });

  test('sans scène ⇒ le ReelDisplay de reelDisplayOf, inchangé', () => {
    expect(reelStageOf({ media: [video] })).toEqual({ kind: 'video', media: video });
    expect(reelStageOf({ media: [] })).toEqual({ kind: 'none' });
  });
});

describe('reelSceneProgress — bornée [0, 1]', () => {
  test('duration ≤ 0 ⇒ 0', () => {
    expect(reelSceneProgress({ elapsed: 1, duration: 0 })).toBe(0);
    expect(reelSceneProgress({ elapsed: 1, duration: -3 })).toBe(0);
  });
  test('elapsed < 0 ⇒ 0', () => {
    expect(reelSceneProgress({ elapsed: -1, duration: 3 })).toBe(0);
  });
  test('elapsed > duration ⇒ 1', () => {
    expect(reelSceneProgress({ elapsed: 4, duration: 3 })).toBe(1);
  });
  test('1.5 / 3 ⇒ 0.5', () => {
    expect(reelSceneProgress({ elapsed: 1.5, duration: 3 })).toBe(0.5);
  });
});

describe('reelScenePlays — active ∧ ¬paused ∧ ¬documentHidden, les huit combinaisons', () => {
  const combos: ReadonlyArray<readonly [boolean, boolean, boolean, boolean]> = [
    [true, false, false, true],
    [true, true, false, false],
    [true, false, true, false],
    [true, true, true, false],
    [false, false, false, false],
    [false, true, false, false],
    [false, false, true, false],
    [false, true, true, false],
  ];
  for (const [active, paused, documentHidden, expected] of combos) {
    test(`active=${active} paused=${paused} documentHidden=${documentHidden} ⇒ ${expected}`, () => {
      expect(reelScenePlays({ active, paused, documentHidden })).toBe(expected);
    });
  }
});

describe('reelSceneDuration — déclarée > repli > aucune', () => {
  test('déclarée gagne quand définie', () => {
    expect(reelSceneDuration({ declared: 2, knownMs: [9000] })).toBe(2);
  });
  test('sinon, la plus longue durée connue, en secondes', () => {
    expect(reelSceneDuration({ declared: null, knownMs: [1000, 3000, 2000] })).toBe(3);
  });
  test('aucune durée connue ⇒ null (pas de barre, loi 4)', () => {
    expect(reelSceneDuration({ declared: null, knownMs: [] })).toBeNull();
  });
});

describe('reelPrimeSourceOf — l’amorce suit l’élection du lecteur (#9702)', () => {
  test('la vidéo élue, puis l’audio ; rien pour une scène ou des images', () => {
    const audio: FeedCardMedia = { id: 'a1', kind: 'audio', src: 'voice.m4a', ratio: 1 };
    const image: FeedCardMedia = { id: 'i1', kind: 'image', src: 'pic.jpg', ratio: 1 };
    expect(reelPrimeSourceOf({ media: [image, video] })).toBe('clip.mp4');
    expect(reelPrimeSourceOf({ media: [audio] })).toBe('voice.m4a');
    expect(reelPrimeSourceOf({ media: [image] })).toBeUndefined();
    expect(reelPrimeSourceOf({ scene: sceneOf(), media: [video] })).toBeUndefined();
  });
});
