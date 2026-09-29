import { describe, expect, test } from 'bun:test';

import { FACE_EFFECTS, NO_EFFECTS, type FaceEffect } from './video-effects';
import { createFaceLayer } from './face-effects-draw';
import type { FaceTarget } from './video-effects-pipeline';

/**
 * LE CALQUE DES EFFETS DE VISAGE (#8551) — chaque effet trace quelque chose
 * sur l'image, « Aucun » ne trace rien, et un calque qui coûte trop renonce à
 * ses ornements sans renoncer à sa forme.
 */

const recordingContext = () => {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        return (..._args: unknown[]) => void calls.push(String(key));
      },
      set: () => true,
    },
  ) as unknown as FaceTarget['context'];
  return { calls, context };
};

const targetOf = (context: FaceTarget['context'], t = 1000): FaceTarget => ({
  context,
  source: {} as CanvasImageSource,
  width: 640,
  height: 480,
  t,
});

describe('chaque effet de visage', () => {
  test('« Aucun » ne trace rien', () => {
    const { calls, context } = recordingContext();
    createFaceLayer(null)(targetOf(context), NO_EFFECTS);
    expect(calls).toEqual([]);
  });

  FACE_EFFECTS.filter((effect): effect is Exclude<FaceEffect, 'none'> => effect !== 'none').forEach((effect) =>
    test(`${effect} trace sur l’image, sans laisser l’état du canevas changé`, () => {
      const { calls, context } = recordingContext();
      createFaceLayer(null)(targetOf(context), {
        ...NO_EFFECTS,
        faceEffect: effect,
      });
      expect(calls.length).toBeGreaterThan(2);
      expect(calls.filter((call) => call === 'save')).toHaveLength(calls.filter((call) => call === 'restore').length);
    }),
  );

  test('le lissage redessine l’image dans l’ovale du visage', () => {
    const { calls, context } = recordingContext();
    createFaceLayer(null)(targetOf(context), {
      ...NO_EFFECTS,
      faceEffect: 'smoothing',
    });
    expect(calls).toEqual(['save', 'beginPath', 'ellipse', 'clip', 'drawImage', 'restore']);
  });

  test('l’éruption fait monter ses braises : deux instants, deux dessins différents', () => {
    const at = (t: number) => {
      const log: number[] = [];
      const context = new Proxy(
        {},
        {
          get: (_target, key) => {
            if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
            if (key === 'arc') return (_x: number, y: number) => void log.push(Math.round(y));
            return () => undefined;
          },
          set: () => true,
        },
      ) as unknown as FaceTarget['context'];
      createFaceLayer(null)(targetOf(context, t), {
        ...NO_EFFECTS,
        faceEffect: 'volcano',
      });
      return log;
    };
    expect(at(0).length).toBeGreaterThan(10);
    expect(at(0)).not.toEqual(at(800));
  });
});
