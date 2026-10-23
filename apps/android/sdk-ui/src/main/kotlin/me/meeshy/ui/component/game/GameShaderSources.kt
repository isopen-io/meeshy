package me.meeshy.ui.component.game

/**
 * Les trois shaders du jeu en AGSL (API 33+), portés de `GameShaders.metal`. Mêmes noms de fonctions et
 * mêmes uniforms qu'à iOS (`size`, `progress`, `intensity`, `center`, `amplitude`, `wavelength`, `tilt`) ;
 * `content` est le calque lui-même (équivalent de `SwiftUI::Layer`). Chaque source est pure : le temps,
 * l'inclinaison et le centre de l'onde viennent de l'hôte.
 */
public object GameShaderSources {

    /** Les noms de fonctions de `GameShaders.metal`, dans l'ordre de `GameShaders.functionNames`. */
    public val functionNames: List<String> = listOf("meeshySpecularSheen", "meeshyStrikeWave", "meeshyPrismIridescence")

    public val uniformsBySource: Map<String, List<String>> = mapOf(
        "meeshySpecularSheen" to listOf("content", "size", "progress", "intensity"),
        "meeshyStrikeWave" to listOf("content", "size", "center", "progress", "amplitude", "wavelength"),
        "meeshyPrismIridescence" to listOf("content", "size", "tilt", "intensity"),
    )

    public val sources: Map<String, String> get() = mapOf(
        "meeshySpecularSheen" to SPECULAR_SHEEN,
        "meeshyStrikeWave" to STRIKE_WAVE,
        "meeshyPrismIridescence" to PRISM_IRIDESCENCE,
    )

    /** Reflet spéculaire : une bande qui accroche le relief déduit de la luminance du calque. */
    public const val SPECULAR_SHEEN: String = """
uniform shader content;
uniform float2 size;
uniform float progress;
uniform float intensity;

float meeshyLuminance(half4 c) {
    return dot(float3(c.rgb), float3(0.299, 0.587, 0.114));
}

half4 main(float2 position) {
    half4 base = content.eval(position);
    if (base.a < 0.01 || progress <= 0.0 || progress >= 1.0) { return base; }

    float step = 1.5;
    float left = meeshyLuminance(content.eval(position - float2(step, 0.0)));
    float right = meeshyLuminance(content.eval(position + float2(step, 0.0)));
    float up = meeshyLuminance(content.eval(position - float2(0.0, step)));
    float down = meeshyLuminance(content.eval(position + float2(0.0, step)));
    float3 normal = normalize(float3((left - right) * 3.0, (up - down) * 3.0, 1.0));

    float3 toLight = normalize(float3(-0.5, -0.6, 0.65));
    float3 halfway = normalize(toLight + float3(0.0, 0.0, 1.0));
    float specular = pow(max(dot(normal, halfway), 0.0), 24.0);

    float2 uv = position / max(size, float2(1.0));
    float across = uv.x + uv.y * 0.6;
    float centerAt = mix(-0.3, 1.3, progress);
    float d = (across - centerAt) / 0.12;
    float band = exp(-d * d);

    float fade = sin(progress * 3.14159265);
    float glint = band * (0.35 + 0.65 * specular) * intensity * fade;
    half3 lit = min(base.rgb + half3(glint) * base.a, half3(base.a));
    return half4(lit, base.a);
}
"""

    /** Onde de frappe : un front circulaire déplace les pixels le long du rayon. */
    public const val STRIKE_WAVE: String = """
uniform shader content;
uniform float2 size;
uniform float2 center;
uniform float progress;
uniform float amplitude;
uniform float wavelength;

half4 main(float2 position) {
    if (progress <= 0.0 || progress >= 1.0) { return content.eval(position); }
    float2 offset = position - center;
    float dist = length(offset);
    float front = progress * length(size) * 0.7;
    float phase = (dist - front) / max(wavelength, 1.0);
    float wave = sin(phase * 6.28318531);
    float e = phase / 1.5;
    float envelope = exp(-e * e) * (1.0 - progress);
    float2 direction = dist > 0.001 ? offset / dist : float2(0.0);
    return content.eval(position + direction * wave * amplitude * envelope);
}
"""

    /** Irisation du prisme : un arc-en-ciel glisse sur les tons clairs selon l'inclinaison. */
    public const val PRISM_IRIDESCENCE: String = """
uniform shader content;
uniform float2 size;
uniform float tilt;
uniform float intensity;

float meeshyLuminance(half4 c) {
    return dot(float3(c.rgb), float3(0.299, 0.587, 0.114));
}

half4 main(float2 position) {
    half4 color = content.eval(position);
    if (color.a < 0.01 || intensity <= 0.0) { return color; }
    float2 uv = position / max(size, float2(1.0));
    float t = uv.x * 0.7 + uv.y * 0.5 + tilt;
    float3 rainbow = 0.5 + 0.5 * cos(6.28318531 * (t + float3(0.0, 0.33, 0.67)));

    half3 straight = color.rgb / max(color.a, 0.001);
    float luma = meeshyLuminance(half4(straight, 1.0));
    float amount = clamp(intensity * (0.35 + 0.65 * luma) * 0.55, 0.0, 1.0);
    half3 mixed = mix(straight, half3(rainbow), half(amount));
    mixed = mix(mixed, mixed * (0.6 + 0.8 * half(luma)), 0.5);
    return half4(clamp(mixed, 0.0, 1.0) * color.a, color.a);
}
"""
}
