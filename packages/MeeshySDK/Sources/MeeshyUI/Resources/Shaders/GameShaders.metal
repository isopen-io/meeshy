// Les trois shaders du Jeu Meeshy (#9381) — des briques, pas une chorégraphie.
//
// Chargés par SwiftUI depuis `default.metallib` du module MeeshyUI
// (`ShaderLibrary.bundle(.module)`), appliqués par `GameShaders.swift`
// (`.layerEffect`, `.distortionEffect`, `.colorEffect`, iOS 17+). Sous iOS 16 les
// mêmes modificateurs retombent sur un dégradé animé : ce fichier n'y est pas lu.
//
// Chacun est PUR : même entrée, même sortie. Le temps, l'inclinaison de
// l'appareil et le centre de l'onde viennent de l'hôte en paramètres.

#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

static inline float meeshyLuminance(half4 c) {
    return dot(float3(c.rgb), float3(0.299, 0.587, 0.114));
}

// MARK: - Reflet spéculaire (layerEffect)
//
// Une bande de lumière traverse le calque en diagonale. Elle n'éclaire pas à
// plat : le relief est DÉDUIT de la luminance du calque (quatre échantillons
// voisins, un gradient), puis la lumière d'un point fixe se reflète sur ce
// relief — un trait gravé accroche autrement que l'aplat qui l'entoure.
//
// size      taille du calque, en points
// progress  0 → 1, la position de la bande (l'hôte l'anime ; hors de ]0, 1[ rien)
// intensity 0 → 1
[[ stitchable ]] half4 meeshySpecularSheen(float2 position, SwiftUI::Layer layer,
                                           float2 size, float progress, float intensity) {
    half4 base = layer.sample(position);
    if (base.a < 0.01h || progress <= 0.0 || progress >= 1.0) { return base; }

    const float step = 1.5;
    float left = meeshyLuminance(layer.sample(position - float2(step, 0.0)));
    float right = meeshyLuminance(layer.sample(position + float2(step, 0.0)));
    float up = meeshyLuminance(layer.sample(position - float2(0.0, step)));
    float down = meeshyLuminance(layer.sample(position + float2(0.0, step)));
    float3 normal = normalize(float3((left - right) * 3.0, (up - down) * 3.0, 1.0));

    float3 toLight = normalize(float3(-0.5, -0.6, 0.65));
    float3 halfway = normalize(toLight + float3(0.0, 0.0, 1.0));
    float specular = pow(max(dot(normal, halfway), 0.0), 24.0);

    float2 uv = position / max(size, float2(1.0));
    float across = uv.x + uv.y * 0.6;
    float center = mix(-0.3, 1.3, progress);
    float band = exp(-pow((across - center) / 0.12, 2.0));

    float fade = sin(progress * 3.14159265);
    float glint = band * (0.35 + 0.65 * specular) * intensity * fade;
    half3 lit = min(base.rgb + half3(glint) * base.a, half3(base.a));
    return half4(lit, base.a);
}

// MARK: - Onde de frappe (distortionEffect)
//
// Un front circulaire part de `center` et s'éloigne ; les pixels sont déplacés
// le long du rayon par une sinusoïde enveloppée — la pièce frémit quand elle est
// frappée. L'onde s'éteint avant la fin (1 - progress) : elle ne laisse rien.
//
// size        taille du calque, en points
// center      point d'impact, en points
// progress    0 → 1 (hors de ]0, 1[ rien)
// amplitude   déplacement maximal, en points (= maxSampleOffset côté Swift)
// wavelength  longueur d'onde, en points
[[ stitchable ]] float2 meeshyStrikeWave(float2 position, float2 size, float2 center,
                                         float progress, float amplitude, float wavelength) {
    if (progress <= 0.0 || progress >= 1.0) { return position; }
    float2 offset = position - center;
    float distance = length(offset);
    float front = progress * length(size) * 0.7;
    float phase = (distance - front) / max(wavelength, 1.0);
    float wave = sin(phase * 6.28318531);
    float envelope = exp(-pow(phase / 1.5, 2.0)) * (1.0 - progress);
    float2 direction = distance > 0.001 ? offset / distance : float2(0.0);
    return position + direction * wave * amplitude * envelope;
}

// MARK: - Irisation du prisme (colorEffect)
//
// Un arc-en-ciel glisse sur la matière selon l'INCLINAISON fournie par l'hôte
// (CoreMotion côté app). Il se mêle surtout aux tons clairs, et le relief de
// l'original est conservé : l'irisation colore, elle n'aplatit pas.
//
// size       taille du calque, en points
// tilt       l'inclinaison, en tours (l'hôte le borne ; 0 = au repos)
// intensity  0 → 1
[[ stitchable ]] half4 meeshyPrismIridescence(float2 position, half4 color, float2 size,
                                              float tilt, float intensity) {
    if (color.a < 0.01h || intensity <= 0.0) { return color; }
    float2 uv = position / max(size, float2(1.0));
    float t = uv.x * 0.7 + uv.y * 0.5 + tilt;
    float3 rainbow = 0.5 + 0.5 * cos(6.28318531 * (t + float3(0.0, 0.33, 0.67)));

    half3 straight = color.rgb / max(color.a, 0.001h);
    float luma = meeshyLuminance(half4(straight, 1.0h));
    float amount = clamp(intensity * (0.35 + 0.65 * luma) * 0.55, 0.0, 1.0);
    half3 mixed = mix(straight, half3(rainbow), half(amount));
    mixed = mix(mixed, mixed * (0.6h + 0.8h * half(luma)), 0.5h);
    return half4(clamp(mixed, 0.0h, 1.0h) * color.a, color.a);
}
