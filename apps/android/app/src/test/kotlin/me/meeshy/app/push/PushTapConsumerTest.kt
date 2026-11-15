package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PushTapConsumerTest {

    private class Rig(val bus: PushInteractionBus, val calls: MutableList<String>, val consumer: PushTapConsumer)

    private fun rig(scope: CoroutineScope, failing: Boolean = false): Rig {
        val bus = PushInteractionBus()
        val calls = mutableListOf<String>()
        return Rig(bus, calls, PushTapConsumer(bus, { id -> calls += "read:$id"; if (failing) error("offline") }, scope))
    }

    @Test
    fun `l ouverture part sur le bus avant que la notification soit marquee lue`() = runTest {
        val rig = rig(CoroutineScope(UnconfinedTestDispatcher(testScheduler)))
        val order = mutableListOf<String>()
        val busCollector = launch(UnconfinedTestDispatcher(testScheduler)) {
            rig.bus.events.collect { order += "bus:${it::class.simpleName}" }
        }
        rig.consumer.onNavigated("n1")

        assertThat(order).containsExactly("bus:Opened")
        assertThat(rig.calls).containsExactly("read:n1")
        busCollector.cancel()
    }

    @Test
    fun `sans identifiant de notification rien n est marque lu`() = runTest {
        val rig = rig(CoroutineScope(UnconfinedTestDispatcher(testScheduler)))

        assertThat(rig.consumer.onNavigated(null)).isNull()
        assertThat(rig.consumer.onNavigated("  ")).isNull()
        assertThat(rig.calls).isEmpty()
    }

    @Test
    fun `un echec reseau ne remonte pas`() = runTest {
        val rig = rig(CoroutineScope(UnconfinedTestDispatcher(testScheduler)), failing = true)

        rig.consumer.onNavigated("n1")

        assertThat(rig.calls).containsExactly("read:n1")
    }
}
