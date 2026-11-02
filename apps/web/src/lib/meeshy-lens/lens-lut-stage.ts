import type { LutCube } from './lens-lut';

/**
 * **LA LUT D'UNE LENS, SUR LE GPU** (W14, #11320) — WebGL2, dans le worker
 * des effets d'appel, sur son propre canevas hors écran. L'image entre en
 * texture 2D, le cube (`lutCubeOf`) en texture 3D `RGBA8` filtrée en
 * trilinéaire. Une passe : chaque pixel lit sa couleur dans le cube, puis se
 * mêle à l'originale selon l'intensité de la couche. Le cube ne se téléverse
 * qu'à son PREMIER usage, et de nouveau seulement quand la lens en change.
 *
 * La passe lit en `highp`, comme le compositeur du flou (#9203 : en
 * `mediump`, demi-flottant sur un GPU mobile, les couleurs voisines se
 * confondent). La constante est recopiée ici plutôt qu'importée : ce chunk
 * est chargé à la demande et n'importe rien du moteur des effets.
 *
 * Le coût est une lecture de texture 3D par pixel : à 720p, une passe plein
 * écran, du même ordre qu'une seule des passes du flou (argumenté, non mesuré).
 */
const FRAGMENT_PRECISION = 'highp';

const VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const GRADE = `#version 300 es
precision ${FRAGMENT_PRECISION} float;
precision ${FRAGMENT_PRECISION} sampler3D;
uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_size;
uniform float u_intensity;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec3 color = texture(u_image, v_uv).rgb;
  vec3 coord = (color * (u_size - 1.0) + 0.5) / u_size;
  o_color = vec4(mix(color, texture(u_lut, coord).rgb, u_intensity), 1.0);
}`;

/** La passe de fragment, relue par son témoin. */
export const LUT_FRAGMENT_SHADER = GRADE;

export type LutStage = {
  /** L'image étalonnée (le canevas du GPU). */
  readonly render: (source: CanvasImageSource, width: number, height: number, cube: LutCube, intensity: number) => CanvasImageSource;
  readonly release: () => void;
};

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error('lens-lut: shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) throw new Error(`lens-lut: ${gl.getShaderInfoLog(shader) ?? 'compile'}`);
  return shader;
}

function program(gl: WebGL2RenderingContext): WebGLProgram {
  const made = gl.createProgram();
  gl.attachShader(made, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(made, compile(gl, gl.FRAGMENT_SHADER, GRADE));
  gl.bindAttribLocation(made, 0, 'a_position');
  gl.linkProgram(made);
  if (gl.getProgramParameter(made, gl.LINK_STATUS) !== true) throw new Error(`lens-lut: ${gl.getProgramInfoLog(made) ?? 'link'}`);
  return made;
}

function linearTexture(gl: WebGL2RenderingContext, target: number): WebGLTexture {
  const made = gl.createTexture();
  gl.bindTexture(target, made);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  return made;
}

type Canvas = { width: number; height: number };

/** L'étage LUT sur le contexte WebGL2 d'un canevas — lève si le shader refuse (la lens se joue alors sans sa LUT). */
export function createLutStage(gl: WebGL2RenderingContext): LutStage {
  const canvas = gl.canvas as unknown as Canvas;
  const grade = program(gl);
  const uniform = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(grade, name);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const image = linearTexture(gl, gl.TEXTURE_2D);
  const lut = linearTexture(gl, gl.TEXTURE_3D);
  let uploaded: LutCube | null = null;

  const upload = (cube: LutCube): void => {
    if (uploaded === cube) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lut);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, cube.size, cube.size, cube.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, cube.data);
    uploaded = cube;
  };

  return {
    render: (source, width, height, cube, intensity) => {
      if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });
      upload(cube);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(grade);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, image);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
      gl.uniform1i(uniform('u_image'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, lut);
      gl.uniform1i(uniform('u_lut'), 1);
      gl.uniform1f(uniform('u_size'), cube.size);
      gl.uniform1f(uniform('u_intensity'), Math.min(1, Math.max(0, intensity)));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return gl.canvas as CanvasImageSource;
    },
    release: () => {
      gl.deleteTexture(image);
      gl.deleteTexture(lut);
      gl.deleteProgram(grade);
      gl.deleteBuffer(quad);
      uploaded = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
