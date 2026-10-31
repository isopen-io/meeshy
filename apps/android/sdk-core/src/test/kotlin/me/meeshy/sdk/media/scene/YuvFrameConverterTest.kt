package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13897 — le décodeur séquentiel de la vidéo posée rend des images YUV 4:2:0 ; la conversion en ARGB se fait à la taille
 * qu'on peint (jamais plus grande que la source), dans le sens d'affichage de la vidéo (rotation déclarée par la piste), et
 * lit les plans selon leurs pas — entrelacés (NV12/NV21) ou planaires (I420).
 */
class YuvFrameConverterTest {

    private val red = Triple(81, 90, 240)
    private val blue = Triple(41, 240, 110)

    /** Une image 4 × 2 : moitié gauche rouge, moitié droite bleue ; chroma à demi-résolution, plans au pas [chromaStride]. */
    private fun halves(chromaStride: Int): YuvPlanes {
        val y = byteArrayOf(81, 81, 41, 41, 81, 81, 41, 41)
        val u = ByteArray(2 * chromaStride)
        val v = ByteArray(2 * chromaStride)
        u[0] = red.second.toByte(); v[0] = red.third.toByte()
        u[chromaStride] = blue.second.toByte(); v[chromaStride] = blue.third.toByte()
        return YuvPlanes(
            width = 4, height = 2,
            y = y, yRowStride = 4, yPixelStride = 1,
            u = u, uRowStride = 2 * chromaStride, uPixelStride = chromaStride,
            v = v, vRowStride = 2 * chromaStride, vPixelStride = chromaStride,
        )
    }

    private fun Int.rgb() = Triple((this shr 16) and 0xFF, (this shr 8) and 0xFF, this and 0xFF)

    @Test
    fun `les couleurs de la source sortent en ARGB opaque, plans planaires ou entrelaces`() {
        listOf(1, 2).forEach { stride ->
            val out = YuvFrameConverter.convert(halves(stride), rotationDegrees = 0, maxLongSide = 4)
            assertThat(out.width).isEqualTo(4)
            assertThat(out.height).isEqualTo(2)
            val left = out.pixels[0]
            val right = out.pixels[3]
            assertThat(left ushr 24).isEqualTo(0xFF)
            assertThat(left.rgb().first).isGreaterThan(240)
            assertThat(left.rgb().third).isLessThan(20)
            assertThat(right.rgb().third).isGreaterThan(200)
            assertThat(right.rgb().first).isLessThan(40)
        }
    }

    @Test
    fun `une video tournee d un quart de tour sort debout`() {
        val out = YuvFrameConverter.convert(halves(1), rotationDegrees = 90, maxLongSide = 4)

        assertThat(out.width).isEqualTo(2)
        assertThat(out.height).isEqualTo(4)
        assertThat(out.pixels[0].rgb().first).isGreaterThan(240)
        assertThat(out.pixels[out.pixels.size - 1].rgb().third).isGreaterThan(200)
    }

    @Test
    fun `la conversion se fait a la taille peinte, sans agrandir`() {
        val big = YuvPlanes(
            width = 1920, height = 1080,
            y = ByteArray(1920 * 1080) { 81 }, yRowStride = 1920, yPixelStride = 1,
            u = ByteArray(960 * 540) { 90 }, uRowStride = 960, uPixelStride = 1,
            v = ByteArray(960 * 540) { 240.toByte() }, vRowStride = 960, vPixelStride = 1,
        )

        val reduced = YuvFrameConverter.convert(big, rotationDegrees = 0, maxLongSide = 960)
        val kept = YuvFrameConverter.convert(halves(1), rotationDegrees = 0, maxLongSide = 960)

        assertThat(reduced.width).isEqualTo(960)
        assertThat(reduced.height).isEqualTo(540)
        assertThat(reduced.pixels.size).isEqualTo(960 * 540)
        assertThat(kept.width).isEqualTo(4)
    }
}
