package me.meeshy.sdk.call.effects

/**
 * The GLSL ES 1.00 programs of the call video effects. Three steps, in iOS order (retouch on the sensor
 * image, then the background blur, then the colour):
 * - [grade]: the camera texture (OES or RGB) → the face retouch, and, without a blur, the colour too;
 * - [blur]: one separable gaussian direction, at a quarter of the resolution;
 * - [composite]: the person (mask) over the blurred background, then the colour.
 * The stylized face effects come last, in [CallFaceShaders].
 *
 * `pos` is the 0…1 position in the target, GL origin at the BOTTOM-left (the bottom of the image);
 * `tc` the source coordinate after the buffer's own transform.
 */
internal object CallEffectsShaders {
    const val VERTEX: String = """
attribute vec4 in_pos;
attribute vec4 in_tc;
uniform mat4 tex_mat;
varying vec2 tc;
varying vec2 pos;
void main() {
  gl_Position = in_pos;
  tc = (tex_mat * in_tc).xy;
  pos = in_tc.xy;
}
"""

    private const val PRECISION: String = """
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
"""

    /** Brightness offset, then the look read from the packed cube strip (see `CallColorLook.lutStrip`). */
    private const val COLOR: String = """
uniform sampler2D lut;
uniform float lutOn;
uniform float lutN;
uniform float brightness;
vec3 lutLookup(vec3 c) {
  float n = lutN;
  float b = clamp(c.b, 0.0, 1.0) * (n - 1.0);
  float b0 = floor(b);
  float b1 = min(b0 + 1.0, n - 1.0);
  float x = (clamp(c.r, 0.0, 1.0) * (n - 1.0) + 0.5) / (n * n);
  float y = (clamp(c.g, 0.0, 1.0) * (n - 1.0) + 0.5) / n;
  vec3 s0 = texture2D(lut, vec2(x + b0 / n, y)).rgb;
  vec3 s1 = texture2D(lut, vec2(x + b1 / n, y)).rgb;
  return mix(s0, s1, b - b0);
}
vec3 color(vec3 c) {
  vec3 lit = clamp(c + vec3(brightness), 0.0, 1.0);
  return lutOn > 0.5 ? lutLookup(lit) : lit;
}
"""

    /** Skin likelihood in YCbCr chroma, stable across complexions — the same as iOS `meeshySkinLikelihood`. */
    private const val SKIN: String = """
vec3 toYCC(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  return vec3(y, (c.b - y) * 0.564, (c.r - y) * 0.713);
}
vec3 toRGB(vec3 v) {
  return vec3(v.x + 1.403 * v.z, v.x - 0.344 * v.y - 0.714 * v.z, v.x + 1.773 * v.y);
}
float skinYCC(vec3 ycc) {
  vec2 chroma = (ycc.yz - vec2(-0.085, 0.095)) / vec2(0.115, 0.095);
  return (1.0 - smoothstep(0.7, 1.15, length(chroma))) * smoothstep(0.035, 0.11, ycc.x);
}
"""

