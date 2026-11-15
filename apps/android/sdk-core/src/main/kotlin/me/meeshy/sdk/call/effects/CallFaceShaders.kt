package me.meeshy.sdk.call.effects

/**
 * The GLSL ES 1.00 programs of the stylized face effects (#13706) — iOS `CallFaceEffectsRenderer`, drawn after the
 * colour like iOS `lensStages` (blur, colour, face):
 * - [STYLIZE]: the whole frame — toad (bumps on cheeks and eyes, green skin in the face ellipse), angel (glow and
 *   warmth), demon (red grade and vignette), eruption (warm grade and lava);
 * - [SPRITE]: one drawing (halo, horn, spot) placed on the face, turned with it, blended over the frame.
 *
 * Positions are reasoned in UPRIGHT pixels (y down, the image the remote sees), like the face the tracker keeps.
 */
internal object CallFaceShaders {

    /**
     * `uprightUnit` is the literal mirror of `CallFrameOrientation.upright`, `bufferUnit` of `.buffer`; `pos` is the GL
     * position in the buffer-oriented target (origin bottom-left), `size` the upright size in pixels.
     */
    const val ORIENT: String = """
uniform float rotation;
uniform vec2 size;
vec2 uprightUnit(vec2 p) {
  if (rotation < 45.0) { return p; }
  if (rotation < 135.0) { return vec2(1.0 - p.y, p.x); }
  if (rotation < 225.0) { return vec2(1.0 - p.x, 1.0 - p.y); }
  return vec2(p.y, 1.0 - p.x);
}
vec2 bufferUnit(vec2 u) {
  if (rotation < 45.0) { return u; }
  if (rotation < 135.0) { return vec2(u.y, 1.0 - u.x); }
  if (rotation < 225.0) { return vec2(1.0 - u.x, 1.0 - u.y); }
  return vec2(1.0 - u.y, u.x);
}
vec2 uprightPx(vec2 p) { return uprightUnit(vec2(p.x, 1.0 - p.y)) * size; }
vec2 posOf(vec2 px) { vec2 b = bufferUnit(px / size); return vec2(b.x, 1.0 - b.y); }
"""

    private const val PRECISION: String = """
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
"""

    /**
     * `effect`: 1 toad, 2 angel, 3 demon, 4 eruption. `bump0…3` = (centre, radius, scale) in upright pixels, applied
     * in iOS order (cheeks then eyes), so sampled in reverse. `faceBox` = (centre, half width, height / width).
     */
    val STYLIZE: String = """
$PRECISION
uniform sampler2D src;
uniform sampler2D glow;
uniform float effect;
uniform float faceOn;
uniform float glowOn;
uniform vec4 bump0;
uniform vec4 bump1;
uniform vec4 bump2;
uniform vec4 bump3;
uniform vec4 faceBox;
uniform vec2 lava;
varying vec2 tc;
varying vec2 pos;
$ORIENT
vec2 bump(vec2 p, vec4 b) {
  vec2 d = p - b.xy;
  float dist = length(d);
  if (b.z <= 0.0 || dist >= b.z) { return p; }
  float f = 1.0 - dist / b.z;
  return b.xy + d * (1.0 - b.w * f * f);
}
float luma(vec3 c) { return dot(c, vec3(0.2125, 0.7154, 0.0721)); }
vec3 toad(vec2 p) {
  vec2 s = p;
  if (faceOn > 0.5) { s = bump(bump(bump(bump(s, bump3), bump2), bump1), bump0); }
  vec3 c = texture2D(src, posOf(s)).rgb;
  vec3 green = vec3(0.36, 0.78, 0.24) * luma(c);
  if (faceOn < 0.5) { return mix(c, green, 0.22); }
  float dist = length((p - faceBox.xy) / vec2(1.0, max(faceBox.w, 0.01)));
  float inside = 1.0 - clamp((dist - 0.55 * faceBox.z) / max(0.5 * faceBox.z, 1.0), 0.0, 1.0);
  return mix(c, green, 0.65 * inside);
}
vec3 angel(vec3 c) {
  if (glowOn > 0.5) {
    vec3 g = texture2D(glow, pos).rgb * 0.55;
    c = vec3(1.0) - (vec3(1.0) - c) * (vec3(1.0) - g);
  }
  c = c + vec3(0.03);
  return mix(vec3(luma(c)), c, 1.05);
}
vec3 demon(vec3 c, vec2 p) {
  c = c * vec3(1.18, 0.8, 0.78) + vec3(0.02, 0.0, 0.0);
  float d = length(p - size * 0.5) / max(0.5 * length(size), 1.0);
  return c * (1.0 - 0.59 * smoothstep(0.55, 1.0, d));
}
vec3 volcano(vec3 c, vec2 p) {
  c = c * vec3(1.12, 0.9, 0.72) + vec3(0.03, 0.01, 0.0);
  float rise = size.y - p.y;
  if (rise >= lava.x) { return c; }
  float t = rise / max(lava.x, 1.0);
  return mix(c, mix(vec3(1.0, 0.32, 0.02), vec3(1.0, 0.55, 0.05), t), lava.y * (1.0 - t));
}
void main() {
  vec2 p = uprightPx(pos);
  vec3 c;
  if (effect < 1.5) { c = toad(p); }
  else if (effect < 2.5) { c = angel(texture2D(src, pos).rgb); }
  else if (effect < 3.5) { c = demon(texture2D(src, pos).rgb, p); }
  else { c = volcano(texture2D(src, pos).rgb, p); }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
"""

    /**
     * A unit quad (`in_pos` 0…1) placed at `placement` = (centre, width, height) in upright pixels, turned by `turn`
     * = (cos, sin), mirrored when `mirror` < 0, then written in the buffer-oriented target.
     */
    val SPRITE_VERTEX: String = """
attribute vec4 in_pos;
uniform vec4 placement;
uniform vec2 turn;
uniform float mirror;
varying vec2 tc;
$ORIENT
void main() {
  vec2 corner = in_pos.xy;
  vec2 local = (corner - 0.5) * placement.zw;
  vec2 q = placement.xy + vec2(local.x * turn.x - local.y * turn.y, local.x * turn.y + local.y * turn.x);
  vec2 b = bufferUnit(q / size);
  gl_Position = vec4(b.x * 2.0 - 1.0, (1.0 - b.y) * 2.0 - 1.0, 0.0, 1.0);
  tc = vec2(mirror < 0.0 ? 1.0 - corner.x : corner.x, corner.y);
}
"""

    /** Premultiplied output: a drawing faded by `tint.a`, or (tinted) a white spot coloured by `tint`. */
    val SPRITE: String = """
$PRECISION
uniform sampler2D sprite;
uniform vec4 tint;
uniform float tinted;
varying vec2 tc;
void main() {
  vec4 t = texture2D(sprite, tc);
  gl_FragColor = tinted > 0.5 ? vec4(tint.rgb, 1.0) * (tint.a * t.a) : t * tint.a;
}
"""
}
