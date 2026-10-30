package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import kotlin.math.PI
import kotlin.math.hypot
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint
import org.junit.Test

/** Où l'auréole et les cornes se posent sur le visage suivi, et comment elles suivent la tête qui penche. */
class CallFaceOrnamentsTest {
    private val box = FaceBox(100f, 200f, 200f, 260f)
    private val level = CallFaceLandmarks(box, FacePoint(160f, 300f), FacePoint(240f, 300f))

    @Test
    fun `tete droite, l aureole et les cornes tombent la ou iOS les pose`() {
        val halo = CallFaceOrnaments.halo(level)
        val rect = CallFaceEffectGeometry.haloRect(box)
        assertThat(halo.centerX).isWithin(1e-3f).of(rect.midX)
        assertThat(halo.centerY).isWithin(1e-3f).of(rect.midY)
        assertThat(halo.width).isEqualTo(rect.width)
        assertThat(halo.height).isEqualTo(rect.height)
        assertThat(halo.angle).isEqualTo(0f)
        assertThat(halo.mirrored).isFalse()

        val horns = CallFaceOrnaments.horns(level)
        val rects = CallFaceEffectGeometry.hornRects(box)
        horns.zip(rects).forEach { (horn, rect) ->
            assertThat(horn.centerX).isWithin(1e-3f).of(rect.midX)
            assertThat(horn.centerY).isWithin(1e-3f).of(rect.midY)
        }
        assertThat(horns.map { it.mirrored }).containsExactly(false, true).inOrder()
    }

    @Test
    fun `tete penchee, les ornements tournent autour du visage du meme angle`() {
        val tilted = CallFaceLandmarks(box, FacePoint(160f, 290f), FacePoint(240f, 310f))
        val angle = CallFaceOrnaments.tilt(tilted)
        assertThat(angle).isWithin(1e-4f).of(kotlin.math.atan2(20f, 80f))

        val halo = CallFaceOrnaments.halo(tilted)
        val rect = CallFaceEffectGeometry.haloRect(box)
        assertThat(halo.angle).isEqualTo(angle)
        assertThat(hypot(halo.centerX - box.midX, halo.centerY - box.midY))
            .isWithin(1e-3f).of(hypot(rect.midX - box.midX, rect.midY - box.midY))
        assertThat(halo.centerX).isGreaterThan(box.midX)
    }

    @Test
    fun `sans les deux yeux la tete est droite, et l inclinaison plafonne a 45 degres`() {
        assertThat(CallFaceOrnaments.tilt(CallFaceLandmarks(box))).isEqualTo(0f)
        val steep = CallFaceLandmarks(box, FacePoint(150f, 200f), FacePoint(151f, 400f))
        assertThat(CallFaceOrnaments.tilt(steep)).isWithin(1e-5f).of((PI / 4).toFloat())
    }
}
