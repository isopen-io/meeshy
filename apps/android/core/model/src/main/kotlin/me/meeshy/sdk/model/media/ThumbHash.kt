package me.meeshy.sdk.model.media

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max

/**
 * A decoded colour in the `0f..1f` unit range, alpha included. Feeds both the flat
 * blur-placeholder tint and the average-colour skeleton fill.
 */
data class ThumbHashColor(
    val red: Float,
    val green: Float,
    val blue: Float,
    val alpha: Float,
)

/**
 * A decoded ThumbHash placeholder: a tiny (≤32px on the long edge) RGBA raster.
 * [rgba] is row-major, 4 bytes per pixel (R, G, B, A), each an **unsigned** channel
 * value read back with `rgba[i].toInt() and 0xFF`. The app-side glue wraps this into a
 * `Bitmap` (`createBitmap` + `setPixels`) — the runtime pixel work stays out of the SDK.
 */
class ThumbHashImage(
    val width: Int,
    val height: Int,
    val rgba: ByteArray,
)

/**
 * Pure decoder for the [ThumbHash](https://evanw.github.io/thumbhash/) compact image
 * placeholder format (feature-parity §P — "ThumbHash blur placeholders for all media").
 *
 * Ports Evan Wallace's canonical `thumbHashToRGBA` / `thumbHashToAverageRGBA` /
 * `thumbHashToApproximateAspectRatio` faithfully, and **surpasses** them by:
 *  - rejecting a hash too short for the region it must read (`IllegalArgumentException`
 *    instead of a silent out-of-bounds read on a truncated/garbage hash), and
 *  - clamping the decoded raster to at least 1×1 so a degenerate header can never
 *    produce a zero-sized image the caller would choke on.
 *
 * Kept pure in `:core:model`: no Android `Bitmap`/`Color`. The decode is deterministic
 * DCT math over primitives, so it is fully JVM-testable; the caller owns the raster→Bitmap
 * conversion and the Compose painting.
 */
object ThumbHash {

    private const val MIN_HEADER_BYTES = 3
    private const val MIN_ORIENTATION_BYTES = 5

    /** True when the hash carries a per-pixel alpha channel. */
    fun hasAlpha(hash: ByteArray): Boolean {
        require(hash.size >= MIN_HEADER_BYTES) { "ThumbHash needs at least $MIN_HEADER_BYTES bytes" }
        return (byte(hash, 2) shr 7) and 1 == 1
    }

    /** True when the encoded image is wider than tall. */
    fun isLandscape(hash: ByteArray): Boolean {
        require(hash.size >= MIN_ORIENTATION_BYTES) {
            "ThumbHash needs at least $MIN_ORIENTATION_BYTES bytes"
        }
        val header16 = byte(hash, 3) or (byte(hash, 4) shl 8)
        return (header16 shr 15) == 1
    }

    /**
     * The encoded width/height ratio, faithful to the reference (uses the raw L/P basis
     * counts, no `max(3, …)` floor). May be `0f` for a degenerate header; [decode] then
     * clamps the raster to a valid size.
     */
    fun approximateAspectRatio(hash: ByteArray): Float {
        require(hash.size >= MIN_ORIENTATION_BYTES) {
            "ThumbHash needs at least $MIN_ORIENTATION_BYTES bytes"
        }
        val header = byte(hash, 3)
        val hasAlpha = (byte(hash, 2) and 0x80) != 0
        val isLandscape = (byte(hash, 4) and 0x80) != 0
        val lx = if (isLandscape) (if (hasAlpha) 5 else 7) else (header and 7)
        val ly = if (isLandscape) (header and 7) else (if (hasAlpha) 5 else 7)
        return lx.toFloat() / ly.toFloat()
    }

    /** The single DC colour of the placeholder — the header-only average tint. */
    fun averageColor(hash: ByteArray): ThumbHashColor {
        require(hash.size >= MIN_HEADER_BYTES) { "ThumbHash needs at least $MIN_HEADER_BYTES bytes" }
        val header24 = byte(hash, 0) or (byte(hash, 1) shl 8) or (byte(hash, 2) shl 16)
        val l = (header24 and 63) / 63.0
        val p = ((header24 shr 6) and 63) / 31.5 - 1.0
        val q = ((header24 shr 12) and 63) / 31.5 - 1.0
        val hasAlpha = (header24 shr 23) and 1 == 1
        if (hasAlpha) require(hash.size >= 6) { "Alpha ThumbHash needs at least 6 bytes" }
        val a = if (hasAlpha) (byte(hash, 5) and 15) / 15.0 else 1.0
        return ycocgToColor(l, p, q, a)
    }

