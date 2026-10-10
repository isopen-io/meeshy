import { describe, expect, test } from 'bun:test';

import { createGameGl, type GlCanvas, type GlLike } from './engine';

type Log = { readonly calls: string[]; readonly uniforms: Record<string, readonly number[]>; contextOptions: object | undefined; lost: number };

const fakeGl = (o: { readonly failCompile?: boolean } = {}): { readonly gl: GlLike; readonly log: Log } => {
  const log: Log = { calls: [], uniforms: {}, contextOptions: undefined, lost: 0 };
  let handle = 0;
  const make = (kind: string): object => {
    handle += 1;
    return { kind, id: handle };
  };
  const note = (name: string): void => void log.calls.push(name);
  const gl: GlLike = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    TRIANGLES: 5,
    COLOR_BUFFER_BIT: 6,
    BLEND: 7,
    ONE: 8,
    ONE_MINUS_SRC_ALPHA: 9,
    createShader: () => (note('createShader'), make('shader')),
    shaderSource: () => note('shaderSource'),
    compileShader: () => note('compileShader'),
    getShaderParameter: () => !(o.failCompile ?? false),
    getShaderInfoLog: () => 'boom',
    deleteShader: () => note('deleteShader'),
    createProgram: () => (note('createProgram'), make('program')),
    attachShader: () => note('attachShader'),
    linkProgram: () => note('linkProgram'),
    getProgramParameter: () => true,
    deleteProgram: () => note('deleteProgram'),
    useProgram: () => note('useProgram'),
    getUniformLocation: (_program, name) => ({ name }),
    uniform1f: (loc, v) => void (log.uniforms[(loc as { name: string }).name] = [v]),
    uniform2f: (loc, x, y) => void (log.uniforms[(loc as { name: string }).name] = [x, y]),
    createVertexArray: () => (note('createVertexArray'), make('vao')),
    bindVertexArray: () => note('bindVertexArray'),
    deleteVertexArray: () => note('deleteVertexArray'),
    viewport: (x, y, w, h) => void log.calls.push(`viewport ${x} ${y} ${w} ${h}`),
    clearColor: () => note('clearColor'),
    clear: () => note('clear'),
    enable: () => note('enable'),
    blendFunc: () => note('blendFunc'),
    drawArrays: (mode, first, count) => void log.calls.push(`drawArrays ${mode} ${first} ${count}`),
    getExtension: () => ({ loseContext: () => void (log.lost += 1) }),
  };
  return { gl, log };
};

const canvasOf = (gl: GlLike | null, log?: Log): GlCanvas => ({
  width: 0,
  height: 0,
  getContext: (_id, options) => {
    if (log !== undefined) log.contextOptions = options;
    return gl;
  },
});

const count = (log: Log, name: string): number => log.calls.filter((c) => c === name).length;

describe('createGameGl — un contexte, des programmes compilés UNE fois', () => {
  test('sans WebGL2 : null, pour que l’hôte passe au repli CSS', () => {
    expect(createGameGl(canvasOf(null))).toBeNull();
  });

  test('un contexte léger : alpha prémultiplié, ni profondeur ni pochoir ni anticrénelage', () => {
    const { gl, log } = fakeGl();
    createGameGl(canvasOf(gl, log));
    expect(log.contextOptions).toMatchObject({ alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  });

  test('les trois programmes sont compilés AU DÉMARRAGE, pas au moment de la célébration', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl));
    expect(engine?.programCount).toBe(3);
    expect(count(log, 'createProgram')).toBe(3);
    expect(count(log, 'compileShader')).toBe(6);
  });

  test('on peut ne précompiler qu’un effet', () => {
    const { gl, log } = fakeGl();
    expect(createGameGl(canvasOf(gl), { precompile: ['sheen'] })?.programCount).toBe(1);
    expect(count(log, 'createProgram')).toBe(1);
  });

  test('rendre deux fois le même effet ne recompile rien : le programme est en cache', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl), { precompile: ['sheen'] });
    engine?.render('sheen', { progress: 0.2 });
    engine?.render('sheen', { progress: 0.4 });
    expect(count(log, 'createProgram')).toBe(1);
  });

  test('un effet non précompilé se compile à la première demande, une seule fois', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl), { precompile: [] });
    expect(engine?.programCount).toBe(0);
    engine?.render('shockwave', { progress: 0.1 });
    engine?.render('shockwave', { progress: 0.2 });
    expect(count(log, 'createProgram')).toBe(1);
  });

  test('les shaders sont libérés dès l’édition de liens : seul le programme reste', () => {
    const { gl, log } = fakeGl();
    createGameGl(canvasOf(gl), { precompile: ['sheen'] });
    expect(count(log, 'deleteShader')).toBe(2);
  });

  test('un shader qui ne compile pas : null, et rien ne fuit', () => {
    const { gl, log } = fakeGl({ failCompile: true });
    expect(createGameGl(canvasOf(gl))).toBeNull();
    expect(count(log, 'deleteShader')).toBe(count(log, 'createShader'));
    expect(count(log, 'deleteProgram')).toBe(count(log, 'createProgram'));
    expect(log.lost).toBe(1);
  });
});

