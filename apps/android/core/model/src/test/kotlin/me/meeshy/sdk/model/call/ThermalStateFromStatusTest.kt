package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the pure device-thermal collapse — the glue-free half of
 * the Android port of iOS `ThermalStateMonitor`. It folds the seven raw
 * `PowerManager.THERMAL_STATUS_*` integers (`NONE`(0) … `SHUTDOWN`(6)) into the four
 * [ThermalState] tiers the [VideoSenderCapPlan] already consumes, so the mapping is
 * unit-tested on the JVM and the `:app` layer only forwards
 * `PowerManager.getCurrentThermalStatus()`.
 *
 * The collapse is deliberately **monotonic and clamped at both ends**: an absent /
 * sub-`NONE` reading never punishes a cool device, and any tier at or above
 * `CRITICAL`(4) — including `EMERGENCY`(5), `SHUTDOWN`(6), and any future higher
 * value — sheds the most encode load rather than being mistaken for cool.
 */
class ThermalStateFromStatusTest {

    // --- the seven documented Android thermal tiers ----------------------------

    @Test
    fun `NONE maps to NOMINAL so a cool device keeps full quality`() {
        assertThat(ThermalState.fromAndroidThermalStatus(0)).isEqualTo(ThermalState.NOMINAL)
    }

    @Test
    fun `LIGHT maps to FAIR`() {
        assertThat(ThermalState.fromAndroidThermalStatus(1)).isEqualTo(ThermalState.FAIR)
    }

    @Test
    fun `MODERATE maps to FAIR because UX is not yet largely impacted`() {
        assertThat(ThermalState.fromAndroidThermalStatus(2)).isEqualTo(ThermalState.FAIR)
    }

    @Test
    fun `SEVERE maps to SERIOUS`() {
        assertThat(ThermalState.fromAndroidThermalStatus(3)).isEqualTo(ThermalState.SERIOUS)
    }

    @Test
    fun `CRITICAL maps to CRITICAL`() {
        assertThat(ThermalState.fromAndroidThermalStatus(4)).isEqualTo(ThermalState.CRITICAL)
    }

    @Test
    fun `EMERGENCY collapses into the CRITICAL tier`() {
        assertThat(ThermalState.fromAndroidThermalStatus(5)).isEqualTo(ThermalState.CRITICAL)
    }

    @Test
    fun `SHUTDOWN collapses into the CRITICAL tier`() {
        assertThat(ThermalState.fromAndroidThermalStatus(6)).isEqualTo(ThermalState.CRITICAL)
    }

    // --- clamping at both ends (SOTA hardening over a bare when-else) -----------

    @Test
    fun `a future tier above SHUTDOWN clamps to CRITICAL not NOMINAL`() {
        assertThat(ThermalState.fromAndroidThermalStatus(7)).isEqualTo(ThermalState.CRITICAL)
        assertThat(ThermalState.fromAndroidThermalStatus(99)).isEqualTo(ThermalState.CRITICAL)
    }

    @Test
    fun `an invalid negative reading is treated as an absent signal, not a hot device`() {
        assertThat(ThermalState.fromAndroidThermalStatus(-1)).isEqualTo(ThermalState.NOMINAL)
        assertThat(ThermalState.fromAndroidThermalStatus(Int.MIN_VALUE)).isEqualTo(ThermalState.NOMINAL)
    }

    // --- the collapse is monotonic: hotter status never yields a cooler tier ----

    @Test
    fun `the mapping is monotonic non-decreasing across the raw status range`() {
        val tierOrder = ThermalState.entries.withIndex().associate { (index, state) -> state to index }
        val ranks = (0..6).map { status ->
            tierOrder.getValue(ThermalState.fromAndroidThermalStatus(status))
        }
        ranks.zipWithNext().forEach { (cooler, hotter) ->
            assertThat(hotter).isAtLeast(cooler)
        }
    }

    // --- it composes with the plan the mapping exists to feed ------------------

    @Test
    fun `a SHUTDOWN reading feeds the plan the same worst-case ceiling as CRITICAL`() {
        val fromRaw = VideoSenderCapPlan.forConditions(
            VideoQualityLevel.EXCELLENT,
            ThermalState.fromAndroidThermalStatus(6),
        )
        val fromEnum = VideoSenderCapPlan.forConditions(VideoQualityLevel.EXCELLENT, ThermalState.CRITICAL)
        assertThat(fromRaw).isEqualTo(fromEnum)
    }
}