    /**
     * The camera texture → Natural complexion and skin smoothing on the tracked face (iOS `meeshySkinRetouch`, #9196),
     * and, without a blur, the colour too. The skin mask is not a texture: the face geometry (ellipses in UPRIGHT
     * pixels, see `CallSkinMaskGeometry.write`) times a chroma skin likelihood, computed here pixel by pixel. Outside
     * the face ellipse nothing is sampled twice.
     */
    private fun gradeBody(sampler: String): String = """
$PRECISION
uniform $sampler src;
uniform vec2 texel;
uniform float retouchOn;
uniform vec4 strength;
uniform float finePass;
uniform vec4 faceE;
uniform vec4 eyeL;
uniform vec4 eyeR;
uniform vec4 browL;
uniform vec4 browR;
uniform vec4 mouthE;
uniform vec4 underL;
uniform vec4 underR;
uniform vec2 rot;
uniform float applyColor;
varying vec2 tc;
varying vec2 pos;
${CallFaceShaders.ORIENT}
$COLOR
$SKIN
float ellipseDist(vec2 p, vec4 e) {
  vec2 d = p - e.xy;
  vec2 l = vec2(d.x * rot.x + d.y * rot.y, -d.x * rot.y + d.y * rot.x);
  return length(l / max(e.zw, vec2(1.0)));
}
float outsideE(vec2 p, vec4 e) { return smoothstep(0.85, 1.25, ellipseDist(p, e)); }
#define TAP(x, y) { vec3 s = texture2D(src, tc + vec2(x, y) * texel).rgb; vec3 d = s - c; float w = exp(-dot(d, d) * 48.0); sum += s * w; wsum += w; }
#define FINE(x, y) fine += texture2D(src, tc + vec2(x, y) * texel).rgb;
vec3 retouch(vec3 c) {
  vec2 p = uprightPx(pos);
  float geometry = 1.0 - smoothstep(0.78, 1.0, ellipseDist(p, faceE));
  if (geometry <= 0.0) { return c; }
  geometry *= outsideE(p, eyeL) * outsideE(p, eyeR) * outsideE(p, browL) * outsideE(p, browR) * outsideE(p, mouthE);
  if (geometry <= 0.0) { return c; }
  vec3 sum = c;
  float wsum = 1.0;
  TAP(3.0, 0.0) TAP(-3.0, 0.0) TAP(0.0, 3.0) TAP(0.0, -3.0)
  TAP(2.1, 2.1) TAP(-2.1, 2.1) TAP(2.1, -2.1) TAP(-2.1, -2.1)
  TAP(6.0, 0.0) TAP(-6.0, 0.0) TAP(0.0, 6.0) TAP(0.0, -6.0)
  vec3 low = sum / wsum;
  vec3 fine = low;
  if (finePass > 0.5) {
    fine = c;
    FINE(1.0, 0.0) FINE(-1.0, 0.0) FINE(0.0, 1.0) FINE(0.0, -1.0)
    fine /= 5.0;
  }
  vec3 o = toYCC(c);
  vec3 l = toYCC(low);
  vec3 f = toYCC(fine);
  float skin = min(skinYCC(l), skinYCC(o));
  float mask = geometry * skin;
  if (mask <= 0.0) { return c; }
  float tone = strength.x * mask;
  float smoothing = strength.y * mask;
  vec3 r = o;
  r.yz = mix(o.yz, l.yz, 0.45 * tone);
  float lift = min(0.022 * (1.0 - o.x) + 0.35 * max(l.x - o.x, 0.0), 0.04);
  float shine = smoothstep(0.80, 0.97, o.x) * 0.35 * max(o.x - l.x, 0.0);
  r.x = o.x + tone * (lift - shine);
  float textured = l.x + (o.x - f.x) * strength.z + (r.x - o.x);
  r.x = mix(r.x, textured, smoothing);
  r.yz = mix(r.yz, l.yz, 0.55 * smoothing);
  float under = min(1.0, (1.0 - smoothstep(0.6, 1.0, ellipseDist(p, underL))) + (1.0 - smoothstep(0.6, 1.0, ellipseDist(p, underR))));
  r.x += strength.w * under * skin * 0.035 * (1.0 - r.x);
  return clamp(toRGB(r), 0.0, 1.0);
}
void main() {
  vec3 c = texture2D(src, tc).rgb;
  if (retouchOn > 0.5) { c = retouch(c); }
  if (applyColor > 0.5) { c = color(c); }
  gl_FragColor = vec4(c, 1.0);
}
"""

    val GRADE_OES: String = "#extension GL_OES_EGL_image_external : require\n" + gradeBody("samplerExternalOES")
    val GRADE_RGB: String = gradeBody("sampler2D")

    val BLUR: String = """
$PRECISION
uniform sampler2D src;
uniform vec2 stride;
uniform float w0;
uniform float w1;
uniform float w2;
uniform float w3;
uniform float w4;
uniform float w5;
uniform float w6;
varying vec2 tc;
varying vec2 pos;
vec3 pair(float k) { return texture2D(src, pos + stride * k).rgb + texture2D(src, pos - stride * k).rgb; }
void main() {
  vec3 c = texture2D(src, pos).rgb * w0;
  c += pair(1.0) * w1 + pair(2.0) * w2 + pair(3.0) * w3 + pair(4.0) * w4 + pair(5.0) * w5 + pair(6.0) * w6;
  gl_FragColor = vec4(c, 1.0);
}
"""

    /**
     * The mask was cut from the UPRIGHT image (rows top-first): `upright` is the literal mirror of
     * `CallFrameOrientation.upright`, applied to the buffer point with a top-left origin.
     */
    val COMPOSITE: String = """
$PRECISION
uniform sampler2D base;
uniform sampler2D blurred;
uniform sampler2D mask;
uniform float rotation;
varying vec2 tc;
varying vec2 pos;
$COLOR
vec2 upright(vec2 p) {
  if (rotation < 45.0) { return p; }
  if (rotation < 135.0) { return vec2(1.0 - p.y, p.x); }
  if (rotation < 225.0) { return vec2(1.0 - p.x, 1.0 - p.y); }
  return vec2(p.y, 1.0 - p.x);
}
void main() {
  vec3 sharp = texture2D(base, pos).rgb;
  float person = smoothstep(0.25, 0.75, texture2D(mask, upright(vec2(pos.x, 1.0 - pos.y))).r);
  vec3 c = mix(texture2D(blurred, pos).rgb, sharp, person);
  gl_FragColor = vec4(color(c), 1.0);
}
"""
}
