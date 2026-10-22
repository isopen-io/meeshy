import { describe, expect, test } from 'bun:test';

import { identityStrip, lutCubeOf, type LutCube } from './lens-lut';
import { createLutStage, LUT_FRAGMENT_SHADER } from './lens-lut-stage';
import { createLensStage, type LensStageEnv } from './lens-stage';
import type { LensDrawOp } from './lens-plan';
import type { LutStage } from './lens-lut-stage';

/**
 * LA LUT SUR LE GPU (W14, #11320) — la passe lit le cube en texture 3D, en
 * `highp` (#9203 : en `mediump` sur un GPU mobile, les couleurs voisines se
 * confondent), et ne téléverse le cube qu'à son premier usage. Le contexte
 * WebGL2 est une doublure qui journalise.
 */
function fakeGl() {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const canvas = { width: 1, height: 1 };
  let next = 0;
  const handle = () => ({ handle: (next += 1) });
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    createShader: handle,
    createProgram: handle,
    createTexture: handle,
    createBuffer: handle,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getUniformLocation: (_program, name) => ({ name }),
    getExtension: () => null,
  };
  const gl = new Proxy(
    {},
    {
      get: (_target, key: string) => {
        if (key === 'canvas') return canvas;
        if (/^[A-Z0-9_]+$/.test(key)) return key;
        return (...args: unknown[]) => {
          calls.push([key, ...args]);
          return methods[key]?.(...args);
        };
      },
    },
  ) as unknown as WebGL2RenderingContext;
  return { gl, calls, canvas, uploads: () => calls.filter(([name]) => name === 'texImage3D') };
}

const cube = (): LutCube => {
  const made = lutCubeOf(identityStrip(16));
  if (made === null) throw new Error('cube');
  return made;
};

const frame = { name: 'image' } as unknown as CanvasImageSource;

describe('createLutStage', () => {
  test('la passe lit une texture 3D en highp, et mêle selon l’intensité', () => {
    expect(LUT_FRAGMENT_SHADER).toContain('precision highp float');
    expect(LUT_FRAGMENT_SHADER).toContain('precision highp sampler3D');
    expect(LUT_FRAGMENT_SHADER).toContain('mix(color, texture(u_lut, coord).rgb, u_intensity)');
  });

  test('le cube ne se téléverse qu’à son premier usage, puis à chaque nouveau cube', () => {
    const fake = fakeGl();
    const stage = createLutStage(fake.gl);
    const first = cube();
    stage.render(frame, 1280, 720, first, 1);
    stage.render(frame, 1280, 720, first, 1);
    expect(fake.uploads()).toHaveLength(1);
    expect(fake.uploads()[0]?.slice(0, 7)).toEqual(['texImage3D', 'TEXTURE_3D', 0, 'RGBA8', 16, 16, 16]);
    stage.render(frame, 1280, 720, cube(), 1);
    expect(fake.uploads()).toHaveLength(2);
  });

  test('le canevas prend la taille de l’image, et l’intensité est bornée à [0, 1]', () => {
    const fake = fakeGl();
    createLutStage(fake.gl).render(frame, 1280, 720, cube(), 3);
    expect(fake.canvas).toEqual({ width: 1280, height: 720 });
    expect(fake.calls).toContainEqual(['uniform1f', { name: 'u_intensity' }, 1]);
  });
});

describe('createLensStage — l’étalonnage se passe en silence de ce qui manque', () => {
  const lutOp: LensDrawOp = { kind: 'lut', id: 'g', asset: 'aaaaaaaaaaaaaaaa.png', intensity: 0.8 };
  const graded = { name: 'graded' } as unknown as CanvasImageSource;
  const stageOf = (render: LutStage['render']): LutStage => ({ render, release: () => undefined });
  const env = (overrides: Partial<LensStageEnv> = {}): LensStageEnv => ({
    face: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    cube: () => cube(),
    lut: () => stageOf(() => graded),
    paint: { assets: () => null },
    ...overrides,
  });
  const size = { width: 1280, height: 720 };

  test('avec son cube et WebGL2 : l’image étalonnée, à l’intensité de la couche', () => {
    const seen: number[] = [];
    const lens = createLensStage(env({ lut: () => stageOf((_s, _w, _h, _c, intensity) => (seen.push(intensity), graded)) }));
    expect(lens.grade(frame, [lutOp], size)).toBe(graded);
    expect(seen).toEqual([0.8]);
  });

  test('sans couche LUT, sans cube, sans WebGL2 ou sur une passe qui lève : l’image telle quelle', () => {
    expect(createLensStage(env()).grade(frame, [], size)).toBe(frame);
    expect(createLensStage(env({ cube: () => null })).grade(frame, [lutOp], size)).toBe(frame);
    expect(createLensStage(env({ lut: () => null })).grade(frame, [lutOp], size)).toBe(frame);
    const failing = createLensStage(env({ lut: () => stageOf(() => { throw new Error('perdu'); }) }));
    expect(failing.grade(frame, [lutOp], size)).toBe(frame);
  });
});
