package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.slot
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

/**
 * #20010 — the analytics anchors read the MONOTONIC clock. The device below keeps both clocks: the wall one
 * jumps (NTP, manual change) while the monotonic one only advances, and the report must carry the monotonic
 * delta whatever the wall clock did between `start` and `connected`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallAnalyticsElapsedClockTest {

    private class FakeHost(override val scope: CoroutineScope) : CallSessionHost {
        override var callState: CallState = CallState.Connecting
        override val config: CallConfig = CallConfig.EMPTY
        override val callId = "call-20010"
        override val selfId = "me"
        override var elapsedSeconds = 0L
        override fun dispatch(event: CallEvent) = Unit
        override fun endMedia() = Unit
        override fun restartMediaIce() = Unit
        override fun publish() = Unit
    }

    private class DeviceTime(var elapsedMs: Long, var wallOffsetMs: Long) {
        val wall = object : CallClock {
            override fun nowMs(): Long = elapsedMs + wallOffsetMs
        }
        val elapsed = CallElapsedClock { elapsedMs }
    }

    private val signals: CallSignalManager = mockk(relaxed = true)

    private fun terminalReport(scope: CoroutineScope, wallJumpMs: Long): Map<String, Any> {
        val device = DeviceTime(elapsedMs = 120_000L, wallOffsetMs = 1_700_000_000_000L)
        val host = FakeHost(scope)
        val controller = CallAnalyticsController(
            signals, device.elapsed, InMemoryCallQualitySummaryStore(), silentAnalyticsSnapshots,
        )
        controller.attach(host)
        controller.begin()

        device.elapsedMs += 2_750L
        device.wallOffsetMs += wallJumpMs
        host.callState = CallState.Connected
        controller.onTransition(CallState.Connecting, CallState.Connected)

        device.elapsedMs += 61_000L
        device.wallOffsetMs -= wallJumpMs
        host.elapsedSeconds = 61L
        val ended = CallState.Ended(CallEndReason.Local)
        controller.onTransition(CallState.Connected, ended)
        host.callState = ended

        val fields = slot<Map<String, Any>>()
        verify(exactly = 1) { signals.emitAnalytics("call-20010", capture(fields)) }
        return fields.captured
    }

    @Test
    fun `a wall clock set back between start and connect leaves the setup time at the monotonic delta`() =
        runTest(UnconfinedTestDispatcher()) {
            val fields = terminalReport(backgroundScope, wallJumpMs = -3_600_000L)

            assertThat(fields["setupTimeMs"]).isEqualTo(2_750L)
            assertThat(fields["durationSeconds"]).isEqualTo(61L)
        }

    @Test
    fun `a wall clock pushed forward between start and connect leaves the setup time at the monotonic delta`() =
        runTest(UnconfinedTestDispatcher()) {
            val fields = terminalReport(backgroundScope, wallJumpMs = 3_600_000L)

            assertThat(fields["setupTimeMs"]).isEqualTo(2_750L)
            assertThat(fields["durationSeconds"]).isEqualTo(61L)
        }
}
