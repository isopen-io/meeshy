package me.meeshy.sdk.model.scene

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt
import me.meeshy.sdk.model.imageedit.ImageEffect

/**
 * Le rendu de couleur d'une [SceneLookRecipe] sur des pixels ARGB_8888 (non prémultipliés ou
 * opaques) : le repli sous l'API 33 et la référence que les tests rejouent sur la JVM. UN passage
 * par pixel pour toute la chaîne colorimétrique, puis les étages spatiaux (netteté, flou, vignette,
 * bloom, grain, effet). Exposition et température se calculent en lumière LINÉAIRE, comme iOS.
 */
object SceneLookPixels {
    /** Rayon du bloom, en pixels de la pleine résolution (iOS : 10). */
    const val BLOOM_RADIUS: Float = 10f

    /** Alpha du grain à pleine course (iOS : 0,1). */
    const val GRAIN_ALPHA_PER_UNIT: Float = 0.1f

    /** La mi-course d'un effet en un toucher (iOS : 0,5). */
    const val PRESET_AMOUNT: Float = 0.5f

    private const val EFFECT_BLUR_RADIUS = 8f
    private const val EFFECT_VIGNETTE = 2f
    private const val EFFECT_SHARPEN = 0.8f
    private const val BLUR_RADIUS_PER_UNIT = 16f
    private const val SHARPEN_RADIUS = 1.7f

    private val toLinearLut = FloatArray(256) { i ->
        val c = i / 255f
        if (c <= 0.04045f) c / 12.92f else ((c + 0.055f) / 1.055f).pow(2.4f)
    }

    private fun toEncoded(linear: Float): Float {
        val l = linear.coerceIn(0f, 1f)
        return if (l <= 0.0031308f) l * 12.92f else 1.055f * l.pow(1f / 2.4f) - 0.055f
    }

    /**
     * Rend [recipe] sur [argb] (largeur [width], hauteur [height]) et rend un NOUVEAU tableau ;
     * l'entrée n'est jamais modifiée. [radiusScale] ramène les rayons en pixels de la pleine
     * résolution à ceux de la copie réduite d'un aperçu (1 en pleine résolution).
     */
    fun render(
        argb: IntArray,
        width: Int,
        height: Int,
        recipe: SceneLookRecipe,
        radiusScale: Float = 1f,
    ): IntArray {
        require(argb.size >= width * height) { "tampon trop petit pour ${width}x$height" }
        if (recipe.isNeutral || width <= 0 || height <= 0) return argb.copyOf()
        var pixels = colorStage(argb, width * height, recipe)
        val p = recipe.params
        val scale = radiusScale.coerceAtLeast(0.01f)
        if (p.sharpness > SceneLookParams.EPS) pixels = sharpen(pixels, width, height, p.sharpness, scale)
        if (p.blur > SceneLookParams.EPS) pixels = gaussian(pixels, width, height, p.blur * BLUR_RADIUS_PER_UNIT * scale)
        if (recipe.filterVignette > SceneLookParams.EPS) pixels = vignette(pixels, width, height, recipe.filterVignette)
        if (p.vignette > SceneLookParams.EPS) pixels = vignette(pixels, width, height, p.vignette)
        if (p.bloom > SceneLookParams.EPS) pixels = bloom(pixels, width, height, p.bloom, scale)
        if (p.grain > SceneLookParams.EPS) pixels = grain(pixels, width, height, p.grain)
        return effectStage(pixels, width, height, recipe.effect, scale)
    }

    private fun effectStage(src: IntArray, w: Int, h: Int, effect: ImageEffect, scale: Float): IntArray = when (effect) {
        ImageEffect.NONE -> src
        ImageEffect.BLUR -> gaussian(src, w, h, EFFECT_BLUR_RADIUS * scale)
        ImageEffect.VIGNETTE -> vignette(src, w, h, EFFECT_VIGNETTE)
        ImageEffect.SHARPEN -> sharpen(src, w, h, EFFECT_SHARPEN, scale)
        ImageEffect.BLOOM -> bloom(src, w, h, PRESET_AMOUNT, scale)
        ImageEffect.GRAIN -> grain(src, w, h, PRESET_AMOUNT)
    }

    // region étage colorimétrique, un passage par pixel

