package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * G1.11 · G2.8 — the first touch STOWS the chrome toward its edges and the second brings it back the other way: nothing
 * appears or vanishes at once, only the transform and the opacity move, and « Reduce animations » turns it into a short
 * fade with no displacement. Mirrors iOS `CallChromeStow`.
 */
class CallChromeStowTest {
    @Test
    fun `a stowed element leaves by its edge, unless animations are reduced`() {
        assertThat(CallChromeStow.leavesByItsEdge(isVisible = false, reduceMotion = false)).isTrue()
        assertThat(CallChromeStow.leavesByItsEdge(isVisible = false, reduceMotion = true)).isFalse()
        assertThat(CallChromeStow.leavesByItsEdge(isVisible = true, reduceMotion = false)).isFalse()
    }

    @Test
    fun `the fade is the chrome fade, and a short one with reduced animations`() {
        assertThat(CallChromeStow.fadeMillis(reduceMotion = false)).isEqualTo(250)
        assertThat(CallChromeStow.fadeMillis(reduceMotion = true)).isEqualTo(150)
    }

    @Test
    fun `an element travels its whole measured height plus its margin toward its edge`() {
        assertThat(CallChromeStow.travel(CallVerticalEdge.Bottom, extent = 300f, margin = 24f)).isEqualTo(324f)
        assertThat(CallChromeStow.travel(CallVerticalEdge.Top, extent = 60f, margin = 8f)).isEqualTo(-68f)
    }

    @Test
    fun `a height not measured yet counts for nothing, never a NaN`() {
        assertThat(CallChromeStow.travel(CallVerticalEdge.Bottom, extent = Float.NaN, margin = 24f)).isEqualTo(24f)
        assertThat(CallChromeStow.travel(CallVerticalEdge.Bottom, extent = -5f, margin = 24f)).isEqualTo(24f)
    }
}
