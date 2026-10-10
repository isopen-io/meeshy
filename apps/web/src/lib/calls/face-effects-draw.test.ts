import { describe, expect, test } from 'bun:test';

import { FACE_EFFECTS, NO_EFFECTS, type FaceEffect } from './video-effects';
import { createFaceLayer, FACE_COST_SAMPLE_EVERY, type SpriteSurface } from './face-effects-draw';
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

/**
 * LE COÛT D'UNE IMAGE (#9100) — le lissage ne floute que le rectangle du
 * visage, à demi-résolution ; les lueurs sont des sprites dessinés une fois ;
 * le mouvement réduit fige le temps et retire les ornements ; le budget se
 * mesure sur le temps RÉEL d'une image (tracés vidés), pas sur leur seul
 * enregistrement.
 */

type Call = { readonly key: string; readonly args: readonly unknown[] };

const tracingContext = () => {
  const calls: Call[] = [];
  const sets: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => (...args: unknown[]) => {
        calls.push({ key: String(key), args });
        return key === 'createLinearGradient' || key === 'createRadialGradient' ? gradient : undefined;
      },
      set: (_target, key) => {
        sets.push(String(key));
        return true;
      },
    },
  ) as unknown as FaceTarget['context'];
  return { calls, sets, context };
};

const surfaces = () => {
  const made: { readonly width: number; readonly height: number; readonly calls: Call[] }[] = [];
  const surface = (width: number, height: number): SpriteSurface => {
    const traced = tracingContext();
    made.push({ width, height, calls: traced.calls });
    return { canvas: { width, height } as unknown as CanvasImageSource, context: traced.context };
  };
  return { made, surface };
};

const effectsOf = (faceEffect: FaceEffect) => ({ ...NO_EFFECTS, faceEffect });

describe('le coût d’une image (#9100)', () => {
  test('le lissage ne floute que le rectangle du visage, à demi-résolution, jamais l’image entière', () => {
    const main = tracingContext();
    const { made, surface } = surfaces();
    createFaceLayer(null, { surface })(targetOf(main.context), effectsOf('smoothing'));
    const scratch = made[0];
    expect(scratch).toBeDefined();
    const shrink = scratch?.calls.find((call) => call.key === 'drawImage');
    expect(shrink?.args).toHaveLength(9);
    const [, , , sw, sh, , , dw, dh] = (shrink?.args ?? []) as number[];
    expect(dw).toBeCloseTo((sw ?? 0) / 2, 0);
    expect(dh).toBeCloseTo((sh ?? 0) / 2, 0);
    expect(sw).toBeLessThan(640);
    const back = main.calls.filter((call) => call.key === 'drawImage');
    expect(back).toHaveLength(1);
    expect(back[0]?.args).toHaveLength(9);
    expect(back[0]?.args.slice(5)).toEqual(shrink?.args.slice(1, 5));
  });

  test('sans surface de travail, le lissage reste borné au rectangle du visage', () => {
    const main = tracingContext();
    createFaceLayer(null, { surface: () => null })(targetOf(main.context), effectsOf('smoothing'));
    const draw = main.calls.find((call) => call.key === 'drawImage');
    expect(draw?.args).toHaveLength(9);
    expect((draw?.args[3] as number) < 640).toBe(true);
  });

  (['angel', 'demon'] as const).forEach((effect) =>
    test(`${effect} : aucune ombre floue par image ; ses lueurs sont des sprites dessinés une seule fois`, () => {
      const { made, surface } = surfaces();
      const layer = createFaceLayer(null, { surface });
      const first = tracingContext();
      layer(targetOf(first.context, 1000), effectsOf(effect));
      const sprites = made.length;
      expect(sprites).toBeGreaterThan(0);
      const second = tracingContext();
      layer(targetOf(second.context, 1040), effectsOf(effect));
      expect(made).toHaveLength(sprites);
      expect([...first.sets, ...second.sets]).not.toContain('shadowBlur');
      expect(second.calls.filter((call) => call.key === 'createRadialGradient' || call.key === 'createLinearGradient')).toEqual([]);
    }),
  );

  test('mouvement réduit : le temps est figé et l’effet n’a plus d’ornements', () => {
    const at = (t: number) => {
      const traced = tracingContext();
      createFaceLayer(null, { surface: () => null, reducedMotion: () => true })(targetOf(traced.context, t), effectsOf('volcano'));
      return traced.calls;
    };
    expect(at(0)).toEqual(at(800));
    expect(at(0).filter((call) => call.key === 'arc')).toEqual([]);
  });

  test('le budget se mesure en vidant les tracés, une image sur quelques-unes ; trop lent, l’effet renonce à ses ornements', () => {
    let now = 0;
    const flushes: number[] = [];
    const layer = createFaceLayer(null, {
      surface: () => null,
      clock: () => now,
      flush: () => {
        flushes.push(now);
        now += 40;
      },
    });
    const arcsAt = (index: number) => {
      const traced = tracingContext();
      layer(targetOf(traced.context, index * 33), effectsOf('volcano'));
      return traced.calls.filter((call) => call.key === 'arc').length;
    };
    const counts = Array.from({ length: FACE_COST_SAMPLE_EVERY * 12 }, (_, index) => arcsAt(index));
    expect(flushes).toHaveLength(12);
    expect(counts[0]).toBeGreaterThan(10);
    expect(counts.at(-1)).toBe(0);
  });
});