    private const val MAX_SIDE = 100

    /**
     * Encodes a small RGBA raster into a ThumbHash placeholder — the inverse of [decode],
     * used app-side to generate the blur seed before an image upload (feature-parity §P).
     *
     * Ports Evan Wallace's canonical `rgbaToThumbHash`: alpha-weighted average colour, an
     * RGBA→LPQA transform composited atop that average, and a forward DCT of each channel
     * into a DC term plus scale-normalised AC nibbles. The luminance grid uses fewer bits
     * when an alpha channel is present, exactly as the reference (and as [decode] expects).
     *
     * **Surpasses** the reference on its unguarded inputs: it rejects a non-positive or
     * over-100 side and a [rgba] buffer too short for `width·height·4` pixels with an
     * [IllegalArgumentException], where the reference would read past the buffer and emit a
     * hash full of `NaN`-derived garbage.
     *
     * @param rgba row-major, 4 bytes per pixel (R, G, B, A), each an unsigned channel value.
     */
    fun encode(width: Int, height: Int, rgba: ByteArray): ByteArray {
        require(width in 1..MAX_SIDE && height in 1..MAX_SIDE) {
            "ThumbHash encodes 1..$MAX_SIDE px per side, got ${width}x$height"
        }
        require(rgba.size >= width * height * 4) {
            "rgba buffer too small: need ${width * height * 4} bytes, got ${rgba.size}"
        }

        val count = width * height
        var avgR = 0.0
        var avgG = 0.0
        var avgB = 0.0
        var avgA = 0.0
        var j = 0
        for (i in 0 until count) {
            val alpha = byte(rgba, j + 3) / 255.0
            avgR += alpha / 255.0 * byte(rgba, j)
            avgG += alpha / 255.0 * byte(rgba, j + 1)
            avgB += alpha / 255.0 * byte(rgba, j + 2)
            avgA += alpha
            j += 4
        }
        if (avgA > 0) {
            avgR /= avgA
            avgG /= avgA
            avgB /= avgA
        }

        val hasAlpha = avgA < count
        val lLimit = if (hasAlpha) 5 else 7
        val maxSide = max(width, height)
        val lx = max(1, roundHalfUp(lLimit.toDouble() * width / maxSide))
        val ly = max(1, roundHalfUp(lLimit.toDouble() * height / maxSide))

        val lCh = DoubleArray(count)
        val pCh = DoubleArray(count)
        val qCh = DoubleArray(count)
        val aCh = DoubleArray(count)
        j = 0
        for (i in 0 until count) {
            val alpha = byte(rgba, j + 3) / 255.0
            val r = avgR * (1 - alpha) + alpha / 255.0 * byte(rgba, j)
            val g = avgG * (1 - alpha) + alpha / 255.0 * byte(rgba, j + 1)
            val b = avgB * (1 - alpha) + alpha / 255.0 * byte(rgba, j + 2)
            lCh[i] = (r + g + b) / 3.0
            pCh[i] = (r + g) / 2.0 - b
            qCh[i] = r - g
            aCh[i] = alpha
            j += 4
        }

        val lEnc = encodeChannel(lCh, width, height, max(3, lx), max(3, ly))
        val pEnc = encodeChannel(pCh, width, height, 3, 3)
        val qEnc = encodeChannel(qCh, width, height, 3, 3)
        val aEnc = if (hasAlpha) encodeChannel(aCh, width, height, 5, 5) else null

        val isLandscape = width > height
        val header24 = roundHalfUp(63 * lEnc.dc) or
            (roundHalfUp(31.5 + 31.5 * pEnc.dc) shl 6) or
            (roundHalfUp(31.5 + 31.5 * qEnc.dc) shl 12) or
            (roundHalfUp(31 * lEnc.scale) shl 18) or
            ((if (hasAlpha) 1 else 0) shl 23)
        val header16 = (if (isLandscape) ly else lx) or
            (roundHalfUp(63 * pEnc.scale) shl 3) or
            (roundHalfUp(63 * qEnc.scale) shl 9) or
            ((if (isLandscape) 1 else 0) shl 15)

        val out = ArrayList<Int>()
        out.add(header24 and 0xFF)
        out.add((header24 shr 8) and 0xFF)
        out.add((header24 shr 16) and 0xFF)
        out.add(header16 and 0xFF)
        out.add((header16 shr 8) and 0xFF)
        if (aEnc != null) {
            out.add((roundHalfUp(15 * aEnc.dc) or (roundHalfUp(15 * aEnc.scale) shl 4)) and 0xFF)
        }

        val acStart = out.size
        val acChannels =
            if (aEnc != null) listOf(lEnc.ac, pEnc.ac, qEnc.ac, aEnc.ac)
            else listOf(lEnc.ac, pEnc.ac, qEnc.ac)
        var acIndex = 0
        for (channel in acChannels) {
            for (f in channel) {
                val byteIndex = acStart + (acIndex shr 1)
                while (out.size <= byteIndex) out.add(0)
                out[byteIndex] = out[byteIndex] or (roundHalfUp(15 * f) shl ((acIndex and 1) shl 2))
                acIndex++
            }
        }

        return ByteArray(out.size) { out[it].toByte() }
    }

