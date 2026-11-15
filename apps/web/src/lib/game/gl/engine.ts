import { FRAGMENT_SOURCES, GAME_EFFECTS, VERTEX_SOURCE, type GameEffect } from './shaders';
import type { Tilt } from './timeline';

export type { GameEffect } from './shaders';

/**
 * LE MOTEUR WEBGL2 DU JEU (#9381) — maison, sans dépendance : UN canvas, un
 * triangle plein écran, trois programmes.
 *
 *   · les programmes sont compilés UNE fois, au démarrage (jamais pendant la
 *     célébration) et gardés en cache ; les shaders sont libérés dès l'édition
 *     de liens ;
 *   · `dispose()` libère programmes, tableau de sommets, puis PERD le contexte
 *     (le navigateur plafonne les contextes WebGL vivants : un moteur oublié en
 *     bloquerait un autre) ; après lui, tout appel est sans effet ;
 *   · une compilation qui échoue rend `null` — l'hôte passe au repli CSS.
 *
 * `GlLike` est la SURFACE réellement utilisée de `WebGL2RenderingContext` : le
 * vrai contexte la satisfait, et un faux de test aussi.
 */

export type GlLike = {
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
  readonly COMPILE_STATUS: number;
  readonly LINK_STATUS: number;
  readonly TRIANGLES: number;
  readonly COLOR_BUFFER_BIT: number;
  readonly BLEND: number;
  readonly ONE: number;
  readonly ONE_MINUS_SRC_ALPHA: number;
  createShader(type: number): object | null;
  shaderSource(shader: object, source: string): void;
  compileShader(shader: object): void;
  getShaderParameter(shader: object, pname: number): unknown;
  getShaderInfoLog(shader: object): string | null;
  deleteShader(shader: object | null): void;
  createProgram(): object | null;
  attachShader(program: object, shader: object): void;
  linkProgram(program: object): void;
  getProgramParameter(program: object, pname: number): unknown;
  deleteProgram(program: object | null): void;
  useProgram(program: object | null): void;
  getUniformLocation(program: object, name: string): object | null;
  uniform1f(location: object | null, value: number): void;
  uniform2f(location: object | null, x: number, y: number): void;
  createVertexArray(): object | null;
  bindVertexArray(array: object | null): void;
  deleteVertexArray(array: object | null): void;
  viewport(x: number, y: number, width: number, height: number): void;
  clearColor(r: number, g: number, b: number, a: number): void;
  clear(mask: number): void;
  enable(capability: number): void;
  blendFunc(source: number, destination: number): void;
  drawArrays(mode: number, first: number, count: number): void;
  getExtension(name: string): { loseContext(): void } | null;
};

export type GlCanvas = {
  width: number;
  height: number;
  getContext(contextId: 'webgl2', options: WebGLContextAttributes): GlLike | null;
};

export type RenderUniforms = {
  /** 0..1 — borné ; illisible = 0. */
  readonly progress?: number;
  readonly tilt?: Tilt;
  /** Masque circulaire (la Meesh) ; sinon plan entier. */
  readonly circle?: boolean;
};

export type GameGl = {
  render(effect: GameEffect, uniforms?: RenderUniforms): void;
  clear(): void;
  resize(width: number, height: number): void;
  dispose(): void;
  readonly programCount: number;
};

type Program = {
  readonly handle: object;
  readonly progress: object | null;
  readonly tilt: object | null;
  readonly circle: object | null;
};

const CONTEXT_OPTIONS: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'default' };

const unit = (value: number | undefined): number => (value !== undefined && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const pixels = (value: number): number => Math.max(1, Math.round(Number.isFinite(value) ? value : 1));

export const createGameGl = (canvas: GlCanvas, options: { readonly precompile?: readonly GameEffect[] } = {}): GameGl | null => {
  const gl = canvas.getContext('webgl2', CONTEXT_OPTIONS);
  if (gl === null) return null;

  const programs = new Map<GameEffect, Program>();
  const vao = gl.createVertexArray();
  let disposed = false;

  const compile = (type: number, source: string): object | null => {
    const shader = gl.createShader(type);
    if (shader === null) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) return shader;
    gl.deleteShader(shader);
    return null;
  };

  const build = (effect: GameEffect): Program | null => {
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCES[effect]);
    const handle = vertex !== null && fragment !== null ? gl.createProgram() : null;
    if (handle !== null && vertex !== null && fragment !== null) {
      gl.attachShader(handle, vertex);
      gl.attachShader(handle, fragment);
      gl.linkProgram(handle);
    }
    if (vertex !== null) gl.deleteShader(vertex);
    if (fragment !== null) gl.deleteShader(fragment);
    if (handle === null) return null;
    if (gl.getProgramParameter(handle, gl.LINK_STATUS) !== true) {
      gl.deleteProgram(handle);
      return null;
    }
    return { handle, progress: gl.getUniformLocation(handle, 'u_progress'), tilt: gl.getUniformLocation(handle, 'u_tilt'), circle: gl.getUniformLocation(handle, 'u_circle') };
  };

  const programOf = (effect: GameEffect): Program | null => {
    const cached = programs.get(effect);
    if (cached !== undefined) return cached;
    const built = build(effect);
    if (built !== null) programs.set(effect, built);
    return built;
  };

  const release = (): void => {
    for (const program of programs.values()) gl.deleteProgram(program.handle);
    programs.clear();
    if (vao !== null) gl.deleteVertexArray(vao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  for (const effect of options.precompile ?? GAME_EFFECTS) {
    if (programOf(effect) === null) {
      release();
      return null;
    }
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return {
    get programCount() {
      return programs.size;
    },
    render(effect, uniforms = {}) {
      if (disposed) return;
      const program = programOf(effect);
      if (program === null) return;
      const tilt = uniforms.tilt ?? [0, 0];
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program.handle);
      gl.uniform1f(program.progress, unit(uniforms.progress));
      gl.uniform2f(program.tilt, tilt[0], tilt[1]);
      gl.uniform1f(program.circle, uniforms.circle === true ? 1 : 0);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    clear() {
      if (disposed) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    resize(width, height) {
      if (disposed) return;
      canvas.width = pixels(width);
      canvas.height = pixels(height);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
};