    private fun colorStage(src: IntArray, count: Int, recipe: SceneLookRecipe): IntArray {
        val p = recipe.params
        val filter = recipe.filterMatrix.values
        val hasFilter = recipe.filterMatrix != StoryColorMatrix.IDENTITY
        val filterGains = SceneLookMatrix.kelvinGains(recipe.filterTemperatureKelvin)
        val exposure = if (abs(p.exposure) > SceneLookParams.EPS) SceneLookMatrix.exposureGain(p.exposure) else 1f
        val controls = if (
            abs(p.brightness) > SceneLookParams.EPS || abs(p.contrast - 1f) > SceneLookParams.EPS ||
            abs(p.saturation - 1f) > SceneLookParams.EPS
        ) {
            SceneLookMatrix.colorControls(p.brightness, p.contrast, p.saturation).values
        } else {
            null
        }
        val temperature = SceneLookMatrix.temperatureGains(p.temperature)
        val vibrance = p.vibrance
        val out = IntArray(count)
        for (i in 0 until count) {
            val px = src[i]
            var r = ((px shr 16) and 0xFF) / 255f
            var g = ((px shr 8) and 0xFF) / 255f
            var b = (px and 0xFF) / 255f
            if (!filterGains.isUnit) {
                val lin = linearGain(r, g, b, filterGains.r, filterGains.g, filterGains.b)
                r = lin[0]; g = lin[1]; b = lin[2]
            }
            if (hasFilter) {
                val nr = filter[0] * r + filter[1] * g + filter[2] * b + filter[4] / 255f
                val ng = filter[5] * r + filter[6] * g + filter[7] * b + filter[9] / 255f
                val nb = filter[10] * r + filter[11] * g + filter[12] * b + filter[14] / 255f
                r = nr.coerceIn(0f, 1f); g = ng.coerceIn(0f, 1f); b = nb.coerceIn(0f, 1f)
            }
            if (exposure != 1f) {
                val lin = linearGain(r, g, b, exposure, exposure, exposure)
                r = lin[0]; g = lin[1]; b = lin[2]
            }
            if (controls != null) {
                val nr = controls[0] * r + controls[1] * g + controls[2] * b + controls[4] / 255f
                val ng = controls[5] * r + controls[6] * g + controls[7] * b + controls[9] / 255f
                val nb = controls[10] * r + controls[11] * g + controls[12] * b + controls[14] / 255f
                r = nr.coerceIn(0f, 1f); g = ng.coerceIn(0f, 1f); b = nb.coerceIn(0f, 1f)
            }
            if (abs(vibrance) > SceneLookParams.EPS) {
                val avg = (r + g + b) / 3f
                val sat = max(r, max(g, b)) - min(r, min(g, b))
                val k = vibrance * (1f - sat)
                r = (r + (r - avg) * k).coerceIn(0f, 1f)
                g = (g + (g - avg) * k).coerceIn(0f, 1f)
                b = (b + (b - avg) * k).coerceIn(0f, 1f)
            }
            if (!temperature.isUnit) {
                val lin = linearGain(r, g, b, temperature.r, temperature.g, temperature.b)
                r = lin[0]; g = lin[1]; b = lin[2]
            }
            out[i] = (px and 0xFF000000.toInt()) or (to255(r) shl 16) or (to255(g) shl 8) or to255(b)
        }
        return out
    }

    private fun linearGain(r: Float, g: Float, b: Float, gr: Float, gg: Float, gb: Float): FloatArray {
        val lr = toLinearLut[to255(r)] * gr
        val lg = toLinearLut[to255(g)] * gg
        val lb = toLinearLut[to255(b)] * gb
        return floatArrayOf(toEncoded(lr), toEncoded(lg), toEncoded(lb))
    }

    private fun to255(v: Float): Int = (v * 255f).roundToInt().coerceIn(0, 255)

    // endregion

    // region étages spatiaux

    private fun sharpen(src: IntArray, w: Int, h: Int, amount: Float, scale: Float): IntArray {
        val blurred = gaussian(src, w, h, SHARPEN_RADIUS * scale)
        val strength = amount * 1.5f
        return IntArray(src.size) { i ->
            val a = src[i]
            val b = blurred[i]
            val lumaA = luma(a)
            val delta = (lumaA - luma(b)) * strength
            (a and 0xFF000000.toInt()) or
                (clampAdd(a shr 16, delta) shl 16) or (clampAdd(a shr 8, delta) shl 8) or clampAdd(a, delta)
        }
    }

    private fun luma(px: Int): Float =
        0.2125f * ((px shr 16) and 0xFF) + 0.7154f * ((px shr 8) and 0xFF) + 0.0721f * (px and 0xFF)

    private fun clampAdd(channelBits: Int, delta: Float): Int = ((channelBits and 0xFF) + delta).roundToInt().coerceIn(0, 255)

    /** Vignette radiale : le centre intact, l'assombrissement croît vers les coins. */
    private fun vignette(src: IntArray, w: Int, h: Int, intensity: Float): IntArray {
        val cx = (w - 1) / 2f
        val cy = (h - 1) / 2f
        val maxD = sqrt(cx * cx + cy * cy).coerceAtLeast(1f)
        return IntArray(src.size) { i ->
            val x = i % w
            val y = i / w
            val d = sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD
            val t = ((d - 0.3f) / 0.7f).coerceIn(0f, 1f)
            val factor = (1f - (intensity * 0.5f * t * t).coerceIn(0f, 1f))
            scaleRgb(src[i], factor)
        }
    }

