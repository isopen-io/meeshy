package me.meeshy.sdk.model.scene

import kotlin.math.abs
import kotlin.math.pow
import me.meeshy.sdk.model.AdjustmentKind as WireKind
import me.meeshy.sdk.model.ImageAdjustments as WireAdjustments
import me.meeshy.sdk.model.imageedit.AdjustmentKind as EditKind
import me.meeshy.sdk.model.imageedit.ImageAdjustments as EditAdjustments

/**
 * Les onze réglages d'un look, en valeurs nues : la forme UNIQUE que la chaîne de rendu lit,
 * qu'ils viennent du fil d'une story ([WireAdjustments]) ou de l'état d'un éditeur
 * ([EditAdjustments]). Miroir de `ImageAdjustmentStage` (iOS) : mêmes bornes, mêmes neutres.
 */
data class SceneLookParams(
    val exposure: Float = 0f,
    val brightness: Float = 0f,
    val contrast: Float = 1f,
    val saturation: Float = 1f,
    val vibrance: Float = 0f,
    val temperature: Float = 0f,
    val sharpness: Float = 0f,
    val blur: Float = 0f,
    val vignette: Float = 0f,
    val bloom: Float = 0f,
    val grain: Float = 0f,
) {
    val isNeutral: Boolean
        get() = abs(exposure) <= EPS && abs(brightness) <= EPS && abs(contrast - 1f) <= EPS &&
            abs(saturation - 1f) <= EPS && abs(vibrance) <= EPS && abs(temperature) <= EPS &&
            sharpness <= EPS && blur <= EPS && vignette <= EPS && bloom <= EPS && grain <= EPS

    /** Ce qu'une VIDÉO peint : ni netteté, ni flou, ni bloom, ni grain (iOS #9169 / #9498). */
    fun servedForVideo(): SceneLookParams = copy(sharpness = 0f, blur = 0f, bloom = 0f, grain = 0f)

    /** Signature déterministe des valeurs, jamais `hashCode` : clé de cache qui ne collisionne pas. */
    fun signature(): String = listOf(
        exposure, brightness, contrast, saturation, vibrance, temperature,
        sharpness, blur, vignette, bloom, grain,
    ).joinToString(",")

    companion object {
        const val EPS: Float = 0.001f
        val NEUTRAL: SceneLookParams = SceneLookParams()

        fun from(adjustments: WireAdjustments?): SceneLookParams {
            if (adjustments == null) return NEUTRAL
            return SceneLookParams(
                exposure = adjustments[WireKind.EXPOSURE],
                brightness = adjustments[WireKind.BRIGHTNESS],
                contrast = adjustments[WireKind.CONTRAST],
                saturation = adjustments[WireKind.SATURATION],
                vibrance = adjustments[WireKind.VIBRANCE],
                temperature = adjustments[WireKind.TEMPERATURE],
                sharpness = adjustments[WireKind.SHARPNESS],
                blur = adjustments[WireKind.BLUR],
                vignette = adjustments[WireKind.VIGNETTE],
                bloom = adjustments[WireKind.BLOOM],
                grain = adjustments[WireKind.GRAIN],
            )
        }

        fun from(adjustments: EditAdjustments): SceneLookParams = SceneLookParams(
            exposure = adjustments[EditKind.EXPOSURE],
            brightness = adjustments[EditKind.BRIGHTNESS],
            contrast = adjustments[EditKind.CONTRAST],
            saturation = adjustments[EditKind.SATURATION],
            vibrance = adjustments[EditKind.VIBRANCE],
            temperature = adjustments[EditKind.TEMPERATURE],
            sharpness = adjustments[EditKind.SHARPNESS],
            blur = adjustments[EditKind.BLUR],
            vignette = adjustments[EditKind.VIGNETTE],
            bloom = adjustments[EditKind.BLOOM],
            grain = adjustments[EditKind.GRAIN],
        )
    }
}

/** Gains par canal, appliqués en lumière LINÉAIRE. */
data class LinearGains(val r: Float, val g: Float, val b: Float) {
    val isUnit: Boolean get() = abs(r - 1f) < 1e-4f && abs(g - 1f) < 1e-4f && abs(b - 1f) < 1e-4f

    companion object {
        val UNIT: LinearGains = LinearGains(1f, 1f, 1f)
    }
}

/**
 * Les mathématiques de couleur du look, pures : contrôles de couleur de Core Image, gains
 * d'exposition et de température en lumière linéaire, et la composition d'une chaîne
 * « filtre puis réglages » en UNE matrice 4×5 (jamais deux rendus successifs).
 */
object SceneLookMatrix {
    private const val LUMA_R = 0.2125f
    private const val LUMA_G = 0.7154f
    private const val LUMA_B = 0.0721f

    /** Kelvin de référence de `CITemperatureAndTint` et pleine course du curseur (iOS : 6500 ± 1800). */
    const val NEUTRAL_KELVIN: Float = 6500f
    const val KELVIN_PER_UNIT: Float = 1800f

    /** `CIExposureAdjust` : le gain linéaire d'un cran de [ev] (2^EV). */
    fun exposureGain(ev: Float): Float = 2f.pow(ev)

    /** Gains linéaires d'une température de curseur [t] (−1 froid … +1 chaud), luminance conservée. */
    fun temperatureGains(t: Float): LinearGains = kelvinGains(NEUTRAL_KELVIN + t * KELVIN_PER_UNIT)

