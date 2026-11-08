package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OutboxDrainTriggersTest {

    @Test
    fun `the rising edge of the network drains once, after the settle delay`() = runTest {
        var drains = 0
        val online = MutableStateFlow(false)
        val jobs = OutboxDrainTriggers(MutableStateFlow(false), online, MutableSharedFlow(), { drains++ }).start(backgroundScope)
        runCurrent()

        online.value = true
        runCurrent()
        assertThat(drains).isEqualTo(0)
        advanceTimeBy(OutboxDrainTriggers.SETTLE_MS + 1)
        runCurrent()

        assertThat(drains).isEqualTo(1)
        jobs.forEach { it.cancel() }
    }

    @Test
    fun `the socket coming back drains and an already connected socket does not`() = runTest {
        var drains = 0
        val socket = MutableStateFlow(true)
        OutboxDrainTriggers(socket, MutableStateFlow(true), MutableSharedFlow(), { drains++ }).start(backgroundScope)
        runCurrent()
        advanceTimeBy(1_000)
        assertThat(drains).isEqualTo(0)

        socket.value = false
        runCurrent()
        socket.value = true
        runCurrent()
        advanceTimeBy(OutboxDrainTriggers.SETTLE_MS + 1)
        runCurrent()

        assertThat(drains).isEqualTo(1)
    }

    @Test
    fun `a burst of enqueues drains once after the 250 ms debounce`() = runTest {
        var drains = 0
        val enqueued = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        OutboxDrainTriggers(MutableStateFlow(true), MutableStateFlow(true), enqueued, { drains++ }).start(backgroundScope)
        runCurrent()

        repeat(3) { enqueued.tryEmit(Unit); advanceTimeBy(100) }
        advanceTimeBy(OutboxDrainTriggers.ENQUEUE_DEBOUNCE_MS + 1)
        runCurrent()

        assertThat(drains).isEqualTo(1)
    }

    @Test
    fun `the foreground drains`() {
        var drains = 0

        OutboxDrainTriggers(MutableStateFlow(true), MutableStateFlow(true), MutableSharedFlow(), { drains++ }).onForeground()

        assertThat(drains).isEqualTo(1)
    }
}
