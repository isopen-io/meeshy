package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallRingGuardControllerTest {
    private val signals: CallSignalManager = mockk(relaxed = true)

    private class Host(override val scope: CoroutineScope, start: CallState) : CallSessionHost {
        override var callState: CallState = start
        override val config: CallConfig = CallConfig.EMPTY
        override var callId = "call-1"
        override val selfId = "me"
        override val elapsedSeconds = 0L
        var mediaEnded = 0
        override fun dispatch(event: CallEvent) {
            callState = CallStateMachine.reduce(callState, event)
        }
        override fun endMedia() { mediaEnded += 1 }
        override fun restartMediaIce() = Unit
        override fun publish() = Unit
    }

    private fun armed(host: Host) = CallRingGuardController(signals).also {
        it.attach(host)
        it.onTransition(host.callState)
    }

    @Test
    fun `an outgoing call nobody answers ends as missed after 45 seconds and the gateway is told`() = runTest {
        val host = Host(backgroundScope, CallState.Ringing(isOutgoing = true))
        armed(host)
        runCurrent()

        advanceTimeBy(44_999)
        runCurrent()
        assertThat(host.callState).isEqualTo(CallState.Ringing(isOutgoing = true))

        advanceTimeBy(1)
        runCurrent()
        assertThat(host.callState).isEqualTo(CallState.Ended(CallEndReason.Missed))
        assertThat(host.mediaEnded).isEqualTo(1)
        verify { signals.emitEnd("call-1") }
    }

    @Test
    fun `an incoming call whose end was lost ends as missed after 75 seconds without ending the callers call`() = runTest {
        val host = Host(backgroundScope, CallState.Ringing(isOutgoing = false))
        armed(host)
        runCurrent()

        advanceTimeBy(74_999)
        runCurrent()
        assertThat(host.callState).isEqualTo(CallState.Ringing(isOutgoing = false))

        advanceTimeBy(1)
        runCurrent()
        assertThat(host.callState).isEqualTo(CallState.Ended(CallEndReason.Missed))
        verify(exactly = 0) { signals.emitEnd(any(), any()) }
    }

    @Test
    fun `ringing then offering is one continuous window`() = runTest {
        val host = Host(backgroundScope, CallState.Ringing(isOutgoing = true))
        val guard = armed(host)
        runCurrent()
        advanceTimeBy(30_000)

        host.dispatch(CallEvent.ParticipantJoined())
        guard.onTransition(host.callState)
        advanceTimeBy(15_000)
        runCurrent()

        assertThat(host.callState).isEqualTo(CallState.Ended(CallEndReason.Missed))
    }

    @Test
    fun `an answer disarms the guard`() = runTest {
        val host = Host(backgroundScope, CallState.Offering)
        val guard = armed(host)
        runCurrent()

        host.dispatch(CallEvent.RemoteAnswer)
        guard.onTransition(host.callState)
        advanceTimeBy(200_000)
        runCurrent()

        assertThat(host.callState).isEqualTo(CallState.Connecting)
        verify(exactly = 0) { signals.emitEnd(any(), any()) }
    }

    @Test
    fun `a reset forgets the guard of the previous call`() = runTest {
        val host = Host(backgroundScope, CallState.Ringing(isOutgoing = true))
        val guard = armed(host)
        runCurrent()

        guard.reset()
        advanceTimeBy(100_000)
        runCurrent()

        assertThat(host.callState).isEqualTo(CallState.Ringing(isOutgoing = true))
    }
}