    /** Decodes the full RGBA placeholder raster. */
    fun decode(hash: ByteArray): ThumbHashImage {
        require(hash.size >= MIN_ORIENTATION_BYTES) {
            "ThumbHash needs at least $MIN_ORIENTATION_BYTES bytes"
        }

        val header24 = byte(hash, 0) or (byte(hash, 1) shl 8) or (byte(hash, 2) shl 16)
        val header16 = byte(hash, 3) or (byte(hash, 4) shl 8)
        val lDc = (header24 and 63) / 63.0
        val pDc = ((header24 shr 6) and 63) / 31.5 - 1.0
        val qDc = ((header24 shr 12) and 63) / 31.5 - 1.0
        val lScale = ((header24 shr 18) and 31) / 31.0
        val hasAlpha = (header24 shr 23) and 1 == 1
        val pScale = ((header16 shr 3) and 63) / 63.0
        val qScale = ((header16 shr 9) and 63) / 63.0
        val isLandscape = (header16 shr 15) == 1
        val lx = max(3, if (isLandscape) (if (hasAlpha) 5 else 7) else (header16 and 7))
        val ly = max(3, if (isLandscape) (header16 and 7) else (if (hasAlpha) 5 else 7))

        val acStart = if (hasAlpha) 6 else 5
        if (hasAlpha) require(hash.size > 5) { "Alpha ThumbHash needs the alpha byte" }
        val aDc = if (hasAlpha) (byte(hash, 5) and 15) / 15.0 else 1.0
        val aScale = if (hasAlpha) (byte(hash, 5) shr 4) / 15.0 else 0.0

        val required = acStart + (countAc(lx, ly) + countAc(3, 3) * 2 +
            (if (hasAlpha) countAc(5, 5) else 0) + 1) / 2
        require(hash.size >= required) {
            "Truncated ThumbHash: need $required bytes, got ${hash.size}"
        }

        var acIndex = 0
        fun decodeChannel(nx: Int, ny: Int, scale: Double): DoubleArray {
            val ac = ArrayList<Double>()
            for (cy in 0 until ny) {
                var cx = if (cy > 0) 0 else 1
                while (cx * ny < nx * (ny - cy)) {
                    val nibble = (byte(hash, acStart + (acIndex shr 1)) shr ((acIndex and 1) shl 2)) and 15
                    ac.add((nibble / 7.5 - 1.0) * scale)
                    acIndex++
                    cx++
                }
            }
            return ac.toDoubleArray()
        }

        val lAc = decodeChannel(lx, ly, lScale)
        val pAc = decodeChannel(3, 3, pScale * 1.25)
        val qAc = decodeChannel(3, 3, qScale * 1.25)
        val aAc = if (hasAlpha) decodeChannel(5, 5, aScale) else DoubleArray(0)

        val ratio = approximateAspectRatio(hash)
        val w = max(1, roundHalfUp(if (ratio > 1f) 32.0 else 32.0 * ratio))
        val h = max(1, roundHalfUp(if (ratio > 1f) 32.0 / ratio else 32.0))

        val rgba = ByteArray(w * h * 4)
        val fx = DoubleArray(max(lx, if (hasAlpha) 5 else 3))
        val fy = DoubleArray(max(ly, if (hasAlpha) 5 else 3))
        var i = 0
        for (y in 0 until h) {
            for (x in 0 until w) {
                var l = lDc
                var p = pDc
                var qq = qDc
                var a = aDc

                for (cx in fx.indices) fx[cx] = cos(PI / w * (x + 0.5) * cx)
                for (cy in fy.indices) fy[cy] = cos(PI / h * (y + 0.5) * cy)

                var j = 0
                for (cy in 0 until ly) {
                    val fy2 = fy[cy] * 2
                    var cx = if (cy > 0) 0 else 1
                    while (cx * ly < lx * (ly - cy)) {
                        l += lAc[j] * fx[cx] * fy2
                        j++
                        cx++
                    }
                }

                j = 0
                for (cy in 0 until 3) {
                    val fy2 = fy[cy] * 2
                    var cx = if (cy > 0) 0 else 1
                    while (cx < 3 - cy) {
                        val f = fx[cx] * fy2
                        p += pAc[j] * f
                        qq += qAc[j] * f
                        j++
                        cx++
                    }
                }

                if (hasAlpha) {
                    j = 0
                    for (cy in 0 until 5) {
                        val fy2 = fy[cy] * 2
                        var cx = if (cy > 0) 0 else 1
                        while (cx < 5 - cy) {
                            a += aAc[j] * fx[cx] * fy2
                            j++
                            cx++
                        }
                    }
                }

                val b = l - 2.0 / 3.0 * p
                val r = (3.0 * l - b + qq) / 2.0
                val g = r - qq
                rgba[i] = channelByte(r)
                rgba[i + 1] = channelByte(g)
                rgba[i + 2] = channelByte(b)
                rgba[i + 3] = channelByte(a)
                i += 4
            }
        }
        return ThumbHashImage(width = w, height = h, rgba = rgba)
    }

