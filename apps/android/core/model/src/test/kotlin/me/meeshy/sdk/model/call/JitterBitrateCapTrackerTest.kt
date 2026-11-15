package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class JitterBitrateCapTrackerTest {
    private fun fold(vararg jitters: Double) =
        jitters.fold(JitterBitrateCapTracker()) { tracker, j -> tracker.record(j, thresholdMs = 30.0) }

    @Test
    fun `une rafale isolée ne plafonne pas`() {
        assertThat(fold(80.0).isCapped).isFalse()
    }

    @Test
    fun `deux ticks consécutifs au-dessus du seuil plafonnent`() {
        assertThat(fold(31.0, 45.0).isCapped).isTrue()
    }

    @Test
    fun `le seuil exact n'est pas dépassé et le premier tick calme lève le plafond`() {
        assertThat(fold(30.0, 30.0).isCapped).isFalse()
        assertThat(fold(40.0, 40.0, 10.0).isCapped).isFalse()
    }
}
