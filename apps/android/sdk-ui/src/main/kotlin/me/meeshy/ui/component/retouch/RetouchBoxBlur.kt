package me.meeshy.ui.component.retouch

import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * **LE FLOU DU VERRE** — trois passes de flou boîte séparable, qui approchent une gaussienne de sigma donné ;
 * pures (des pixels ARGB en entrée, des pixels en sortie), bord prolongé comme le fait le flou de l'iOS.
 */
internal object RetouchBoxBlur {
    private const val PASSES = 3

    /** Le rayon d'une boîte dont trois passes approchent la gaussienne de [sigma] pixels. */
    fun radiusFor(sigma: Float): Int {
        if (sigma <= 0f) return 0
        val width = sqrt(12f * sigma * sigma / PASSES + 1f)
        return ((width - 1f) / 2f).roundToInt().coerceAtLeast(0)
    }

    fun blur(pixels: IntArray, width: Int, height: Int, radius: Int): IntArray {
        require(pixels.size == width * height) { "pixels.size != width * height" }
        if (radius <= 0 || width < 1 || height < 1) return pixels.copyOf()
        var current = pixels
        repeat(PASSES) {
            current = pass(pass(current, width, height, radius, horizontal = true), width, height, radius, horizontal = false)
        }
        return current
    }

    private fun pass(input: IntArray, width: Int, height: Int, radius: Int, horizontal: Boolean): IntArray {
        val out = IntArray(input.size)
        val lines = if (horizontal) height else width
        val length = if (horizontal) width else height
        val window = 2 * radius + 1
        for (line in 0 until lines) {
            val base = if (horizontal) line * width else line
            val stride = if (horizontal) 1 else width
            val sums = IntArray(4)
            for (k in -radius..radius) add(sums, input[base + clamp(k, length) * stride], 1)
            for (i in 0 until length) {
                out[base + i * stride] = pack(sums, window)
                add(sums, input[base + clamp(i + radius + 1, length) * stride], 1)
                add(sums, input[base + clamp(i - radius, length) * stride], -1)
            }
        }
        return out
    }

    private fun clamp(index: Int, length: Int): Int = index.coerceIn(0, length - 1)

    private fun add(sums: IntArray, pixel: Int, sign: Int) {
        sums[0] += sign * (pixel ushr 24 and 0xFF)
        sums[1] += sign * (pixel ushr 16 and 0xFF)
        sums[2] += sign * (pixel ushr 8 and 0xFF)
        sums[3] += sign * (pixel and 0xFF)
    }

    private fun pack(sums: IntArray, window: Int): Int =
        ((sums[0] + window / 2) / window shl 24) or ((sums[1] + window / 2) / window shl 16) or
            ((sums[2] + window / 2) / window shl 8) or ((sums[3] + window / 2) / window)
}
