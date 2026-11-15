import { describe, expect, test } from 'bun:test';

import { lazyLensStage } from './lens-lazy';
import type { LensDrawOp } from './lens-plan';
import type { LensSettings, LensStage } from './lens-stage';

/**
 * L'ÉTAGE LENS, CHARGÉ À LA PREMIÈRE LENS (W14, #11320) — tant que le chunk
 * n'est pas là, l'image part sans la lens ; il n'est demandé qu'une fois.
 */
const image = { name: 'image' } as unknown as CanvasImageSource;
const graded = { name: 'graded' } as unknown as CanvasImageSource;
const frame = { width: 640, height: 480 };
const settings = {} as unknown as LensSettings;
const ops: readonly LensDrawOp[] = [{ kind: 'frame', id: 'c', motif: 'elegant.art-deco', opacity: 1 }];
const loaded: LensStage = { plan: () => ops, grade: () => graded, paint: () => undefined, close: () => undefined };

describe('lazyLensStage', () => {
  test('avant le chargement, l’image passe telle quelle et rien ne se peint', () => {
    const stage = lazyLensStage(() => new Promise(() => undefined));
    expect(stage.grade(image, settings, frame)).toBe(image);
    expect(stage.plan(settings, image, frame, 0)).toEqual([]);
  });

  test('le chunk n’est demandé qu’une fois, puis l’étage chargé sert les images suivantes', async () => {
    let asked = 0;
    const stage = lazyLensStage(async () => (asked++, loaded));
    stage.grade(image, settings, frame);
    stage.plan(settings, image, frame, 0);
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toBe(1);
    expect(stage.grade(image, settings, frame)).toBe(graded);
    expect(stage.plan(settings, image, frame, 0)).toBe(ops);
  });

  test('un chunk qui ne se charge pas laisse l’image partir sans lens', async () => {
    const stage = lazyLensStage(() => Promise.reject(new Error('hors ligne')));
    stage.grade(image, settings, frame);
    await Promise.resolve();
    await Promise.resolve();
    expect(stage.grade(image, settings, frame)).toBe(image);
  });
});
