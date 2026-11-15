package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.ThermalState
import org.junit.Test

class ThermalStateMonitorTest {

    private class FakeSource(var status: Int = 0) : ThermalStatusSource {
        var listener: ((Int) -> Unit)? = null
        var registrations = 0
        override fun current(): Int = status
        override fun register(onChange: (Int) -> Unit): () -> Unit {
            registrations++
            listener = onChange
            return { listener = null }
        }
    }

    @Test
    fun `start reads the current platform status`() {
        val monitor = ThermalStateMonitor(FakeSource(status = 3))
        monitor.start()
        assertThat(monitor.state.value).isEqualTo(ThermalState.SERIOUS)
    }

    @Test
    fun `a cool device is nominal before any start`() {
        assertThat(ThermalStateMonitor(FakeSource(status = 4)).state.value).isEqualTo(ThermalState.NOMINAL)
    }

    @Test
    fun `platform changes are folded onto the four tiers`() {
        val source = FakeSource()
        val monitor = ThermalStateMonitor(source)
        monitor.start()
        source.listener!!.invoke(2)
        assertThat(monitor.state.value).isEqualTo(ThermalState.FAIR)
        source.listener!!.invoke(6)
        assertThat(monitor.state.value).isEqualTo(ThermalState.CRITICAL)
        source.listener!!.invoke(0)
        assertThat(monitor.state.value).isEqualTo(ThermalState.NOMINAL)
    }

    @Test
    fun `stop unsubscribes and a second start does not leak the first subscription`() {
        val source = FakeSource()
        val monitor = ThermalStateMonitor(source)
        monitor.start()
        monitor.start()
        assertThat(source.registrations).isEqualTo(2)
        monitor.stop()
        assertThat(source.listener).isNull()
    }
}
