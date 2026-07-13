package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Behavioural tests for [ThumbHash]. Expected values are derived by hand from the
 * ThumbHash bit layout and the YCoCg→RGB conversion — never copied from the decoder's
 * own output — so the assertions cross-check the port, they don't restate it.
 *
 * Byte layout recap (little-endian):
 *  header24 = b0 | b1<<8 | b2<<16 :  L-dc[0..5], P-dc[6..11], Q-dc[12..17],
 *                                    L-scale[18..22], hasAlpha[23]
 *  header16 = b3 | b4<<8         :  L-count[0..2], P-scale[3..8], Q-scale[9..14],
 *                                    isLandscape[15]
 */
class ThumbHashTest {

    // --- helpers -----------------------------------------------------------------

    /**
     * Builds a well-formed hash from spec fields with **all AC scales zero**, so the
     * inverse DCT collapses to the DC term and [ThumbHash.decode] yields a flat image
     * equal to [ThumbHash.averageColor]. Padded generously; extra trailing bytes are
     * never read by the decoder.
     */
    private fun flatHash(
        lField: Int,
        pField: Int,
        qField: Int,
        hasAlpha: Boolean = false,
        isLandscape: Boolean = false,
        countField: Int,
        alphaByte: Int = 0,
    ): ByteArray {
        val header24 =
            (lField and 63) or
                ((pField and 63) shl 6) or
                ((qField and 63) shl 12) or
                (0 shl 18) or
                ((if (hasAlpha) 1 else 0) shl 23)
        val header16 = (countField and 7) or ((if (isLandscape) 1 else 0) shl 15)
        val out = IntArray(40)
        out[0] = header24 and 0xFF
        out[1] = (header24 shr 8) and 0xFF
        out[2] = (header24 shr 16) and 0xFF
        out[3] = header16 and 0xFF
        out[4] = (header16 shr 8) and 0xFF
        if (hasAlpha) out[5] = alphaByte and 0xFF
        return ByteArray(out.size) { out[it].toByte() }
    }

    private fun ThumbHashImage.pixel(x: Int, y: Int): IntArray {
        val i = (y * width + x) * 4
        return intArrayOf(
            rgba[i].toInt() and 0xFF,
            rgba[i + 1].toInt() and 0xFF,
            rgba[i + 2].toInt() and 0xFF,
            rgba[i + 3].toInt() and 0xFF,
        )
    }

    // --- averageColor ------------------------------------------------------------

    @Test
    fun `averageColor of zero header yields the spec-derived colour`() {
        // l=0, p=-1, q=-1, hasAlpha=0 → b=2/3, r=-5/6→0, g=r-q=1/6, a=1
        val color = ThumbHash.averageColor(ByteArray(6))
        assertThat(color.red).isWithin(1e-4f).of(0f)
        assertThat(color.green).isWithin(1e-4f).of(1f / 6f)
        assertThat(color.blue).isWithin(1e-4f).of(2f / 3f)
        assertThat(color.alpha).isWithin(1e-4f).of(1f)
    }

    @Test
    fun `averageColor of saturated header yields the spec-derived colour`() {
        // l=1, p=1, q=1 → b=1/3, r=(3-1/3+1)/2=11/6→clamp 1, g=r-q=5/6, a=1 (no alpha)
        val hash = flatHash(lField = 63, pField = 63, qField = 63, countField = 7)
        val color = ThumbHash.averageColor(hash)
        assertThat(color.red).isWithin(1e-4f).of(1f)
        assertThat(color.green).isWithin(1e-4f).of(5f / 6f)
        assertThat(color.blue).isWithin(1e-4f).of(1f / 3f)
        assertThat(color.alpha).isWithin(1e-4f).of(1f)
    }

    @Test
    fun `averageColor reads the alpha DC term when alpha is present`() {
        // hasAlpha=1, alphaByte low-nibble = 0 → a = 0/15 = 0
        val opaqueGone = flatHash(
            lField = 63, pField = 63, qField = 63,
            hasAlpha = true, countField = 7, alphaByte = 0x00,
        )
        assertThat(ThumbHash.averageColor(opaqueGone).alpha).isWithin(1e-4f).of(0f)

        // alphaByte low-nibble = 15 → a = 15/15 = 1
        val fullyOpaque = flatHash(
            lField = 63, pField = 63, qField = 63,
            hasAlpha = true, countField = 7, alphaByte = 0x0F,
        )
        assertThat(ThumbHash.averageColor(fullyOpaque).alpha).isWithin(1e-4f).of(1f)
    }

    // --- metadata ----------------------------------------------------------------

    @Test
    fun `hasAlpha reflects the alpha header bit`() {
        assertThat(ThumbHash.hasAlpha(flatHash(1, 1, 1, hasAlpha = false, countField = 7)))
            .isFalse()
        assertThat(ThumbHash.hasAlpha(flatHash(1, 1, 1, hasAlpha = true, countField = 7)))
            .isTrue()
    }

