package me.meeshy.app.calls

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.ui.component.FeedbackKind
import org.junit.Test

/**
 * Behavioural spec of the local-action toast bus: a toast posted from outside the
 * UI reaches the host with its severity, waits for a host that is not there yet,
 * and the same text is not repeated within two seconds.
 */
class CallToastBusTest {

    private var nowMs = 10_000L
    private val clock = object : CallClock {
        override fun nowMs(): Long = nowMs
    }

    private fun bus() = CallToastBus(clock)

    @Test
    fun `a posted toast reaches the host with its severity`() = runTest {
        val bus = bus()

        bus.toasts.test {
            bus.error("Recording failed")
            bus.success("Captions on")
            bus.info("Recording started")

            assertThat(awaitItem()).isEqualTo(CallToast("Recording failed", FeedbackKind.Error))
            assertThat(awaitItem()).isEqualTo(CallToast("Captions on", FeedbackKind.Success))
            assertThat(awaitItem()).isEqualTo(CallToast("Recording started", FeedbackKind.Info))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a toast posted before any host collects is not lost`() = runTest {
        val bus = bus()

        bus.error("Screen share unavailable")

        bus.toasts.test {
            assertThat(awaitItem().message).isEqualTo("Screen share unavailable")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the same text is not repeated within two seconds`() = runTest {
        val bus = bus()

        val first = bus.error("Recording failed")
        nowMs += 1_999
        val second = bus.error("Recording failed")

        assertThat(first).isTrue()
        assertThat(second).isFalse()
        bus.toasts.test {
            assertThat(awaitItem().message).isEqualTo("Recording failed")
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `the same text comes back once the window has elapsed`() = runTest {
        val bus = bus()

        bus.error("Recording failed")
        nowMs += CallToastBus.DEDUPE_WINDOW_MS
        val again = bus.error("Recording failed")

        assertThat(again).isTrue()
        bus.toasts.test {
            assertThat(awaitItem().message).isEqualTo("Recording failed")
            assertThat(awaitItem().message).isEqualTo("Recording failed")
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a different text is never deduplicated against another`() = runTest {
        val bus = bus()

        val a = bus.info("Captions on")
        val b = bus.info("Captions off")

        assertThat(a).isTrue()
        assertThat(b).isTrue()
    }

    @Test
    fun `a blank text is not a toast`() = runTest {
        val bus = bus()

        assertThat(bus.info("")).isFalse()
        assertThat(bus.info("   ")).isFalse()
        bus.toasts.test {
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a burst without a host keeps the most recent toasts and stays bounded`() = runTest {
        val bus = bus()

        repeat(20) { index -> bus.info("news $index") }

        bus.toasts.test {
            val received = List(8) { awaitItem().message }
            assertThat(received.first()).isEqualTo("news 12")
            assertThat(received.last()).isEqualTo("news 19")
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }
}
