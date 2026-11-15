/**
 * LES TROIS SHADERS DU JEU (#9381) — GLSL ES 3.00 (WebGL2), un triangle plein
 * écran, SANS dépendance. Ils rejouent sur le web ce que MeeshyUI joue en Metal
 * (conception, partie V) : reflet spéculaire qui balaie le métal, onde radiale
 * de frappe, irisation du prisme selon l'inclinaison.
 *
 * Tous écrivent en alpha PRÉMULTIPLIÉ (le canvas se superpose au SVG de
 * l'objet) et partagent trois uniformes :
 *   · `u_progress` 0..1 — l'avancement du geste (balayage, rayon de l'onde) ;
 *   · `u_tilt` [-1,1]²  — l'inclinaison de l'appareil (irisation) ;
 *   · `u_circle` 0|1    — masque circulaire (la Meesh) ou plan entier.
 */

export type GameEffect = 'sheen' | 'shockwave' | 'iridescence';

export const GAME_EFFECTS: readonly GameEffect[] = ['sheen', 'shockwave', 'iridescence'];

export const VERTEX_SOURCE = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const HEADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform float u_progress;
uniform vec2 u_tilt;
uniform float u_circle;
out vec4 outColor;
float maskOf(vec2 uv) {
  float edge = smoothstep(0.5, 0.485, length(uv - 0.5));
  return mix(1.0, edge, u_circle);
}
`;

const SHEEN = `${HEADER}
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float angle = 0.349;
  float d = dot(uv - 0.5, vec2(cos(angle), sin(angle)));
  float p = mix(-0.8, 0.8, u_progress);
  float band = exp(-pow((d - p) / 0.07, 2.0));
  float halo = exp(-pow((d - p) / 0.22, 2.0)) * 0.22;
  float k = (band * 0.75 + halo) * maskOf(uv) * step(0.001, u_progress);
  outColor = vec4(vec3(k), k);
}
`;

const SHOCKWAVE = `${HEADER}
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float r = length(uv - 0.5) * 2.0;
  float radius = u_progress * 1.25;
  float width = mix(0.14, 0.03, u_progress);
  float ring = smoothstep(width, 0.0, abs(r - radius));
  float k = ring * (1.0 - u_progress) * 0.85 * step(0.001, u_progress);
  outColor = vec4(vec3(k), k);
}
`;

const IRIDESCENCE = `${HEADER}
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float h = fract(dot(uv, vec2(0.62, 0.38)) + u_tilt.x * 0.55 + u_tilt.y * 0.35);
  vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
  float glint = 0.55 + 0.45 * sin((uv.x * u_tilt.x + uv.y * u_tilt.y) * 6.0 + h * 6.28318);
  float k = 0.34 * glint * maskOf(uv);
  outColor = vec4(spectrum * k, k);
}
`;

export const FRAGMENT_SOURCES: Readonly<Record<GameEffect, string>> = { sheen: SHEEN, shockwave: SHOCKWAVE, iridescence: IRIDESCENCE };
