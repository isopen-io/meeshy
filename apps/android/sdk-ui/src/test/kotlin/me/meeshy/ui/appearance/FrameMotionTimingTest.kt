package me.meeshy.ui.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.FramePoint
import me.meeshy.sdk.model.appearance.FrameMotionStep
import me.meeshy.sdk.model.appearance.FrameStepDirection
import me.meeshy.sdk.model.appearance.FrameStepKind
import org.junit.Test

class FrameMotionTimingTest {

    private fun step(
        kind: FrameStepKind,
        direction: FrameStepDirection = FrameStepDirection.NORMAL,
        from: Double = 0.0,
        to: Double = 10.0,
        duration: Double = 4.0,
    ) = FrameMotionStep(kind, duration, 0.0, direction, from, to, linear = false, origin = FramePoint(0.0, 0.0))

    @Test
    fun `la valeur va de from a to`() {
        val rotate = step(FrameStepKind.ROTATE)
        assertThat(stepValue(rotate, 0f)).isEqualTo(0f)
        assertThat(stepValue(rotate, 0.5f)).isEqualTo(5f)
        assertThat(stepValue(rotate, 1f)).isEqualTo(10f)
    }

    @Test
    fun `un sens inverse echange from et to`() {
        val reversed = step(FrameStepKind.ROTATE, FrameStepDirection.REVERSE)
        assertThat(stepValue(reversed, 0f)).isEqualTo(10f)
        assertThat(stepValue(reversed, 1f)).isEqualTo(0f)
    }

    @Test
    fun `pulsation et scintillement vont et viennent en une demi-duree`() {
        listOf(FrameStepKind.PULSE, FrameStepKind.TWINKLE).forEach { kind ->
            val s = step(kind)
            assertThat(isAutoReversing(s)).isTrue()
            assertThat(stepDurationMillis(s)).isEqualTo(2000)
        }
    }

    @Test
    fun `une rotation normale recommence au lieu de revenir`() {
        val rotate = step(FrameStepKind.ROTATE)
        assertThat(isAutoReversing(rotate)).isFalse()
        assertThat(stepDurationMillis(rotate)).isEqualTo(4000)
    }

    @Test
    fun `une inclinaison alternee revient sur ses pas`() {
        assertThat(isAutoReversing(step(FrameStepKind.SKEW, FrameStepDirection.ALTERNATE))).isTrue()
        assertThat(isAutoReversing(step(FrameStepKind.SKEW, FrameStepDirection.ALTERNATE_REVERSE))).isTrue()
    }
}
