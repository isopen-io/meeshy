// La combustion d'un éphémère (#17938) — UN shader de calque, toute la scène.
//
// Chargé par SwiftUI depuis `default.metallib` du module MeeshyUI
// (`ShaderLibrary.bundle(.module)`), appliqué par `EphemeralBurnEffect` en
// `.layerEffect` (iOS 17+) sur le calque AGRANDI de la bulle : des marges
// transparentes (`overhang`) lui sont posées avant l'effet pour que flammes et
// étincelles sortent de la bulle, puis retirées après pour que la mise en page
// ne bouge pas. Sous iOS 16 et sous « Réduire les animations » ce fichier
// n'est pas lu.
//
// Le shader est PUR : le temps (`progress`), le sens du front
// (`frontDirection`, figé à l'allumage), la dérive du vent (`drift`, suivie en
// direct) et la graine viennent de l'hôte. Il ne garde aucun état : les
// étincelles sont des fonctions de (graine, indice, temps), pas des particules.
//
// Ce qu'il peint, dans l'ordre où l'œil le lit :
//   1. le FRONT — une ligne de bruit à l'échelle d'une lettre avance depuis le
//      bord D'OÙ vient le vent ; derrière lui, plus rien ; sur lui, une lisière
//      de charbon puis de braise (orange → jaune) ;
//   2. la CHALEUR — près du front, le calque ondule vers le haut et sous le vent ;
//   3. les FLAMMES — au-dessus de la braise, un bruit qui monte et se couche
//      dans le vent ;
//   4. les ÉTINCELLES — vingt points nés sur le front, emportés par le vent,
//      freinés par la gravité, qui s'éteignent ;
//   5. les CENDRES — passé 0,8, ce qui reste grisonne, dérive et s'efface.
//
// size            taille du calque agrandi, en points
// progress        0 → 1 (hors de ]0, 1[ : 0 rend le calque intact, 1 rien)
// frontDirection  +1 : le feu part du bord gauche vers la droite ; −1 l'inverse
// drift           −1 → 1, le vent effectif (+ vers la droite)
// seed            0 → 1, la graine du bruit et des étincelles
// overhang        (horizontal, haut) : les marges ajoutées au calque, en points

#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

