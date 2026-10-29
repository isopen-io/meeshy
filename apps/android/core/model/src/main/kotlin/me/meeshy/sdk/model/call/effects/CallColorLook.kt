package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.call.VideoFilterPreset

/**
 * **LES TEINTES D'APPEL, ÉTALONNÉES** — miroir de iOS `CallColorLook` (#9289). A look is ONE grade baked
 * in a 3D cube and applied in one pass: filmic curve, split toning, vibrance — and skin tones are spared,
 * a face stays a face under « Froid » as under « Vif ». The grade is pure ([grade]); the cube is computed
 * once per look.
 *
 * Android packs the cube in a 2D strip ([lutStrip]) because OpenGL ES 2 has no 3D texture: blue slices
 * side by side, red fastest inside a slice, green down the rows. The shader interpolates between slices.
 */
object CallColorLook {
    const val DIMENSION: Int = 25

    data class Rgb(val r: Float, val g: Float, val b: Float) {
        operator fun plus(o: Rgb) = Rgb(r + o.r, g + o.g, b + o.b)
        operator fun minus(o: Rgb) = Rgb(r - o.r, g - o.g, b - o.b)
        operator fun times(k: Float) = Rgb(r * k, g * k, b * k)
        operator fun times(o: Rgb) = Rgb(r * o.r, g * o.g, b * o.b)
        fun clamped() = Rgb(r.coerceIn(0f, 1f), g.coerceIn(0f, 1f), b.coerceIn(0f, 1f))

        companion object {
            fun gray(v: Float) = Rgb(v, v, v)
        }
    }

    data class Recipe(
        val balance: Rgb = Rgb(1f, 1f, 1f),
        val curve: Float = 0f,
        val blackLift: Float = 0f,
        val shadows: Rgb = Rgb(0f, 0f, 0f),
        val highlights: Rgb = Rgb(0f, 0f, 0f),
        val vibrance: Float = 0f,
        val saturation: Float = 1f,
        val skinProtection: Float = 0.7f,
    )

    /** `null`: the look touches nothing (Naturel). Values are iOS's, digit for digit. */
    fun recipe(preset: VideoFilterPreset): Recipe? = when (preset) {
        VideoFilterPreset.Natural -> null
        VideoFilterPreset.Warm -> Recipe(
            Rgb(1.035f, 1f, 0.94f), 0.22f, 0.012f,
            Rgb(0.012f, 0.004f, -0.008f), Rgb(0.03f, 0.016f, -0.022f), 0.16f, 1f, 0.6f,
        )
        VideoFilterPreset.Cool -> Recipe(
            Rgb(0.96f, 1f, 1.05f), 0.26f, 0f,
            Rgb(-0.012f, 0.004f, 0.03f), Rgb(-0.006f, 0.004f, 0.012f), 0.1f, 0.98f, 0.8f,
        )
        VideoFilterPreset.Vivid -> Recipe(
            Rgb(1f, 1f, 1f), 0.34f, 0f,
            Rgb(0f, 0f, 0.01f), Rgb(0.01f, 0.006f, 0f), 0.45f, 1.04f, 0.75f,
        )
        VideoFilterPreset.Muted -> Recipe(
            Rgb(1.01f, 1f, 0.99f), -0.18f, 0.05f,
            Rgb(0.006f, 0.006f, 0.012f), Rgb(0.012f, 0.008f, 0f), -0.1f, 0.76f, 0.5f,
        )
    }

    /** Grades a gamma-encoded sRGB colour (0…1). Pure. */
    fun grade(rgb: Rgb, recipe: Recipe): Rgb {
        val input = rgb.clamped()
        val balanced = (input * recipe.balance).clamped()
        val toned = Rgb(curve(balanced.r, recipe), curve(balanced.g, recipe), curve(balanced.b, recipe))
        val luma = luminance(toned)
        val split = recipe.shadows * ((1 - luma) * (1 - luma)) + recipe.highlights * (luma * luma)
        val saturated = saturate((toned + split).clamped(), recipe)
        val toneOnly = Rgb(curve(input.r, recipe), curve(input.g, recipe), curve(input.b, recipe))
        val protected = skinLikelihood(input) * recipe.skinProtection
        return (saturated * (1 - protected) + toneOnly * protected).clamped()
    }

    /** How likely a colour is a skin tone: hue between red and orange, moderate saturation, neither black nor white. */
    fun skinLikelihood(rgb: Rgb): Float {
        val maxC = maxOf(rgb.r, rgb.g, rgb.b)
        val minC = minOf(rgb.r, rgb.g, rgb.b)
        val chroma = maxC - minC
        if (maxC <= 0.08f || chroma <= 0.02f || rgb.r < rgb.g || rgb.g < rgb.b) return 0f
        val hue = 60 * (rgb.g - rgb.b) / chroma
        val saturation = chroma / maxC
        val hueWeight = smoothstep(0f, 8f, hue) * (1 - smoothstep(40f, 55f, hue))
        val saturationWeight = smoothstep(0.08f, 0.18f, saturation) * (1 - smoothstep(0.62f, 0.8f, saturation))
        return hueWeight * saturationWeight
    }

    fun luminance(rgb: Rgb): Float = 0.2126f * rgb.r + 0.7152f * rgb.g + 0.0722f * rgb.b

    fun saturation(rgb: Rgb): Float {
        val maxC = maxOf(rgb.r, rgb.g, rgb.b)
        return if (maxC <= 0f) 0f else (maxC - minOf(rgb.r, rgb.g, rgb.b)) / maxC
    }

    /** Width and height of the packed strip, in texels. */
    fun stripSize(dimension: Int = DIMENSION): Pair<Int, Int> = dimension * dimension to dimension

    /**
     * The cube of [recipe] as RGBA bytes, packed in a `DIMENSION² × DIMENSION` strip: texel
     * `(r + b·N, g)` holds the grade of `(r, g, b) / (N − 1)`.
     */
    fun lutStrip(recipe: Recipe, dimension: Int = DIMENSION): ByteArray {
        val step = 1f / (dimension - 1)
        val (width, height) = stripSize(dimension)
        val out = ByteArray(width * height * 4)
        for (g in 0 until dimension) for (b in 0 until dimension) for (r in 0 until dimension) {
            val graded = grade(Rgb(r * step, g * step, b * step), recipe)
            val offset = (g * width + b * dimension + r) * 4
            out[offset] = toByte(graded.r)
            out[offset + 1] = toByte(graded.g)
            out[offset + 2] = toByte(graded.b)
            out[offset + 3] = 0xFF.toByte()
        }
        return out
    }

    private fun toByte(value: Float): Byte = (value.coerceIn(0f, 1f) * 255f + 0.5f).toInt().toByte()

    private fun curve(value: Float, recipe: Recipe): Float {
        val s = value * value * (3 - 2 * value)
        val shaped = value + (s - value) * recipe.curve
        return recipe.blackLift + shaped * (1 - recipe.blackLift)
    }

    private fun saturate(rgb: Rgb, recipe: Recipe): Rgb {
        val luma = luminance(rgb)
        val gain = recipe.saturation * (1 + recipe.vibrance * (1 - saturation(rgb)))
        return (Rgb.gray(luma) + (rgb - Rgb.gray(luma)) * gain).clamped()
    }

    private fun smoothstep(edge0: Float, edge1: Float, x: Float): Float {
        val t = ((x - edge0) / (edge1 - edge0)).coerceIn(0f, 1f)
        return t * t * (3 - 2 * t)
    }
}
