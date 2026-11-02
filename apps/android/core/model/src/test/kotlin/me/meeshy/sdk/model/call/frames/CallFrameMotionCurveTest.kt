package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameMotionCurveTest {
    private val pose = CallFrameMotionPose()

    private fun track(style: CallFrameMotionStyle, repeats: Boolean = true) =
        CallFrameMotionTrack(0, CallFrameOrnament(CallFrameOrnamentKind.SNOW, "#FFF", CallFrameDensity.MID, CallFrameLayer.FRONT), style, repeats)

    private fun at(style: CallFrameMotionStyle, t: Double, index: Int = 0, repeats: Boolean = true): CallFrameMotionPose {
        CallFrameMotionCurve.sample(track(style, repeats), index, t, height = 1000.0, unit = 500.0, into = pose)
        return pose
    }

    @Test
    fun `une chute parcourt la hauteur de la toile en une periode, puis recommence`() {
        assertThat(at(CallFrameMotionStyle.Fall(10.0), 0.0).dy).isWithin(1e-9).of(0.0)
        assertThat(at(CallFrameMotionStyle.Fall(10.0), 5.0).dy).isWithin(1e-9).of(500.0)
        assertThat(at(CallFrameMotionStyle.Fall(10.0), 12.5).dy).isWithin(1e-9).of(250.0)
        assertThat(at(CallFrameMotionStyle.Rise(10.0), 5.0).dy).isWithin(1e-9).of(-500.0)
    }

    @Test
    fun `un scintillement s eteint a mi-periode et ses groupes sont decales`() {
        assertThat(at(CallFrameMotionStyle.Twinkle(2.0), 0.0).alpha).isWithin(1e-9).of(1.0)
        assertThat(at(CallFrameMotionStyle.Twinkle(2.0), 1.0).alpha).isWithin(1e-9).of(0.2)
        val first = at(CallFrameMotionStyle.Twinkle(2.0), 0.4, index = 0).alpha
        val second = at(CallFrameMotionStyle.Twinkle(2.0), 0.4, index = 1).alpha
        assertThat(first).isNotEqualTo(second)
    }

    @Test
    fun `le rec clignote net, une moitie allume une moitie eteint`() {
        assertThat(at(CallFrameMotionStyle.Blink, 0.3).alpha).isEqualTo(1.0)
        assertThat(at(CallFrameMotionStyle.Blink, 0.9).alpha).isEqualTo(0.0)
    }

    @Test
    fun `un balancement reste dans son amplitude et une rotation fait un tour par periode`() {
        (0..40).map { it * 0.2 }.forEach { t ->
            assertThat(at(CallFrameMotionStyle.Sway(0.06, 8.0), t).rotation).isIn(com.google.common.collect.Range.closed(-0.06, 0.06))
            assertThat(at(CallFrameMotionStyle.Bob(0.01, 2.0), t).dy).isIn(com.google.common.collect.Range.closed(-5.0, 5.0))
        }
        assertThat(at(CallFrameMotionStyle.Spin(40.0), 10.0).rotation).isWithin(1e-9).of(Math.PI / 2)
    }

    @Test
    fun `un eclair reste eteint hors de son eclat`() {
        assertThat(at(CallFrameMotionStyle.Flash, 1.0).alpha).isWithin(1e-9).of(0.0)
        assertThat(at(CallFrameMotionStyle.Flash, 4.5 * 0.64).alpha).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `une entree apparait en glissant puis reste a sa place`() {
        val start = at(CallFrameMotionStyle.Fall(9.0), 0.0, repeats = false)
        assertThat(start.alpha).isWithin(1e-9).of(0.0)
        assertThat(start.dy).isWithin(1e-9).of(20.0)
        val settled = at(CallFrameMotionStyle.Fall(9.0), 30.0, repeats = false)
        assertThat(settled.alpha).isEqualTo(1.0)
        assertThat(settled.dy).isEqualTo(0.0)
    }

    @Test
    fun `la pose est remise a zero a chaque echantillon`() {
        at(CallFrameMotionStyle.Jitter, 0.2)
        val after = at(CallFrameMotionStyle.Twinkle(2.0), 0.0)
        assertThat(after.dx).isEqualTo(0.0)
    }
}
