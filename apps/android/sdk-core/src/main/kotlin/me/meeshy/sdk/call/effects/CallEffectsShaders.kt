package me.meeshy.sdk.call.effects

/**
 * The GLSL ES 1.00 programs of the call video effects. Three steps, in iOS order (retouch on the sensor
 * image, then the background blur, then the colour):
 * - [grade]: the camera texture (OES or RGB) → skin smoothing, and, without a blur, the colour too;
 * - [blur]: one separable gaussian direction, at a quarter of the resolution;
 * - [composite]: the person (mask) over the blurred background, then the colour.
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
float skin(vec3 c) {
  vec3 ycc = toYCC(c);
  vec2 chroma = (ycc.yz - vec2(-0.085, 0.095)) / vec2(0.115, 0.095);
  return (1.0 - smoothstep(0.7, 1.15, length(chroma))) * smoothstep(0.035, 0.11, ycc.x);
}
"""

    private fun gradeBody(sampler: String): String = """
$PRECISION
uniform $sampler src;
uniform vec2 texel;
uniform float smoothing;
uniform float textureKept;
uniform float applyColor;
varying vec2 tc;
varying vec2 pos;
$COLOR
$SKIN
#define TAP(x, y) { vec3 s = texture2D(src, tc + vec2(x, y) * texel).rgb; vec3 d = s - c; float w = exp(-dot(d, d) * 48.0); sum += s * w; wsum += w; }
vec3 retouch(vec3 c) {
  vec3 sum = c;
  float wsum = 1.0;
  TAP(3.0, 0.0) TAP(-3.0, 0.0) TAP(0.0, 3.0) TAP(0.0, -3.0)
  TAP(2.1, 2.1) TAP(-2.1, 2.1) TAP(2.1, -2.1) TAP(-2.1, -2.1)
  TAP(6.0, 0.0) TAP(-6.0, 0.0) TAP(0.0, 6.0) TAP(0.0, -6.0)
  vec3 low = sum / wsum;
  float mask = min(skin(low), skin(c));
  vec3 smoothed = low + (c - low) * textureKept;
  return mix(c, smoothed, smoothing * mask);
}
void main() {
  vec3 c = texture2D(src, tc).rgb;
  if (smoothing > 0.0) { c = retouch(c); }
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
