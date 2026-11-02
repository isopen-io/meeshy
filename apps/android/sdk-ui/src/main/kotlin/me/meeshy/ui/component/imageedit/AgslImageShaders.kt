package me.meeshy.ui.component.imageedit

import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi
import kotlin.math.max
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookPixels
import me.meeshy.sdk.model.scene.SceneLookRecipe

/**
 * Le rendu EN DIRECT sur GPU (AGSL, API 33+) d'un look : la chaîne colorimétrique en un seul
 * shader (filtre, exposition et température en lumière linéaire, contrôles de couleur, vibrance,
 * vignette, grain) puis le flou en effet de rendu. Sous l'API 33, [ColorMatrixFallback] sert la
 * couleur et la cuisson. Netteté et bloom, étages multi-passes, se cuisent au relâchement du
 * curseur ([ColorMatrixFallback]) ; l'export est toujours cuit en pleine résolution.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
public object AgslImageShaders {
    public const val COLOR_CHAIN: String = """
uniform shader image;
uniform float2 size;
uniform half4 filterRow0;
uniform half4 filterRow1;
uniform half4 filterRow2;
uniform half3 filterGain;
uniform half exposure;
uniform half4 controlsRow0;
uniform half4 controlsRow1;
uniform half4 controlsRow2;
uniform half vibrance;
uniform half3 tempGain;
uniform half vignette;
uniform half grainAlpha;

half3 toLinear(half3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, half3(2.4)), step(half3(0.04045), c));
}

half3 toEncoded(half3 l) {
    l = clamp(l, half3(0.0), half3(1.0));
    return mix(l * 12.92, 1.055 * pow(l, half3(1.0 / 2.4)) - 0.055, step(half3(0.0031308), l));
}

half3 mat3x(half3 c, half4 r0, half4 r1, half4 r2) {
    return clamp(half3(dot(r0.xyz, c) + r0.w, dot(r1.xyz, c) + r1.w, dot(r2.xyz, c) + r2.w), half3(0.0), half3(1.0));
}

half4 main(float2 coord) {
    half4 px = image.eval(coord);
    half3 rgb = px.a > 0.0 ? px.rgb / px.a : px.rgb;
    rgb = toEncoded(toLinear(rgb) * filterGain);
    rgb = mat3x(rgb, filterRow0, filterRow1, filterRow2);
    rgb = toEncoded(toLinear(rgb) * exposure);
    rgb = mat3x(rgb, controlsRow0, controlsRow1, controlsRow2);
    half avg = (rgb.r + rgb.g + rgb.b) / 3.0;
    half sat = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
    rgb = clamp(rgb + (rgb - half3(avg)) * (vibrance * (1.0 - sat)), half3(0.0), half3(1.0));
    rgb = toEncoded(toLinear(rgb) * tempGain);
    float2 centre = size * 0.5;
    half d = half(length(coord - centre) / max(length(centre), 1.0));
    half t = clamp((d - 0.3) / 0.7, 0.0, 1.0);
    rgb *= 1.0 - clamp(vignette * 0.5 * t * t, 0.0, 1.0);
    half n = half(fract(sin(dot(coord, float2(12.9898, 78.233))) * 43758.5453));
    rgb *= 1.0 - grainAlpha * n;
    return half4(rgb * px.a, px.a);
}
"""

    /**
     * L'effet de rendu d'une recette pour une vue de [widthPx] × [heightPx] ; `null` quand la
     * recette est neutre (aucun effet posé, aucun coût).
     */
    public fun effect(recipe: SceneLookRecipe, widthPx: Float, heightPx: Float): RenderEffect? {
        if (recipe.isNeutral) return null
        val shader = RuntimeShader(COLOR_CHAIN)
        configure(shader, recipe, widthPx, heightPx)
        val color = RenderEffect.createRuntimeShaderEffect(shader, "image")
        val blurSigma = blurSigma(recipe)
        if (blurSigma <= 0.5f) return color
        val blur = RenderEffect.createBlurEffect(blurSigma, blurSigma, Shader.TileMode.CLAMP)
        return RenderEffect.createChainEffect(blur, color)
    }

    private fun blurSigma(recipe: SceneLookRecipe): Float {
        val fromAdjustments = recipe.params.blur * 16f
        val fromEffect = if (recipe.effect == ImageEffect.BLUR) 8f else 0f
        return max(fromAdjustments, fromEffect)
    }

    private fun configure(shader: RuntimeShader, recipe: SceneLookRecipe, widthPx: Float, heightPx: Float) {
        val p = recipe.params
        shader.setFloatUniform("size", max(widthPx, 1f), max(heightPx, 1f))
        val filter = recipe.filterMatrix.values
        row(shader, "filterRow", filter)
        val filterGains = SceneLookMatrix.kelvinGains(recipe.filterTemperatureKelvin)
        shader.setFloatUniform("filterGain", filterGains.r, filterGains.g, filterGains.b)
        shader.setFloatUniform("exposure", SceneLookMatrix.exposureGain(p.exposure))
        val controls = SceneLookMatrix.colorControls(p.brightness, p.contrast, p.saturation).values
        row(shader, "controlsRow", controls)
        shader.setFloatUniform("vibrance", p.vibrance)
        val temperature = SceneLookMatrix.temperatureGains(p.temperature)
        shader.setFloatUniform("tempGain", temperature.r, temperature.g, temperature.b)
        val vignette = max(recipe.filterVignette, 0f) + p.vignette +
            if (recipe.effect == ImageEffect.VIGNETTE) 2f else 0f
        shader.setFloatUniform("vignette", vignette)
        val grain = p.grain + if (recipe.effect == ImageEffect.GRAIN) SceneLookPixels.PRESET_AMOUNT else 0f
        shader.setFloatUniform("grainAlpha", grain * SceneLookPixels.GRAIN_ALPHA_PER_UNIT)
    }

    private fun row(shader: RuntimeShader, prefix: String, v: List<Float>) {
        for (i in 0 until 3) {
            shader.setFloatUniform("$prefix$i", v[i * 5], v[i * 5 + 1], v[i * 5 + 2], v[i * 5 + 4] / 255f)
        }
    }
}
