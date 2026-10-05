// #9196 — Teint naturel + Peau lissée, en UNE passe Core Image.
//
// Compilé comme noyau Core Image (`-fcikernel` / `-cikernel`, project.yml).
// Entrées : l'image, sa basse fréquence lissée en préservant les bords
// (sous-échantillonnage + CIEdgePreserveUpsampleFilter guidé par l'image) et
// une passe fine (flou de ~1 px) dont la différence avec l'image est la texture
// — pores, grain — que Peau lissée réinjecte au lieu de la gommer.
//
// Le masque de peau n'est pas une image : il est calculé ici, pixel par pixel,
// depuis la géométrie du visage (Vision) inclinée selon la ligne des yeux —
// yeux, sourcils et bouche exclus — multipliée par une vraisemblance de peau en
// chrominance YCbCr, stable d'une carnation à l'autre (Fitzpatrick I–VI). Aucune
// passe de masque, aucune texture intermédiaire.
//
// Règle produit : illuminer n'est pas éclaircir. Teint naturel tire la
// chrominance vers sa moyenne LOCALE (rougeurs, marbrures) et comble les micro-
// ombres vers la luminance locale ; la teinte moyenne de la peau ne bouge pas.

#include <metal_stdlib>
#include <CoreImage/CoreImage.h>
using namespace metal;

static inline float3 meeshyToYCC(float3 c) {
    float y = dot(c, float3(0.299, 0.587, 0.114));
    return float3(y, (c.b - y) * 0.564, (c.r - y) * 0.713);
}

static inline float3 meeshyToRGB(float3 v) {
    return float3(v.x + 1.403 * v.z, v.x - 0.344 * v.y - 0.714 * v.z, v.x + 1.773 * v.y);
}

/// Distance elliptique normalisée (1 = sur le bord) dans le repère du visage,
/// incliné de `rot` = (cos, sin) de l'angle de la ligne des yeux.
static inline float meeshyEllipse(float2 p, float4 e, float2 rot) {
    float2 d = p - e.xy;
    float2 local = float2(d.x * rot.x + d.y * rot.y, -d.x * rot.y + d.y * rot.x);
    return length(local / max(e.zw, float2(1.0)));
}

/// Vraisemblance de peau d'une couleur YCbCr : la chrominance de la peau varie
/// peu d'une carnation à l'autre, la luminance écarte les ombres profondes.
static inline float meeshySkinLikelihood(float3 ycc) {
    float2 chroma = (ycc.yz - float2(-0.085, 0.095)) / float2(0.115, 0.095);
    return (1.0 - smoothstep(0.7, 1.15, length(chroma))) * smoothstep(0.035, 0.11, ycc.x);
}

/// 0 dans l'ellipse, 1 dehors, bord adouci.
static inline float meeshyOutside(float2 p, float4 e, float2 rot) {
    return smoothstep(0.85, 1.25, meeshyEllipse(p, e, rot));
}

extern "C" { namespace coreimage {

/// strength = (teint, lissage, texture réinjectée, cernes), chacun 0…1.
float4 meeshySkinRetouch(sample_t original, sample_t lowPass, sample_t finePass,
                         float4 face, float2 rot,
                         float4 eyeL, float4 eyeR, float4 browL, float4 browR, float4 mouth,
                         float4 underL, float4 underR,
                         float4 strength, destination dest)
{
    float2 p = dest.coord();
    float geometry = 1.0 - smoothstep(0.78, 1.0, meeshyEllipse(p, face, rot));
    if (geometry <= 0.0) { return original; }
    geometry *= meeshyOutside(p, eyeL, rot) * meeshyOutside(p, eyeR, rot);
    geometry *= meeshyOutside(p, browL, rot) * meeshyOutside(p, browR, rot);
    geometry *= meeshyOutside(p, mouth, rot);

    float3 o = meeshyToYCC(original.rgb);
    float3 l = meeshyToYCC(lowPass.rgb);
    float3 f = meeshyToYCC(finePass.rgb);

    // Peau si le pixel ET son voisinage le sont : la basse fréquence ignore le
    // bruit du capteur, le pixel écarte ce qui jouxte la peau (lunettes, mèche).
    float skin = min(meeshySkinLikelihood(l), meeshySkinLikelihood(o));
    float mask = geometry * skin;
    if (mask <= 0.0) { return original; }

    float tone = strength.x * mask;
    float smoothing = strength.y * mask;
    float3 r = o;

    // Teint naturel : chrominance vers la moyenne locale, micro-ombres comblées,
    // reflets gras atténués ; le relevé de luminance plafonne à +4 %.
    r.yz = mix(o.yz, l.yz, 0.45 * tone);
    float lift = min(0.022 * (1.0 - o.x) + 0.35 * max(l.x - o.x, 0.0), 0.04);
    float shine = smoothstep(0.80, 0.97, o.x) * 0.35 * max(o.x - l.x, 0.0);
    r.x = o.x + tone * (lift - shine);

    // Peau lissée : séparation de fréquences, texture fine réinjectée.
    float textured = l.x + (o.x - f.x) * strength.z + (r.x - o.x);
    r.x = mix(r.x, textured, smoothing);
    r.yz = mix(r.yz, l.yz, 0.55 * smoothing);

    // Cernes : léger relevé sous les yeux, sur la peau seulement.
    float under = min(1.0, (1.0 - smoothstep(0.6, 1.0, meeshyEllipse(p, underL, rot)))
                         + (1.0 - smoothstep(0.6, 1.0, meeshyEllipse(p, underR, rot))));
    r.x += strength.w * under * skin * 0.035 * (1.0 - r.x);

    return float4(clamp(meeshyToRGB(r), 0.0, 1.0), original.a);
}

}}