describe('render', () => {
  test('pose les uniformes, puis dessine un triangle plein écran (3 sommets)', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl), { precompile: ['iridescence'] });
    engine?.render('iridescence', { progress: 0.25, tilt: [0.5, -0.5], circle: true });
    expect(log.uniforms.u_progress).toEqual([0.25]);
    expect(log.uniforms.u_tilt).toEqual([0.5, -0.5]);
    expect(log.uniforms.u_circle).toEqual([1]);
    expect(log.calls.at(-1)).toBe('drawArrays 5 0 3');
  });

  test('les valeurs par défaut : progression 0, inclinaison au centre, plan rectangulaire', () => {
    const { gl, log } = fakeGl();
    createGameGl(canvasOf(gl), { precompile: ['sheen'] })?.render('sheen');
    expect(log.uniforms.u_progress).toEqual([0]);
    expect(log.uniforms.u_tilt).toEqual([0, 0]);
    expect(log.uniforms.u_circle).toEqual([0]);
  });

  test('la progression est bornée à [0, 1] et NaN devient 0', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl), { precompile: ['sheen'] });
    engine?.render('sheen', { progress: 7 });
    expect(log.uniforms.u_progress).toEqual([1]);
    engine?.render('sheen', { progress: Number.NaN });
    expect(log.uniforms.u_progress).toEqual([0]);
  });

  test('clear() efface le canvas sans dessiner', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl), { precompile: ['sheen'] });
    const draws = log.calls.filter((c) => c.startsWith('drawArrays')).length;
    engine?.clear();
    expect(count(log, 'clear')).toBe(1);
    expect(log.calls.filter((c) => c.startsWith('drawArrays')).length).toBe(draws);
  });
});

describe('resize', () => {
  test('dimensionne le canvas et la fenêtre de dessin, en pixels entiers ≥ 1', () => {
    const { gl, log } = fakeGl();
    const canvas = canvasOf(gl);
    createGameGl(canvas)?.resize(120.7, 0);
    expect(canvas.width).toBe(121);
    expect(canvas.height).toBe(1);
    expect(log.calls).toContain('viewport 0 0 121 1');
  });
});

describe('dispose — nettoyé au démontage', () => {
  test('libère chaque programme et le tableau de sommets, puis perd le contexte', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl));
    engine?.dispose();
    expect(count(log, 'deleteProgram')).toBe(3);
    expect(count(log, 'deleteVertexArray')).toBe(1);
    expect(log.lost).toBe(1);
  });

  test('après dispose, render et clear ne font plus rien — et dispose est idempotent', () => {
    const { gl, log } = fakeGl();
    const engine = createGameGl(canvasOf(gl));
    engine?.dispose();
    const before = log.calls.length;
    engine?.render('sheen', { progress: 0.5 });
    engine?.clear();
    engine?.resize(10, 10);
    engine?.dispose();
    expect(log.calls.length).toBe(before);
    expect(log.lost).toBe(1);
  });
});
