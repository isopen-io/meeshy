package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Behavioural tests for [ThumbHash.encode], the compact-placeholder encoder that mirrors
 * Evan Wallace's canonical `rgbaToThumbHash`.
 *
 * Two independent kinds of assertion, so nothing is circular:
 *  - **Hand-derived header bytes** for a solid image, computed straight from the bit layout
 *    and the RGBA→LPQA→DCT math (never copied from the encoder's own output).
 *  - **Cross-decode round-trips** through the independently-written [ThumbHash.decode]: what
 *    goes in as pixels must come back out as a placeholder of the same average tint,
 *    orientation and (for gradients) directional shading.
 *
 * All source images are tiny so the O(nx·ny·w·h) DCT stays fast on the JVM gate.
 */
class ThumbHashEncodeTest {

    // --- helpers -----------------------------------------------------------------

    /** A `w×h` RGBA buffer whose pixel at (x,y) is produced by [pixel] → (r,g,b,a) bytes. */
    private fun image(w: Int, h: Int, pixel: (x: Int, y: Int) -> IntArray): ByteArray {
        val out = ByteArray(w * h * 4)
        var i = 0
        for (y in 0 until h) {
            for (x in 0 until w) {
                val (r, g, b, a) = pixel(x, y)
                out[i] = r.toByte()
                out[i + 1] = g.toByte()
                out[i + 2] = b.toByte()
                out[i + 3] = a.toByte()
                i += 4
            }
        }
        return out
    }

    private operator fun IntArray.component1() = this[0]
    private operator fun IntArray.component2() = this[1]
    private operator fun IntArray.component3() = this[2]
    private operator fun IntArray.component4() = this[3]

    private fun solid(w: Int, h: Int, r: Int, g: Int, b: Int, a: Int = 255): ByteArray =
        image(w, h) { _, _ -> intArrayOf(r, g, b, a) }

    private fun ThumbHashImage.pixel(x: Int, y: Int): IntArray {
        val i = (y * width + x) * 4
        return intArrayOf(
            rgba[i].toInt() and 0xFF,
            rgba[i + 1].toInt() and 0xFF,
            rgba[i + 2].toInt() and 0xFF,
            rgba[i + 3].toInt() and 0xFF,
        )
    }

    private fun ThumbHashImage.meanLuma(xRange: IntRange): Double {
        var sum = 0.0
        var n = 0
        for (y in 0 until height) {
            for (x in xRange) {
                val p = pixel(x, y)
                sum += (p[0] + p[1] + p[2]) / 3.0
                n++
            }
        }
        return sum / n
    }

    private fun ThumbHashImage.meanAlpha(xRange: IntRange): Double {
        var sum = 0.0
        var n = 0
        for (y in 0 until height) {
            for (x in xRange) {
                sum += pixel(x, y)[3]
                n++
            }
        }
        return sum / n
    }

    // --- hand-derived header (independent of decode) -----------------------------

    @Test
    fun `encoding a solid opaque square emits the spec-derived header and zero AC bytes`() {
        // Solid (128,128,128,255) 8×8. All channels composite to 128/255 = 0.50196; the image
        // is constant so every AC coefficient is 0 and every scale is 0. Derivation:
        //   l_dc = 0.50196 → round(63·0.50196) = round(31.6235) = 32
        //   p_dc = q_dc = 0 → round(31.5 + 0)  = round(31.5)    = 32
        //   l_scale = 0     → round(31·0)       = 0 ; hasAlpha = 0 (avgA = 64 = w·h)
        //   header24 = 32 | 32<<6 | 32<<12 = 133152 = 0x020820 → bytes 32, 8, 2
        //   count = lx = 7 (square, no alpha) ; p_scale = q_scale = 0 ; landscape = 0
        //   header16 = 7 → bytes 7, 0
        // A square 7×7-L hash carries 27+5+5 = 37 AC nibbles → 19 trailing bytes, so 24 total.
        // (Those AC bytes are not asserted zero: a *perfectly* constant image leaves only
        // ~1e-16 float-noise AC whose scale-normalisation yields arbitrary nibbles — harmless,
        // since decode multiplies them back by that ~1e-16 scale. The header is what matters.)
        val hash = ThumbHash.encode(8, 8, solid(8, 8, 128, 128, 128))

        assertThat(hash.copyOfRange(0, 5).map { it.toInt() and 0xFF })
            .containsExactly(32, 8, 2, 7, 0).inOrder()
        assertThat(hash.size).isEqualTo(24)

        // And it still decodes to a flat mid-grey: the AC noise is functionally invisible.
        val image = ThumbHash.decode(hash)
        val p = image.pixel(image.width / 2, image.height / 2)
        assertThat(p[0] / 255.0).isWithin(0.02).of(128.0 / 255.0)
        assertThat(p[1] / 255.0).isWithin(0.02).of(128.0 / 255.0)
        assertThat(p[2] / 255.0).isWithin(0.02).of(128.0 / 255.0)
    }

    // --- round-trip: solid colours survive encode → decode -----------------------

    @Test
    fun `a solid colour round-trips to a flat placeholder of the same tint`() {
        // Good headroom on every channel so nothing clamps: (153,102,204) = (0.60,0.40,0.80).
        val hash = ThumbHash.encode(8, 8, solid(8, 8, 153, 102, 204))
        val avg = ThumbHash.averageColor(hash)

        // 6-bit L + 6-bit P/Q quantisation bounds the error at well under 0.06 per channel.
        assertThat(avg.red).isWithin(0.06f).of(153f / 255f)
        assertThat(avg.green).isWithin(0.06f).of(102f / 255f)
        assertThat(avg.blue).isWithin(0.06f).of(204f / 255f)
        assertThat(avg.alpha).isWithin(1e-3f).of(1f)

        // The decoded raster is genuinely flat: a corner pixel matches the average tint.
        val image = ThumbHash.decode(hash)
        val corner = image.pixel(image.width - 1, image.height - 1)
        assertThat(corner[0] / 255.0).isWithin(0.06).of(153.0 / 255.0)
        assertThat(corner[1] / 255.0).isWithin(0.06).of(102.0 / 255.0)
        assertThat(corner[2] / 255.0).isWithin(0.06).of(204.0 / 255.0)
    }

    @Test
    fun `an opaque image is encoded without an alpha channel`() {
        val hash = ThumbHash.encode(8, 8, solid(8, 8, 100, 150, 200, a = 255))
        assertThat(ThumbHash.hasAlpha(hash)).isFalse()
        assertThat(hash.size).isEqualTo(24) // no alpha DC byte, no 5×5 alpha AC region
    }

    // --- orientation --------------------------------------------------------------

    @Test
    fun `a wider-than-tall image encodes as landscape`() {
        val hash = ThumbHash.encode(8, 4, solid(8, 4, 128, 128, 128))
        assertThat(ThumbHash.isLandscape(hash)).isTrue()
        assertThat(ThumbHash.approximateAspectRatio(hash)).isGreaterThan(1f)
    }

    @Test
    fun `a taller-than-wide image encodes as portrait`() {
        val hash = ThumbHash.encode(4, 8, solid(4, 8, 128, 128, 128))
        assertThat(ThumbHash.isLandscape(hash)).isFalse()
        assertThat(ThumbHash.approximateAspectRatio(hash)).isLessThan(1f)
    }

    @Test
    fun `a square image is not landscape`() {
        // w > h is strict: an equal-sided image must not set the landscape bit.
        val hash = ThumbHash.encode(6, 6, solid(6, 6, 128, 128, 128))
        assertThat(ThumbHash.isLandscape(hash)).isFalse()
    }

    // --- AC path: a gradient keeps its direction through the round-trip -----------

    @Test
    fun `a left-to-right luminance gradient decodes brighter on the right`() {
        // Exercises the AC/DCT encode path (scale > 0) and its nibble packing: the decoded
        // placeholder must preserve the ramp direction, darker-left / brighter-right.
        val src = image(8, 8) { x, _ ->
            val v = x * 255 / 7
            intArrayOf(v, v, v, 255)
        }
        val image = ThumbHash.decode(ThumbHash.encode(8, 8, src))

        val leftHalf = image.meanLuma(0 until image.width / 2)
        val rightHalf = image.meanLuma(image.width / 2 until image.width)
        assertThat(rightHalf).isGreaterThan(leftHalf)
    }

    // --- alpha channel ------------------------------------------------------------

    @Test
    fun `uniform partial transparency is detected and its level round-trips`() {
        // Solid colour at alpha 128 everywhere: colour channels stay flat, only alpha shifts.
        val hash = ThumbHash.encode(8, 8, solid(8, 8, 200, 100, 50, a = 128))
        assertThat(ThumbHash.hasAlpha(hash)).isTrue()

        val avg = ThumbHash.averageColor(hash)
        // Alpha DC is 4-bit: round(15·0.502)/15 = 8/15 = 0.533, within 0.05 of the source.
        assertThat(avg.alpha).isWithin(0.05f).of(128f / 255f)
    }

    @Test
    fun `a left-to-right alpha gradient decodes more transparent on the left`() {
        // Flat colour, alpha ramps 0→255 left→right. Colour composites flat (avg-atop-avg),
        // so only the alpha channel carries AC — exercises the alpha 5×5 encode branch.
        val src = image(8, 8) { x, _ ->
            intArrayOf(128, 128, 128, x * 255 / 7)
        }
        val hash = ThumbHash.encode(8, 8, src)
        assertThat(ThumbHash.hasAlpha(hash)).isTrue()

        val image = ThumbHash.decode(hash)
        val leftAlpha = image.meanAlpha(0 until image.width / 2)
        val rightAlpha = image.meanAlpha(image.width / 2 until image.width)
        assertThat(rightAlpha).isGreaterThan(leftAlpha)
    }

    @Test
    fun `a fully transparent image encodes with alpha and does not crash`() {
        // avgA = 0 exercises the "skip average-colour normalisation" branch.
        val hash = ThumbHash.encode(8, 8, solid(8, 8, 200, 100, 50, a = 0))
        assertThat(ThumbHash.hasAlpha(hash)).isTrue()

        val image = ThumbHash.decode(hash)
        val meanAlpha = image.meanAlpha(0 until image.width)
        assertThat(meanAlpha).isLessThan(16.0) // essentially transparent everywhere
    }

    // --- input guards (surpass the reference, which reads out of bounds) ----------

    @Test
    fun `encode rejects a zero dimension`() {
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.encode(0, 8, ByteArray(0))
        }
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.encode(8, 0, ByteArray(0))
        }
    }

    @Test
    fun `encode rejects an image larger than 100 per side`() {
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.encode(101, 10, ByteArray(101 * 10 * 4))
        }
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.encode(10, 101, ByteArray(10 * 101 * 4))
        }
    }

    @Test
    fun `encode rejects a buffer too small for the pixel count`() {
        // 2×2 needs 16 bytes; 15 is short of the last pixel.
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.encode(2, 2, ByteArray(15))
        }
    }
}
