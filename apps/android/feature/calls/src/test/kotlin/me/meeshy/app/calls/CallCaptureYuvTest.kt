package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Une image de piste WebRTC (I420, BT.601 plage limitée) devient des pixels ARGB, hors du fil principal,
 * avant d'être peinte dans le montage : le noir, le blanc et les primaires se retrouvent, les pas de ligne
 * (stride) plus larges que l'image sont respectés, et une image tournée d'un quart échange ses côtés.
 */
class CallCaptureYuvTest {

    private fun planes(width: Int, height: Int, y: Int, u: Int, v: Int, padding: Int = 0): CallCapturePlanes {
        val chromaW = (width + 1) / 2
        val chromaH = (height + 1) / 2
        return CallCapturePlanes(
            width = width,
            height = height,
            y = ByteArray((width + padding) * height) { y.toByte() },
            strideY = width + padding,
            u = ByteArray((chromaW + padding) * chromaH) { u.toByte() },
            strideU = chromaW + padding,
            v = ByteArray((chromaW + padding) * chromaH) { v.toByte() },
            strideV = chromaW + padding,
            rotation = 0,
        )
    }

    private fun channels(argb: Int) = listOf((argb ushr 24) and 0xFF, (argb shr 16) and 0xFF, (argb shr 8) and 0xFF, argb and 0xFF)

    private fun assertNear(argb: Int, r: Int, g: Int, b: Int) {
        val (a, rr, gg, bb) = channels(argb)
        assertThat(a).isEqualTo(255)
        assertThat(rr).isWithin(3).of(r)
        assertThat(gg).isWithin(3).of(g)
        assertThat(bb).isWithin(3).of(b)
    }

    @Test
    fun `le noir et le blanc video se retrouvent`() {
        assertNear(CallCaptureYuv.toArgb(planes(2, 2, 16, 128, 128)).first(), 0, 0, 0)
        assertNear(CallCaptureYuv.toArgb(planes(2, 2, 235, 128, 128)).first(), 255, 255, 255)
    }

    @Test
    fun `les primaires se retrouvent`() {
        assertNear(CallCaptureYuv.toArgb(planes(2, 2, 81, 90, 240)).first(), 255, 0, 0)
        assertNear(CallCaptureYuv.toArgb(planes(2, 2, 145, 54, 34)).first(), 0, 255, 0)
        assertNear(CallCaptureYuv.toArgb(planes(2, 2, 41, 240, 110)).first(), 0, 0, 255)
    }

    @Test
    fun `chaque pixel est rendu, meme avec un pas de ligne plus large et des cotes impaires`() {
        val argb = CallCaptureYuv.toArgb(planes(5, 3, 235, 128, 128, padding = 7))

        assertThat(argb).hasLength(15)
        argb.forEach { assertNear(it, 255, 255, 255) }
    }

    @Test
    fun `une image tournee d'un quart echange largeur et hauteur`() {
        assertThat(CallCaptureYuv.orientedSize(640, 480, rotation = 0)).isEqualTo(640 to 480)
        assertThat(CallCaptureYuv.orientedSize(640, 480, rotation = 90)).isEqualTo(480 to 640)
        assertThat(CallCaptureYuv.orientedSize(640, 480, rotation = 180)).isEqualTo(640 to 480)
        assertThat(CallCaptureYuv.orientedSize(640, 480, rotation = 270)).isEqualTo(480 to 640)
    }

    @Test
    fun `la reduction garde les proportions et ne grandit jamais`() {
        assertThat(CallCaptureYuv.scaledSize(1280, 720, maxDimension = 640)).isEqualTo(640 to 360)
        assertThat(CallCaptureYuv.scaledSize(320, 240, maxDimension = 640)).isEqualTo(320 to 240)
        assertThat(CallCaptureYuv.scaledSize(1280, 720, maxDimension = null)).isEqualTo(1280 to 720)
        assertThat(CallCaptureYuv.scaledSize(1279, 721, maxDimension = 640).toList().all { it % 2 == 0 }).isTrue()
    }
}