    @Test
    fun `isLandscape reflects the orientation header bit`() {
        assertThat(ThumbHash.isLandscape(flatHash(1, 1, 1, isLandscape = false, countField = 7)))
            .isFalse()
        assertThat(ThumbHash.isLandscape(flatHash(1, 1, 1, isLandscape = true, countField = 4)))
            .isTrue()
    }

    // --- approximateAspectRatio --------------------------------------------------

    @Test
    fun `approximateAspectRatio for a portrait hash is L-count over 7`() {
        // portrait, no alpha → lx = countField, ly = 7
        val ratio = ThumbHash.approximateAspectRatio(flatHash(1, 1, 1, countField = 4))
        assertThat(ratio).isWithin(1e-4f).of(4f / 7f)
    }

    @Test
    fun `approximateAspectRatio for a landscape hash is 7 over L-count`() {
        // landscape, no alpha → lx = 7, ly = countField
        val ratio = ThumbHash.approximateAspectRatio(
            flatHash(1, 1, 1, isLandscape = true, countField = 4),
        )
        assertThat(ratio).isWithin(1e-4f).of(7f / 4f)
    }

    @Test
    fun `approximateAspectRatio with alpha uses 5 for the fixed axis`() {
        // portrait + alpha → lx = countField, ly = 5
        val ratio = ThumbHash.approximateAspectRatio(
            flatHash(1, 1, 1, hasAlpha = true, countField = 3),
        )
        assertThat(ratio).isWithin(1e-4f).of(3f / 5f)
    }

    // --- decode: dimensions ------------------------------------------------------

    @Test
    fun `decode of a square hash is 32 by 32`() {
        val image = ThumbHash.decode(flatHash(63, 63, 63, countField = 7))
        assertThat(image.width).isEqualTo(32)
        assertThat(image.height).isEqualTo(32)
        assertThat(image.rgba.size).isEqualTo(32 * 32 * 4)
    }

    @Test
    fun `decode of a portrait hash shrinks the width`() {
        // ratio 4/7 < 1 → w = round(32*4/7)=18, h = 32
        val image = ThumbHash.decode(flatHash(63, 63, 63, countField = 4))
        assertThat(image.width).isEqualTo(18)
        assertThat(image.height).isEqualTo(32)
        assertThat(image.rgba.size).isEqualTo(18 * 32 * 4)
    }

    @Test
    fun `decode of a landscape hash shrinks the height`() {
        // ratio 7/4 > 1 → w = 32, h = round(32*4/7)=18
        val image = ThumbHash.decode(flatHash(63, 63, 63, isLandscape = true, countField = 4))
        assertThat(image.width).isEqualTo(32)
        assertThat(image.height).isEqualTo(18)
        assertThat(image.rgba.size).isEqualTo(32 * 18 * 4)
    }

    // --- decode: flat reconstruction (DC-only) -----------------------------------

    @Test
    fun `decode with zero AC scales yields a flat image equal to the average colour`() {
        // Every AC coefficient is scaled by 0, so the inverse DCT is the DC term at
        // every pixel. Expected bytes are trunc(255 * clamp01(channel)) of the
        // hand-derived average (r→clamp 1, g=5/6, b=1/3, a=1), matching the reference's
        // IEEE-754 double math exactly:
        //   r = 255;  g = trunc(255*5/6) = 212;
        //   b: 1 - 2/3 = 0.33333333333333337 (not exact 1/3), *255 = 85.0000…001 → 85;
        //   a = 255
        val image = ThumbHash.decode(flatHash(63, 63, 63, countField = 7))
        val first = image.pixel(0, 0)
        assertThat(first.toList()).containsExactly(255, 212, 85, 255).inOrder()

        // flatness: a middle and a corner pixel match the first
        assertThat(image.pixel(16, 20).toList()).containsExactly(255, 212, 85, 255).inOrder()
        assertThat(image.pixel(31, 31).toList()).containsExactly(255, 212, 85, 255).inOrder()
    }

    @Test
    fun `decode without alpha channel is fully opaque`() {
        val image = ThumbHash.decode(flatHash(10, 20, 30, countField = 7))
        val alphas = (0 until image.width * image.height).map { image.rgba[it * 4 + 3].toInt() and 0xFF }
        assertThat(alphas.toSet()).containsExactly(255)
    }

    @Test
    fun `decode with a zero alpha DC term is fully transparent`() {
        // hasAlpha=1, a_dc=0, a_scale=0 → every pixel alpha = 0
        val image = ThumbHash.decode(
            flatHash(63, 63, 63, hasAlpha = true, countField = 5, alphaByte = 0x00),
        )
        val alphas = (0 until image.width * image.height).map { image.rgba[it * 4 + 3].toInt() and 0xFF }
        assertThat(alphas.toSet()).containsExactly(0)
    }

    @Test
    fun `every decoded byte is a valid unsigned channel value`() {
        val image = ThumbHash.decode(flatHash(40, 8, 55, countField = 6))
        assertThat(image.rgba.all { (it.toInt() and 0xFF) in 0..255 }).isTrue()
    }