    private fun ycocgToColor(l: Double, p: Double, q: Double, a: Double): ThumbHashColor {
        val b = l - 2.0 / 3.0 * p
        val r = (3.0 * l - b + q) / 2.0
        val g = r - q
        return ThumbHashColor(
            red = clampUnit(r),
            green = clampUnit(g),
            blue = clampUnit(b),
            alpha = clampUnit(a),
        )
    }

    private class EncodedChannel(val dc: Double, val ac: DoubleArray, val scale: Double)

    /**
     * Forward DCT of one channel into a DC term and scale-normalised AC coefficients,
     * over the `nx × ny` basis-frequency triangle. Mirrors the reference `encodeChannel`;
     * AC values are mapped to `[0,1]` via `0.5 + 0.5/scale·ac` only when `scale > 0`.
     */
    private fun encodeChannel(
        channel: DoubleArray,
        w: Int,
        h: Int,
        nx: Int,
        ny: Int,
    ): EncodedChannel {
        var dc = 0.0
        val ac = ArrayList<Double>()
        var scale = 0.0
        val fx = DoubleArray(w)
        for (cy in 0 until ny) {
            var cx = 0
            while (cx * ny < nx * (ny - cy)) {
                for (x in 0 until w) fx[x] = cos(PI / w * cx * (x + 0.5))
                var f = 0.0
                for (y in 0 until h) {
                    val fy = cos(PI / h * cy * (y + 0.5))
                    for (x in 0 until w) f += channel[x + y * w] * fx[x] * fy
                }
                f /= (w * h).toDouble()
                if (cx != 0 || cy != 0) {
                    ac.add(f)
                    scale = max(scale, abs(f))
                } else {
                    dc = f
                }
                cx++
            }
        }
        if (scale > 0) {
            for (i in ac.indices) ac[i] = 0.5 + 0.5 / scale * ac[i]
        }
        return EncodedChannel(dc, ac.toDoubleArray(), scale)
    }

    private fun countAc(nx: Int, ny: Int): Int {
        var count = 0
        for (cy in 0 until ny) {
            var cx = if (cy > 0) 0 else 1
            while (cx * ny < nx * (ny - cy)) {
                count++
                cx++
            }
        }
        return count
    }

    private fun byte(hash: ByteArray, index: Int): Int = hash[index].toInt() and 0xFF

    private fun clampUnit(value: Double): Float = value.coerceIn(0.0, 1.0).toFloat()

    private fun channelByte(value: Double): Byte =
        (255.0 * value.coerceIn(0.0, 1.0)).toInt().coerceIn(0, 255).toByte()

    private fun roundHalfUp(value: Double): Int = floor(value + 0.5).toInt()
}
