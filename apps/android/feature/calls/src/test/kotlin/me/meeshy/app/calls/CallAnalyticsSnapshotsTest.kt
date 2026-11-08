package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallAnalytics
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

/** The snapshot cadence the call screens' suites inject: none, so no periodic job outlives a test. */
internal val silentAnalyticsSnapshots = object : CallAnalyticsSnapshotTicker {
    override val beats: Flow<Unit> = emptyFlow()
}

@OptIn(ExperimentalCoroutinesApi::class)
class CallAnalyticsSnapshotsTest {

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

    private val signals: CallSignalManager = mockk(relaxed = true)
    private val beats = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    private val ticker = object : CallAnalyticsSnapshotTicker {
        override val beats: Flow<Unit> = this@CallAnalyticsSnapshotsTest.beats
    }
    private val clock = object : CallClock {
        override fun nowMs(): Long = 0L
    }

    private fun connected(host: FakeHost) = CallAnalyticsController(
        signals, clock, InMemoryCallQualitySummaryStore(), ticker,
    ).apply {
        attach(host)
        begin()
        host.callState = CallState.Connected
        onTransition(CallState.Connecting, CallState.Connected)
    }

    @Test
    fun `a connected call sends one in-progress snapshot per beat, and none once it ended`() =
        runTest(UnconfinedTestDispatcher()) {
            val host = FakeHost(backgroundScope)
            val controller = connected(host)

            beats.emit(Unit)
            beats.emit(Unit)
            val fields = mutableListOf<Map<String, Any>>()
            verify(exactly = 2) { signals.emitAnalytics("call-1", capture(fields)) }
            assertThat(fields.map { it["endReason"] }).containsExactly(CallAnalytics.IN_PROGRESS_WIRE, CallAnalytics.IN_PROGRESS_WIRE)

            host.callState = CallState.Ended(CallEndReason.Local)
            controller.onTransition(CallState.Connected, host.callState)
            beats.emit(Unit)

            verify(exactly = 3) { signals.emitAnalytics("call-1", any()) }
        }

    @Test
    fun `a reconnecting call skips the window`() = runTest(UnconfinedTestDispatcher()) {
        val host = FakeHost(backgroundScope)
        connected(host)

        host.callState = CallState.Reconnecting(attempt = 1)
        beats.emit(Unit)

        verify(exactly = 0) { signals.emitAnalytics(any(), any()) }
    }
}
