package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallAnalyticsSetupTimeTest {

    private class FakeHost(override val scope: CoroutineScope) : CallSessionHost {
        override var callState: CallState = CallState.Connecting
        override val config: CallConfig = CallConfig.EMPTY
        override val callId = "call-1"
        override val selfId = "me"
        override val elapsedSeconds = 42L
        override fun dispatch(event: CallEvent) = Unit
        override fun endMedia() = Unit
        override fun restartMediaIce() = Unit
        override fun publish() = Unit
    }

    private class SteppedClock(var wallMs: Long, var monotonicMs: Long) : CallClock {
        override fun nowMs(): Long = wallMs
        override fun elapsedMs(): Long = monotonicMs
    }

    @Test
    fun `setup time is measured on the monotonic clock when the wall clock jumps back an hour`() =
        runTest(UnconfinedTestDispatcher()) {
            val signals: CallSignalManager = mockk(relaxed = true)
            val clock = SteppedClock(wallMs = 1_800_000_000_000L, monotonicMs = 50_000L)
            val host = FakeHost(backgroundScope)
            val controller = CallAnalyticsController(
                signals, clock, InMemoryCallQualitySummaryStore(), silentAnalyticsSnapshots,
            ).apply { attach(host) }

            controller.begin()
            clock.wallMs -= ONE_HOUR_MS
            clock.monotonicMs += 1_500L
            host.callState = CallState.Connected
            controller.onTransition(CallState.Connecting, CallState.Connected)
            host.callState = CallState.Ended(CallEndReason.Local)
            controller.onTransition(CallState.Connected, host.callState)

            val fields = mutableListOf<Map<String, Any>>()
            verify(exactly = 1) { signals.emitAnalytics("call-1", capture(fields)) }
            assertThat(fields.single()["setupTimeMs"]).isEqualTo(1_500L)
        }

    private companion object {
        const val ONE_HOUR_MS = 3_600_000L
    }
}
