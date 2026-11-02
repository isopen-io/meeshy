package me.meeshy.sdk.media.scene

import kotlin.math.max
import kotlin.math.roundToInt

/** Une image YUV 4:2:0 telle que le décodeur la rend : trois plans, chacun avec son pas de ligne et de pixel. */
internal class YuvPlanes(
    val width: Int,
    val height: Int,
    val y: ByteArray,
    val yRowStride: Int,
    val yPixelStride: Int,
    val u: ByteArray,
    val uRowStride: Int,
    val uPixelStride: Int,
    val v: ByteArray,
    val vRowStride: Int,
    val vPixelStride: Int,
)

/** Des pixels ARGB opaques, ligne par ligne. */
internal class ArgbPixels(val width: Int, val height: Int, val pixels: IntArray)

/**
 * **YUV 4:2:0 → ARGB, à la taille peinte et debout** (#13897) : la vidéo posée se peint dans un cadre d'au plus la largeur
 * du format ; convertir l'image pleine à chaque image de sortie coûterait au fil GL ce que le muxer ne lui accorde pas. Chaque
 * pixel de sortie lit le pixel de la source qui lui correspond (échantillonnage au plus proche), dans le sens d'affichage
 * déclaré par la piste (0, 90, 180, 270), en BT.601 à plage limitée — la sortie des décodeurs vidéo d'Android.
 */
internal object YuvFrameConverter {

    fun convert(planes: YuvPlanes, rotationDegrees: Int, maxLongSide: Int, reuse: IntArray? = null): ArgbPixels {
        val quarter = ((rotationDegrees % FULL_TURN + FULL_TURN) % FULL_TURN) / QUARTER_TURN
        val uprightWidth = if (quarter % 2 == 0) planes.width else planes.height
        val uprightHeight = if (quarter % 2 == 0) planes.height else planes.width
        val scale = minOf(1.0, maxLongSide.toDouble() / max(uprightWidth, uprightHeight))
        val outWidth = max(1, (uprightWidth * scale).roundToInt())
        val outHeight = max(1, (uprightHeight * scale).roundToInt())
        val pixels = reuse?.takeIf { it.size == outWidth * outHeight } ?: IntArray(outWidth * outHeight)
        for (oy in 0 until outHeight) {
            val v = (oy + HALF) / outHeight
            for (ox in 0 until outWidth) {
                val u = (ox + HALF) / outWidth
                val sx: Double
                val sy: Double
                when (quarter) {
                    1 -> { sx = v; sy = 1.0 - u }
                    2 -> { sx = 1.0 - u; sy = 1.0 - v }
                    3 -> { sx = 1.0 - v; sy = u }
                    else -> { sx = u; sy = v }
                }
                val x = (sx * planes.width).toInt().coerceIn(0, planes.width - 1)
                val y = (sy * planes.height).toInt().coerceIn(0, planes.height - 1)
                pixels[oy * outWidth + ox] = argb(planes, x, y)
            }
        }
        return ArgbPixels(outWidth, outHeight, pixels)
    }

    private fun argb(planes: YuvPlanes, x: Int, y: Int): Int {
        val luma = planes.y[y * planes.yRowStride + x * planes.yPixelStride].toInt() and BYTE
        val cx = x / 2
        val cy = y / 2
        val cb = planes.u[cy * planes.uRowStride + cx * planes.uPixelStride].toInt() and BYTE
        val cr = planes.v[cy * planes.vRowStride + cx * planes.vPixelStride].toInt() and BYTE
        val c = LUMA_SCALE * (luma - LUMA_FLOOR)
        val d = cb - CHROMA_ZERO
        val e = cr - CHROMA_ZERO
        val r = ((c + CR_TO_R * e + ROUND) shr SHIFT).coerceIn(0, BYTE)
        val g = ((c - CB_TO_G * d - CR_TO_G * e + ROUND) shr SHIFT).coerceIn(0, BYTE)
        val b = ((c + CB_TO_B * d + ROUND) shr SHIFT).coerceIn(0, BYTE)
        return OPAQUE or (r shl RED) or (g shl GREEN) or b
    }

    private const val FULL_TURN = 360
    private const val QUARTER_TURN = 90
    private const val HALF = 0.5
    private const val BYTE = 0xFF
    private const val LUMA_FLOOR = 16
    private const val CHROMA_ZERO = 128
    private const val LUMA_SCALE = 298
    private const val CR_TO_R = 409
    private const val CB_TO_G = 100
    private const val CR_TO_G = 208
    private const val CB_TO_B = 516
    private const val ROUND = 128
    private const val SHIFT = 8
    private const val OPAQUE = -0x1000000
    private const val RED = 16
    private const val GREEN = 8
}
