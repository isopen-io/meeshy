import { describe, expect, test } from 'bun:test';

import { FACE_EFFECTS, NO_EFFECTS, type FaceEffect } from './video-effects';
import { createFaceLayer, FACE_COST_SAMPLE_EVERY, type SpriteSurface } from './face-effects-draw';
import type { FaceTarget } from './video-effects-pipeline';
import { eyesOf, heuristicFaceBox, smoothFaceBox, type Circle, type FacePose } from './face-effects';
import type { FaceRig } from './face-rig-port';

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

  FACE_EFFECTS.filter((effect): effect is Exclude<FaceEffect, 'none' | 'baby'> => effect !== 'none' && effect !== 'baby').forEach((effect) =>
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

/**
 * LE BÉBÉ, ET LES ORNEMENTS QUI SUIVENT LE VISAGE (#19779) — le bébé ne se
 * pose que sur un visage VU (jamais sur la boîte supposée) : peau lissée, yeux
 * grossis par la loupe du gréement, joues roses. Quand le gréement connaît la
 * POSE (478 repères), le halo et les cornes tournent avec la tête et les yeux
 * du démon brillent sur les vrais yeux ; sans pose, le dessin d'avant.
 */

const BOX = { x: 220, y: 90, width: 200, height: 260 };

const seen = { detect: async () => [{ boundingBox: BOX }] };

const flushed = () => new Promise((resolve) => setTimeout(resolve, 0));

const rigOf = (pose: FacePose | null) => {
  const magnified: (readonly Circle[])[] = [];
  const rig: FaceRig = { detector: seen, pose: () => pose, magnify: (_target, eyes) => void magnified.push(eyes), close: () => undefined };
  return { rig, magnified };
};

/** Un calque dont le visage a été VU : la première image demande, la seconde dessine sur la boîte rendue. */
const seenLayer = async (rig: FaceRig) => {
  const layer = createFaceLayer(null, { rig, surface: () => null });
  layer(targetOf(recordingContext().context), effectsOf('baby'));
  await flushed();
  return layer;
};

const TILTED: FacePose = {
  face: { x: 220, y: 90, width: 200, height: 260 },
  roll: 0.3,
  eyes: [
    { cx: 280, cy: 190, r: 18 },
    { cx: 360, cy: 215, r: 18 },
  ],
};

describe('le bébé (#19779)', () => {
  test('sur la boîte SUPPOSÉE, rien : ni lissage, ni loupe, ni joues', async () => {
    const { rig, magnified } = rigOf(TILTED);
    const traced = tracingContext();
    const blind = createFaceLayer(null, { rig: { ...rig, detector: { detect: async () => [] } } });
    const bare = createFaceLayer(null);
    [blind, bare].forEach((layer) => layer(targetOf(traced.context), effectsOf('baby')));
    await flushed();
    [blind, bare].forEach((layer) => layer(targetOf(traced.context), effectsOf('baby')));
    expect(traced.calls).toEqual([]);
    expect(magnified).toEqual([]);
  });

  test('sur un visage vu, sans repères : la peau lissée, la loupe sur les yeux estimés dans la boîte, deux joues roses', async () => {
    const { rig, magnified } = rigOf(null);
    const layer = await seenLayer(rig);
    const traced = tracingContext();
    layer(targetOf(traced.context), effectsOf('baby'));
    expect(traced.calls.filter((call) => call.key === 'clip')).toHaveLength(1);
    expect(magnified).toHaveLength(1);
    expect(magnified[0]).toEqual(eyesOf(smoothFaceBox(heuristicFaceBox({ width: 640, height: 480 }), BOX)));
    expect(traced.calls.filter((call) => call.key === 'fillRect' || call.key === 'drawImage').length).toBeGreaterThanOrEqual(3);
    expect(traced.calls.filter((call) => call.key === 'save')).toHaveLength(traced.calls.filter((call) => call.key === 'restore').length);
  });

  test('avec la pose, la loupe va sur les VRAIS yeux', async () => {
    const { rig, magnified } = rigOf(TILTED);
    const layer = await seenLayer(rig);
    layer(targetOf(recordingContext().context), effectsOf('baby'));
    expect(magnified.at(-1)).toEqual(TILTED.eyes);
  });
});

describe('l’ange et le démon suivent le visage (#19779)', () => {
  const drawnWith = async (pose: FacePose | null, effect: FaceEffect) => {
    const { rig } = rigOf(pose);
    const layer = createFaceLayer(null, { rig, surface: () => null });
    layer(targetOf(tracingContext().context), effectsOf(effect));
    await flushed();
    const traced = tracingContext();
    layer(targetOf(traced.context), effectsOf(effect));
    return traced.calls;
  };

  test('la tête penche : le halo tourne avec elle, autour du centre du visage', async () => {
    const calls = await drawnWith(TILTED, 'angel');
    expect(calls.find((call) => call.key === 'rotate')?.args).toEqual([0.3]);
    expect(calls.find((call) => call.key === 'translate')?.args).toEqual([320, 220]);
    expect(calls.filter((call) => call.key === 'save')).toHaveLength(calls.filter((call) => call.key === 'restore').length);
  });

  test('les cornes du démon tournent avec la tête ; sa teinte couvre toujours toute l’image, droite', async () => {
    const calls = await drawnWith(TILTED, 'demon');
    const rotate = calls.findIndex((call) => call.key === 'rotate');
    const tint = calls.findIndex((call) => call.key === 'fillRect' && call.args[2] === 640);
    expect(rotate).toBeGreaterThan(-1);
    expect(tint).toBeGreaterThan(-1);
    expect(tint).toBeLessThan(rotate);
  });

  test('les yeux du démon brillent sur les vrais yeux', async () => {
    const calls = await drawnWith(TILTED, 'demon');
    const arcs = calls.filter((call) => call.key === 'arc').map((call) => [call.args[0], call.args[1]]);
    expect(arcs).toContainEqual([280, 190]);
    expect(arcs).toContainEqual([360, 215]);
  });

  test('sans pose (une boîte seule), aucune rotation : le dessin d’avant', async () => {
    expect((await drawnWith(null, 'angel')).some((call) => call.key === 'rotate')).toBe(false);
    expect((await drawnWith(null, 'demon')).some((call) => call.key === 'rotate')).toBe(false);
  });
});
