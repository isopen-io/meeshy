package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallThermalPlanTest {

    @Test
    fun `nominal keeps 30 fps 1280x720 and the advanced effects`() {
        val plan = CallThermalPlan.forState(ThermalState.NOMINAL)
        assertThat(plan.maxFps).isEqualTo(30)
        assertThat(plan.maxWidth).isEqualTo(1280)
        assertThat(plan.maxHeight).isEqualTo(720)
        assertThat(plan.videoAllowed).isTrue()
        assertThat(plan.advancedEffectsAllowed).isTrue()
    }

    @Test
    fun `fair caps at 24 fps 960x540`() {
        val plan = CallThermalPlan.forState(ThermalState.FAIR)
        assertThat(plan.maxFps).isEqualTo(24)
        assertThat(plan.maxWidth).isEqualTo(960)
        assertThat(plan.maxHeight).isEqualTo(540)
        assertThat(plan.advancedEffectsAllowed).isTrue()
    }

    @Test
    fun `serious caps at 15 fps 640x360 and switches the advanced effects off`() {
        val plan = CallThermalPlan.forState(ThermalState.SERIOUS)
        assertThat(plan.maxFps).isEqualTo(15)
        assertThat(plan.maxWidth).isEqualTo(640)
        assertThat(plan.maxHeight).isEqualTo(360)
        assertThat(plan.videoAllowed).isTrue()
        assertThat(plan.advancedEffectsAllowed).isFalse()
    }

    @Test
    fun `critical cuts the video`() {
        val plan = CallThermalPlan.forState(ThermalState.CRITICAL)
        assertThat(plan.videoAllowed).isFalse()
        assertThat(plan.maxFps).isEqualTo(0)
        assertThat(plan.advancedEffectsAllowed).isFalse()
    }

    @Test
    fun `android thermal statuses reach the matching plan`() {
        assertThat(CallThermalPlan.forState(ThermalState.fromAndroidThermalStatus(0)).maxFps).isEqualTo(30)
        assertThat(CallThermalPlan.forState(ThermalState.fromAndroidThermalStatus(2)).maxFps).isEqualTo(24)
        assertThat(CallThermalPlan.forState(ThermalState.fromAndroidThermalStatus(3)).maxFps).isEqualTo(15)
        assertThat(CallThermalPlan.forState(ThermalState.fromAndroidThermalStatus(5)).videoAllowed).isFalse()
    }

    @Test
    fun `the notice is quiet on a cool device in good light`() {
        assertThat(CallVideoNotice.of(ThermalState.NOMINAL, isLowLight = false)).isEqualTo(CallVideoNotice.None)
        assertThat(CallVideoNotice.of(ThermalState.FAIR, isLowLight = false)).isEqualTo(CallVideoNotice.None)
    }

    @Test
    fun `serious heat says the video is reduced even in the dark`() {
        assertThat(CallVideoNotice.of(ThermalState.SERIOUS, isLowLight = false)).isEqualTo(CallVideoNotice.Reduced)
        assertThat(CallVideoNotice.of(ThermalState.SERIOUS, isLowLight = true)).isEqualTo(CallVideoNotice.Reduced)
    }

    @Test
    fun `low light alone says the light is insufficient`() {
        assertThat(CallVideoNotice.of(ThermalState.NOMINAL, isLowLight = true)).isEqualTo(CallVideoNotice.LowLight)
    }

    @Test
    fun `effects are degraded only when the plan forbids them or the filters latched off`() {
        assertThat(CallThermalPlan.effectsDegraded(ThermalState.NOMINAL, filtersLatchedOff = false)).isFalse()
        assertThat(CallThermalPlan.effectsDegraded(ThermalState.SERIOUS, filtersLatchedOff = false)).isTrue()
        assertThat(CallThermalPlan.effectsDegraded(ThermalState.NOMINAL, filtersLatchedOff = true)).isTrue()
    }
}