    // --- decode: mean invariant (exercises the AC loops) -------------------------

    @Test
    fun `mean of a non-flat decode approximates the average colour`() {
        // Non-zero L/P/Q AC scales + non-zero AC nibbles produce a varying image, yet
        // the DCT-II basis integrates to zero over the sample grid, so the per-channel
        // mean must stay at the DC/average colour. This links the full-decode path to
        // the header-only average path — a wrong basis magnitude shifts the mean.
        val hash = buildNonFlatHash()
        val image = ThumbHash.decode(hash)
        val average = ThumbHash.averageColor(hash)

        val n = image.width * image.height
        var rSum = 0.0
        var gSum = 0.0
        var bSum = 0.0
        for (i in 0 until n) {
            rSum += image.rgba[i * 4].toInt() and 0xFF
            gSum += image.rgba[i * 4 + 1].toInt() and 0xFF
            bSum += image.rgba[i * 4 + 2].toInt() and 0xFF
        }
        // Tolerance covers 8-bit rounding + mild clamping near the mid-grey DC.
        assertThat(rSum / n / 255.0).isWithin(0.03).of(average.red.toDouble())
        assertThat(gSum / n / 255.0).isWithin(0.03).of(average.green.toDouble())
        assertThat(bSum / n / 255.0).isWithin(0.03).of(average.blue.toDouble())

        // sanity: the image is genuinely not flat
        val distinct = (0 until n).map { image.rgba[it * 4].toInt() and 0xFF }.toSet()
        assertThat(distinct.size).isGreaterThan(1)
    }

    /**
     * Mid-grey DC (l≈0.508) with **maximal headroom** on every channel, the smallest
     * non-zero L-scale (1/31 ≈ 0.032), and every L AC nibble set to 7 → each coefficient
     * ≈ −0.067·scale ≈ −0.0022. P/Q scales are 0, so only L varies: the reconstruction
     * ripples gently around mid-grey and never clamps, so the DCT-II zero-mean property
     * holds and the per-channel mean must land back on the average colour. AC bytes span
     * indices 5..23 (27 L + 5 P + 5 Q nibbles → 19 bytes for the 7×7 square).
     */
    private fun buildNonFlatHash(): ByteArray {
        val lField = 32 // l = 32/63 ≈ 0.508
        val pField = 32 // p ≈ 0.016
        val qField = 32 // q ≈ 0.016
        val lScale = 1 // l_scale = 1/31 ≈ 0.032 (smallest non-zero)
        val header24 =
            (lField and 63) or ((pField and 63) shl 6) or ((qField and 63) shl 12) or
                ((lScale and 31) shl 18) or (0 shl 23)
        val header16 = 7 // countField 7, portrait, no alpha; p_scale = q_scale = 0
        val out = IntArray(40)
        out[0] = header24 and 0xFF
        out[1] = (header24 shr 8) and 0xFF
        out[2] = (header24 shr 16) and 0xFF
        out[3] = header16 and 0xFF
        out[4] = (header16 shr 8) and 0xFF
        // Every AC nibble = 7 → gentle, near-neutral coefficients; P/Q scaled to 0.
        for (idx in 5..23) out[idx] = 0x77
        return ByteArray(out.size) { out[it].toByte() }
    }

    // --- guards (surpasses iOS/JS, which read out of bounds) ---------------------

    @Test
    fun `decode rejects a truncated hash`() {
        val full = flatHash(63, 63, 63, countField = 7)
        // The square (7×7 L) hash needs 24 bytes; 23 is short of the AC region.
        val truncated = full.copyOfRange(0, 23)
        assertThrows(IllegalArgumentException::class.java) { ThumbHash.decode(truncated) }
    }

    @Test
    fun `averageColor rejects a hash too short to hold the header`() {
        assertThrows(IllegalArgumentException::class.java) { ThumbHash.averageColor(ByteArray(2)) }
    }

    @Test
    fun `averageColor rejects an alpha hash missing the alpha byte`() {
        // hasAlpha bit set (byte2 bit7) but only 5 bytes → no alpha DC byte
        val hash = byteArrayOf(0, 0, 0x80.toByte(), 0, 0)
        assertThrows(IllegalArgumentException::class.java) { ThumbHash.averageColor(hash) }
    }

    @Test
    fun `approximateAspectRatio rejects a hash too short for the orientation bytes`() {
        assertThrows(IllegalArgumentException::class.java) {
            ThumbHash.approximateAspectRatio(ByteArray(4))
        }
    }

    // --- degenerate dimensions (surpasses iOS, which would build a 0-wide image) --

    @Test
    fun `decode clamps a degenerate zero-count portrait to a one-pixel-wide image`() {
        // portrait countField 0 → lx=0 → ratio 0 → w rounds to 0; we clamp to 1.
        val image = ThumbHash.decode(flatHash(63, 63, 63, countField = 0))
        assertThat(image.width).isAtLeast(1)
        assertThat(image.height).isEqualTo(32)
        assertThat(image.rgba.size).isEqualTo(image.width * image.height * 4)
    }
}