    /** Idem pour une cible en kelvin (les filtres Chaud 7800 K et Froid 5200 K d'iOS). */
    fun kelvinGains(targetKelvin: Float): LinearGains {
        if (abs(targetKelvin - NEUTRAL_KELVIN) < 1f) return LinearGains.UNIT
        val neutral = whitePoint(NEUTRAL_KELVIN)
        val target = whitePoint(targetKelvin)
        val r = neutral[0] / target[0]
        val g = neutral[1] / target[1]
        val b = neutral[2] / target[2]
        val luma = LUMA_R * r + LUMA_G * g + LUMA_B * b
        return LinearGains(r / luma, g / luma, b / luma)
    }

    /** Point blanc d'un corps noir, en RGB LINÉAIRE (approximation de Tanner Helland). */
    private fun whitePoint(kelvin: Float): FloatArray {
        val t = (kelvin / 100f).coerceIn(10f, 400f)
        val red = if (t <= 66f) 255f else 329.698727446f * (t - 60f).pow(-0.1332047592f)
        val green = if (t <= 66f) {
            99.4708025861f * kotlin.math.ln(t) - 161.1195681661f
        } else {
            288.1221695283f * (t - 60f).pow(-0.0755148492f)
        }
        val blue = when {
            t >= 66f -> 255f
            t <= 19f -> 0f
            else -> 138.5177312231f * kotlin.math.ln(t - 10f) - 305.0447927307f
        }
        return floatArrayOf(toLinear(red), toLinear(green), toLinear(blue))
            .map { it.coerceAtLeast(0.01f) }.toFloatArray()
    }

    private fun toLinear(channel255: Float): Float {
        val c = (channel255 / 255f).coerceIn(0f, 1f)
        return if (c <= 0.04045f) c / 12.92f else ((c + 0.055f) / 1.055f).pow(2.4f)
    }

    /**
     * `CIColorControls` en matrice 4×5 sur 0..255 : saturation autour de la luma, contraste autour
     * du gris moyen, puis luminosité additive.
     */
    fun colorControls(brightness: Float, contrast: Float, saturation: Float): StoryColorMatrix {
        val s = saturation
        val offset = (0.5f * (1f - contrast) + brightness) * 255f
        val rows = listOf(
            floatArrayOf(LUMA_R * (1 - s) + s, LUMA_G * (1 - s), LUMA_B * (1 - s)),
            floatArrayOf(LUMA_R * (1 - s), LUMA_G * (1 - s) + s, LUMA_B * (1 - s)),
            floatArrayOf(LUMA_R * (1 - s), LUMA_G * (1 - s), LUMA_B * (1 - s) + s),
        )
        val values = ArrayList<Float>(StoryColorMatrix.COMPONENTS)
        rows.forEach { row ->
            row.forEach { values.add(it * contrast) }
            values.add(0f)
            values.add(offset)
        }
        values.addAll(listOf(0f, 0f, 0f, 1f, 0f))
        return StoryColorMatrix(values)
    }

    /** Matrice diagonale de gains par canal. */
    fun gain(r: Float, g: Float, b: Float): StoryColorMatrix = StoryColorMatrix(
        listOf(
            r, 0f, 0f, 0f, 0f,
            0f, g, 0f, 0f, 0f,
            0f, 0f, b, 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        ),
    )

    /** `then` appliquée APRÈS `first` : le produit matriciel 4×5 (colonne d'offset incluse). */
    fun compose(first: StoryColorMatrix, then: StoryColorMatrix): StoryColorMatrix {
        val a = then.values
        val b = first.values
        val out = FloatArray(StoryColorMatrix.COMPONENTS)
        for (row in 0 until 4) {
            for (col in 0 until 5) {
                var sum = 0f
                for (k in 0 until 4) sum += a[row * 5 + k] * b[k * 5 + col]
                if (col == 4) sum += a[row * 5 + 4]
                out[row * 5 + col] = sum
            }
        }
        return StoryColorMatrix(out.toList())
    }

    /**
     * La chaîne colorimétrique d'un look en UNE matrice : filtre, puis exposition, contrôles de
     * couleur, vibrance, température. Exposition et température y sont portées en gains
     * d'espace encodé (gamma 2,2) — c'est la forme d'AFFICHAGE d'un `ColorFilter` ; le rendu cuit
     * ([SceneLookPixels]) les calcule, lui, en lumière linéaire.
     */
    fun composed(recipe: SceneLookRecipe): StoryColorMatrix {
        val p = recipe.params
        var matrix = recipe.filterMatrix
        if (recipe.filterTemperatureKelvin != NEUTRAL_KELVIN) {
            matrix = compose(matrix, encodedGain(kelvinGains(recipe.filterTemperatureKelvin)))
        }
        if (abs(p.exposure) > SceneLookParams.EPS) {
            val g = exposureGain(p.exposure)
            matrix = compose(matrix, encodedGain(LinearGains(g, g, g)))
        }
        val effectiveSaturation = (p.saturation * (1f + 0.5f * p.vibrance)).coerceAtLeast(0f)
        matrix = compose(matrix, colorControls(p.brightness, p.contrast, effectiveSaturation))
        if (abs(p.temperature) > SceneLookParams.EPS) {
            matrix = compose(matrix, encodedGain(temperatureGains(p.temperature)))
        }
        return matrix
    }

    private fun encodedGain(g: LinearGains): StoryColorMatrix {
        val inv = 1f / 2.2f
        return gain(g.r.pow(inv), g.g.pow(inv), g.b.pow(inv))
    }
}