    private fun scaleRgb(px: Int, f: Float): Int =
        (px and 0xFF000000.toInt()) or
            (((px shr 16 and 0xFF) * f).roundToInt().coerceIn(0, 255) shl 16) or
            (((px shr 8 and 0xFF) * f).roundToInt().coerceIn(0, 255) shl 8) or
            ((px and 0xFF) * f).roundToInt().coerceIn(0, 255)

    /** Les hautes lumières floutées s'ajoutent à l'image en écran, à raison de [amount]. */
    private fun bloom(src: IntArray, w: Int, h: Int, amount: Float, scale: Float): IntArray {
        val blurred = gaussian(src, w, h, BLOOM_RADIUS * scale)
        return IntArray(src.size) { i ->
            val s = src[i]
            val b = blurred[i]
            (s and 0xFF000000.toInt()) or
                (screen(s shr 16, b shr 16, amount) shl 16) or
                (screen(s shr 8, b shr 8, amount) shl 8) or
                screen(s, b, amount)
        }
    }

    private fun screen(srcBits: Int, blurBits: Int, amount: Float): Int {
        val s = (srcBits and 0xFF) / 255f
        val glow = (max(0f, (blurBits and 0xFF) / 255f - 0.4f) / 0.6f) * amount
        return ((1f - (1f - s) * (1f - glow)) * 255f).roundToInt().coerceIn(0, 255)
    }

    /** Bruit noir déterministe : le MÊME grain d'un rendu à l'autre, alpha au plus [GRAIN_ALPHA_PER_UNIT] × [amount]. */
    private fun grain(src: IntArray, w: Int, h: Int, amount: Float): IntArray {
        val maxAlpha = amount * GRAIN_ALPHA_PER_UNIT
        return IntArray(src.size) { i ->
            val x = i % w
            val y = i / w
            scaleRgb(src[i], 1f - maxAlpha * noise(x, y))
        }
    }

    internal fun noise(x: Int, y: Int): Float {
        var n = x * 374761393 + y * 668265263
        n = (n xor (n ushr 13)) * 1274126177
        n = n xor (n ushr 16)
        return (n and 0xFFFF) / 65535f
    }

    /** Flou gaussien par trois passes de flou boîte séparables (écart type [sigma]). */
    internal fun gaussian(src: IntArray, w: Int, h: Int, sigma: Float): IntArray {
        if (sigma < 0.5f) return src
        var cur = src
        boxSizes(sigma).forEach { radius ->
            cur = boxBlurAxis(boxBlurAxis(cur, w, h, radius, horizontal = true), w, h, radius, horizontal = false)
        }
        return cur
    }

    private fun boxSizes(sigma: Float): IntArray {
        val ideal = sqrt(12f * sigma * sigma / 3f + 1f)
        var lower = ideal.toInt()
        if (lower % 2 == 0) lower--
        val upper = lower + 2
        val m = ((12f * sigma * sigma - 3f * lower * lower - 12f * lower - 9f) / (-4f * lower - 4f)).roundToInt()
        return IntArray(3) { i -> (if (i < m) lower else upper).coerceAtLeast(1).let { (it - 1) / 2 } }
    }

    private fun boxBlurAxis(src: IntArray, w: Int, h: Int, radius: Int, horizontal: Boolean): IntArray {
        if (radius <= 0) return src
        val out = IntArray(src.size)
        val lines = if (horizontal) h else w
        val length = if (horizontal) w else h
        val window = 2 * radius + 1
        for (line in 0 until lines) {
            var sa = 0; var sr = 0; var sg = 0; var sb = 0
            fun at(k: Int): Int {
                val c = k.coerceIn(0, length - 1)
                return if (horizontal) src[line * w + c] else src[c * w + line]
            }
            for (k in -radius..radius) {
                val px = at(k)
                sa += px ushr 24; sr += (px shr 16) and 0xFF; sg += (px shr 8) and 0xFF; sb += px and 0xFF
            }
            for (k in 0 until length) {
                val px = (div(sa, window) shl 24) or (div(sr, window) shl 16) or (div(sg, window) shl 8) or div(sb, window)
                if (horizontal) out[line * w + k] = px else out[k * w + line] = px
                val leave = at(k - radius)
                val enter = at(k + radius + 1)
                sa += (enter ushr 24) - (leave ushr 24)
                sr += ((enter shr 16) and 0xFF) - ((leave shr 16) and 0xFF)
                sg += ((enter shr 8) and 0xFF) - ((leave shr 8) and 0xFF)
                sb += (enter and 0xFF) - (leave and 0xFF)
            }
        }
        return out
    }

    private fun div(sum: Int, window: Int): Int = ((sum + window / 2) / window).coerceIn(0, 255)

    // endregion
}
