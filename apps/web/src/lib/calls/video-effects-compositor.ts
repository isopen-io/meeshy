import { gaussianTaps, type Compositor } from './video-effects-blur';

/**
 * **LE COMPOSITEUR DU FLOU** (#8471) — WebGL2, dans le worker, sur son propre
 * canevas hors écran. Par image :
 *
 * 1. l'image entre en texture ;
 * 2. RÉDUCTION ×4 (quatre prises bilinéaires = une moyenne 4 × 4) ;
 * 3. flou gaussien SÉPARABLE, horizontal puis vertical, deux fois, sur la
 *    réduction (seize fois moins de pixels qu'à pleine taille) ;
 * 4. REMONTÉE bilinéaire et mélange : `mix(flou, net, smoothstep(masque))` —
 *    la personne nette, l'arrière-plan flou, un bord adouci.
 *
 * Le masque (`mask`) arrive à part, quinze fois par seconde ; il vaut 0
 * (tout flouté) tant qu'aucune découpe n'est arrivée.
 */

const SCALE = 4;
const SIGMA = 3;
const PASSES = 2;

const VERTEX = `#version 300 es
in vec2 a_position;
uniform float u_flip;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, u_flip > 0.5 ? (1.0 - a_position.y) * 0.5 : (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const DOWN = `#version 300 es
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_texel;
in vec2 v_uv;
out vec4 o_color;
void main() {
  o_color = 0.25 * (texture(u_image, v_uv + u_texel * vec2(-1.0, -1.0)) + texture(u_image, v_uv + u_texel * vec2(1.0, -1.0)) + texture(u_image, v_uv + u_texel * vec2(-1.0, 1.0)) + texture(u_image, v_uv + u_texel * vec2(1.0, 1.0)));
}`;

const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_step;
uniform float u_center;
uniform vec4 u_offsets;
uniform vec4 u_weights;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec4 sum = texture(u_image, v_uv) * u_center;
  for (int i = 0; i < 4; i++) {
    vec2 shift = u_step * u_offsets[i];
    sum += (texture(u_image, v_uv + shift) + texture(u_image, v_uv - shift)) * u_weights[i];
  }
  o_color = sum;
}`;

const MIX = `#version 300 es
precision mediump float;
uniform sampler2D u_sharp;
uniform sampler2D u_blurred;
uniform sampler2D u_mask;
in vec2 v_uv;
out vec4 o_color;
void main() {
  float person = smoothstep(0.3, 0.7, texture(u_mask, v_uv).r);
  o_color = vec4(mix(texture(u_blurred, v_uv).rgb, texture(u_sharp, v_uv).rgb, person), 1.0);
}`;

type Program = { readonly program: WebGLProgram; readonly uniform: (name: string) => WebGLUniformLocation | null };

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error('compositor: shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) throw new Error(`compositor: ${gl.getShaderInfoLog(shader) ?? 'compile'}`);
  return shader;
}

function link(gl: WebGL2RenderingContext, fragment: string): Program {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) throw new Error(`compositor: ${gl.getProgramInfoLog(program) ?? 'link'}`);
  const locations = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    uniform: (name) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
      return locations.get(name) ?? null;
    },
  };
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const made = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, made);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return made;
}

type Target = { readonly texture: WebGLTexture; readonly framebuffer: WebGLFramebuffer };

function target(gl: WebGL2RenderingContext, width: number, height: number): Target {
  const made = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, made, 0);
  return { texture: made, framebuffer };
}

type Canvas = { width: number; height: number };

/** Le compositeur, sur le contexte WebGL2 d'un canevas — lève si un shader refuse (l'hôte n'offre alors pas de flou). */
export function createBlurCompositor(gl: WebGL2RenderingContext): Compositor {
  const canvas = gl.canvas as unknown as Canvas;
  const down = link(gl, DOWN);
  const blur = link(gl, BLUR);
  const mix = link(gl, MIX);
  const taps = gaussianTaps(SIGMA);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const sharp = texture(gl);
  const mask = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  let small: { readonly width: number; readonly height: number; readonly a: Target; readonly b: Target } | null = null;

  const sized = (width: number, height: number) => {
    const w = Math.max(1, Math.ceil(width / SCALE));
    const h = Math.max(1, Math.ceil(height / SCALE));
    if (small !== null && small.width === w && small.height === h) return small;
    if (small !== null) [small.a, small.b].forEach((old) => (gl.deleteTexture(old.texture), gl.deleteFramebuffer(old.framebuffer)));
    small = { width: w, height: h, a: target(gl, w, h), b: target(gl, w, h) };
    return small;
  };

  const pass = (program: Program, into: WebGLFramebuffer | null, width: number, height: number, flip: boolean): void => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    gl.uniform1f(program.uniform('u_flip'), flip ? 1 : 0);
  };

  const bind = (unit: number, made: WebGLTexture, program: Program, name: string): void => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.uniform1i(program.uniform(name), unit);
  };

  return {
    render: (source, width, height) => {
      if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
      const { a, b, width: w, height: h } = sized(width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sharp);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);

      pass(down, a.framebuffer, w, h, false);
      bind(0, sharp, down, 'u_image');
      gl.uniform2f(down.uniform('u_texel'), 1 / width, 1 / height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      for (let round = 0; round < PASSES; round += 1) {
        [
          { from: a, into: b, step: [1 / w, 0] as const },
          { from: b, into: a, step: [0, 1 / h] as const },
        ].forEach(({ from, into, step }) => {
          pass(blur, into.framebuffer, w, h, false);
          bind(0, from.texture, blur, 'u_image');
          gl.uniform2f(blur.uniform('u_step'), step[0], step[1]);
          gl.uniform1f(blur.uniform('u_center'), taps.center);
          gl.uniform4fv(blur.uniform('u_offsets'), taps.offsets);
          gl.uniform4fv(blur.uniform('u_weights'), taps.weights);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });
      }

      pass(mix, null, width, height, true);
      bind(0, sharp, mix, 'u_sharp');
      bind(1, a.texture, mix, 'u_blurred');
      bind(2, mask, mix, 'u_mask');
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    mask: (bytes, width, height) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    },
    release: () => {
      if (small !== null) [small.a, small.b].forEach((old) => (gl.deleteTexture(old.texture), gl.deleteFramebuffer(old.framebuffer)));
      small = null;
      [sharp, mask].forEach((made) => gl.deleteTexture(made));
      [down, blur, mix].forEach((made) => gl.deleteProgram(made.program));
      gl.deleteBuffer(quad);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
