package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallVideoNotice
import me.meeshy.sdk.model.call.ThermalState
import org.junit.Test

class CallVideoHealthImplTest {

    @Test
    fun `a survival freeze is observable and released with the link`() {
        val health = CallVideoHealthImpl()
        health.setAutoPaused(true)
        assertThat(health.isVideoAutoPaused.value).isTrue()
        health.setAutoPaused(false)
        assertThat(health.isVideoAutoPaused.value).isFalse()
    }

    @Test
    fun `serious heat reduces the video and degrades the effects`() {
        val health = CallVideoHealthImpl()
        val seen = mutableListOf<Boolean>()
        health.onEffectsDegradedChanged = { seen += it }
        health.setThermal(ThermalState.SERIOUS)
        assertThat(health.videoNotice.value).isEqualTo(CallVideoNotice.Reduced)
        assertThat(health.effectsDegraded.value).isTrue()
        health.setThermal(ThermalState.NOMINAL)
        assertThat(health.effectsDegraded.value).isFalse()
        assertThat(seen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `low light alone shows the light notice and keeps the effects`() {
        val health = CallVideoHealthImpl()
        health.setLowLight(true)
        assertThat(health.videoNotice.value).isEqualTo(CallVideoNotice.LowLight)
        assertThat(health.effectsDegraded.value).isFalse()
    }

    @Test
    fun `reset forgets everything at the end of the call`() {
        val health = CallVideoHealthImpl()
        health.setAutoPaused(true)
        health.setThermal(ThermalState.CRITICAL)
        health.reset()
        assertThat(health.isVideoAutoPaused.value).isFalse()
        assertThat(health.videoNotice.value).isEqualTo(CallVideoNotice.None)
        assertThat(health.effectsDegraded.value).isFalse()
    }
}