static inline float burnHash21(float2 p) {
    p = fract(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

static inline float burnHash11(float n) {
    return fract(sin(n * 127.1) * 43758.5453);
}

static inline float burnValueNoise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);
    float a = burnHash21(i);
    float b = burnHash21(i + float2(1.0, 0.0));
    float c = burnHash21(i + float2(0.0, 1.0));
    float d = burnHash21(i + float2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Trois octaves, ramenées dans [0, 1].
static inline float burnFbm(float2 p) {
    float v = 0.5 * burnValueNoise(p);
    v += 0.25 * burnValueNoise(p * 2.03 + 17.1);
    v += 0.125 * burnValueNoise(p * 4.11 + 31.7);
    return v / 0.875;
}

// La position du front dans l'axe de la brûlure : −0,25 avant l'ignition
// (rien ne brûle), 1,35 à 85 % (tout est passé), puis les cendres.
static inline float burnFront(float progress) {
    return mix(-0.25, 1.35, smoothstep(0.0, 0.85, progress));
}

// La valeur de brûlure d'un point du calque : > 0,08 parti, ]0, 0,08] charbon,
// ]−0,10, 0] braise, sinon intact.
static inline float burnValue(float2 position, float2 contentOrigin, float2 contentSize,
                              float frontDirection, float front, float seed) {
    float2 c = (position - contentOrigin) / contentSize;
    float a = frontDirection > 0.0 ? c.x : 1.0 - c.x;
    const float cell = 14.0;
    float n = burnFbm(position / cell + seed * 37.0);
    return front - a - (n - 0.5) * 0.45;
}

[[ stitchable ]] half4 meeshyEphemeralBurn(float2 position, SwiftUI::Layer layer,
                                           float2 size, float progress, float frontDirection,
                                           float drift, float seed, float2 overhang) {
    if (progress <= 0.0) { return layer.sample(position); }
    if (progress >= 1.0) { return half4(0.0h); }

    float2 contentOrigin = float2(overhang.x, overhang.y);
    float2 contentSize = max(size - float2(2.0 * overhang.x, overhang.y), float2(1.0));
    float front = burnFront(progress);
    float ash = clamp((progress - 0.8) / 0.2, 0.0, 1.0);

    // 1. Le front, lu au point tel qu'il sera échantillonné.
    float b = burnValue(position, contentOrigin, contentSize, frontDirection, front, seed);

    // 2. La chaleur déforme le calque près du front ; les cendres dérivent.
    float heat = exp(-b * b / 0.01);
    float2 warped = position - float2(drift, -1.0) * 6.0 * heat - float2(drift * 12.0 * ash, 0.0);
    half4 src = layer.sample(warped);

    half4 color = src;
    if (b > 0.08) {
        color = half4(0.0h);
    } else if (b > 0.0) {
        float k = b / 0.08;
        half thinning = half(1.0 - k * 0.6);
        color = half4(half3(0.08h, 0.04h, 0.02h) * src.a, src.a) * thinning;
    } else if (b > -0.10) {
        float k = (b + 0.10) / 0.10;
        half3 ember = mix(half3(1.0h, 0.35h, 0.05h), half3(1.0h, 0.9h, 0.4h), half(k * k));
        half glow = half(k) * src.a;
        color = half4(min(src.rgb + ember * glow, half3(1.0h)), src.a);
    }

    // 3. Les flammes : au-dessus d'une braise, un bruit qui monte et se couche.
    float flame = 0.0;
    const float steps[3] = { 8.0, 16.0, 28.0 };
    for (int s = 0; s < 3; s++) {
        float2 below = position + float2(-drift * steps[s] * 0.6, steps[s]);
        float bb = burnValue(below, contentOrigin, contentSize, frontDirection, front, seed);
        half belowAlpha = layer.sample(below).a;
        if (bb > -0.10 && bb < 0.06 && belowAlpha > 0.05h) {
            float lick = burnFbm(position / 10.0 + float2(-drift * 4.0, progress * 18.0 + seed * 11.0));
            flame = max(flame, smoothstep(0.45, 0.8, lick) * (1.0 - steps[s] / 40.0));
        }
    }
    if (flame > 0.0) {
        float f = flame * (1.0 - ash);
        half3 flameColor = mix(half3(1.0h, 0.3h, 0.05h), half3(1.0h, 0.85h, 0.35h), half(f));
        color += half4(flameColor * half(f), half(f));
    }

    // 4. Les étincelles : nées sur le front, emportées par le vent, freinées, éteintes.
    for (int i = 0; i < 20; i++) {
        float fi = float(i);
        float h1 = burnHash11(seed * 91.7 + fi * 13.1);
        float h2 = burnHash11(seed * 53.3 + fi * 7.9);
        float h3 = burnHash11(seed * 29.1 + fi * 3.3);
        float t0 = mix(0.1, 0.75, h1);
        float age = (progress - t0) / 0.35;
        if (age <= 0.0 || age >= 1.0) { continue; }
        float ax = clamp(burnFront(t0), 0.0, 1.0);
        float ox = frontDirection > 0.0 ? ax : 1.0 - ax;
        float2 origin = contentOrigin + float2(ox, h2) * contentSize;
        float life = age * 0.35 * 1.2;
        float2 velocity = float2(drift * 60.0 + (h3 - 0.5) * 40.0, -90.0 - h2 * 30.0);
        float2 p = origin + velocity * life + float2(0.0, 40.0) * life * life;
        float2 d = position - p;
        float glow = exp(-dot(d, d) / 9.0) * (1.0 - age);
        half3 sparkColor = mix(half3(1.0h, 0.9h, 0.4h), half3(1.0h, 0.3h, 0.05h), half(age));
        color += half4(sparkColor * half(glow), half(glow));
    }

    // 5. Les cendres : ce qui reste grisonne et s'efface.
    if (ash > 0.0) {
        half luma = dot(color.rgb, half3(0.299h, 0.587h, 0.114h));
        half3 gray = half3(luma) * 0.8h;
        color.rgb = mix(color.rgb, gray, half(ash));
        color *= half(1.0 - ash);
    }

    color = clamp(color, 0.0h, 1.0h);
    color.rgb = min(color.rgb, half3(color.a));
    return color;
}
