package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.CallStateMachine
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallWatchdogsReliabilityTest {
    private val signals: CallSignalManager = mockk(relaxed = true)
    private val budget = MutableSharedFlow<Unit>()

    private class Host(
        override val scope: CoroutineScope,
        override val isGroupCall: Boolean = false,
        attempt: Int = 1,
    ) : CallSessionHost {
        override var callState: CallState = CallState.Reconnecting(attempt)
        override val config: CallConfig = CallConfig.EMPTY
        override val callId = "call-1"
        override val selfId = "me"
        override val elapsedSeconds = 0L
        var restarts = 0
        val events = mutableListOf<CallEvent>()
        override fun dispatch(event: CallEvent) {
            events += event
            callState = CallStateMachine.reduce(callState, event)
        }
        override fun endMedia() = Unit
        override fun restartMediaIce() { restarts += 1 }
        override fun publish() = Unit
    }

    private fun controller(backoff: CallRestartBackoff) = CallWatchdogsController(
        signals,
        object : CallHeartbeatTicker { override val beats: Flow<Unit> = emptyFlow() },
        object : CallReconnectBudget { override fun countdown(): Flow<Unit> = budget },
        object : CallConnectingWatchdog { override fun countdown(): Flow<Unit> = emptyFlow() },
        backoff,
    )

    @Test
    fun `an overrun attempt of a peer already connected catches up instead of burning the budget`() = runTest {
        val host = Host(backgroundScope)
        val controller = controller(CallRestartBackoff.None)
        var caughtUp = 0
        controller.attach(host) { caughtUp += 1; true }
        controller.onTransition(host.callState)
        runCurrent()

        budget.emit(Unit)

        assertThat(caughtUp).isEqualTo(1)
        assertThat(host.events).isEmpty()
        assertThat(host.restarts).isEqualTo(0)
    }

    @Test
    fun `the next attempt restarts ICE only after its exponential backoff`() = runTest {
        val host = Host(backgroundScope)
        val controller = controller { attempt -> if (attempt == 2) 2_000L else 0L }
        controller.attach(host)
        controller.onTransition(host.callState)
        runCurrent()

        budget.emit(Unit)
        assertThat(host.callState).isEqualTo(CallState.Reconnecting(2))
        assertThat(host.restarts).isEqualTo(0)

        advanceTimeBy(1_999)
        runCurrent()
        assertThat(host.restarts).isEqualTo(0)

        advanceTimeBy(1)
        runCurrent()
        assertThat(host.restarts).isEqualTo(1)
    }

    @Test
    fun `a recovery during the backoff cancels the pending restart`() = runTest {
        val host = Host(backgroundScope)
        val controller = controller { 2_000L }
        controller.attach(host)
        controller.onTransition(host.callState)
        runCurrent()
        budget.emit(Unit)

        host.dispatch(CallEvent.MediaConnected)
        controller.onTransition(host.callState)
        advanceTimeBy(5_000)
        runCurrent()

        assertThat(host.restarts).isEqualTo(0)
    }

    @Test
    fun `the reconnect ceiling of a group call leaves it instead of ending it for everyone`() = runTest {
        val host = Host(backgroundScope, isGroupCall = true, attempt = 99)
        val controller = controller(CallRestartBackoff.None)
        controller.attach(host)
        controller.onTransition(host.callState)
        runCurrent()

        budget.emit(Unit)

        assertThat(host.callState).isInstanceOf(CallState.Ended::class.java)
        verify(exactly = 1) { signals.emitLeave("call-1") }
        verify(exactly = 0) { signals.emitEnd(any(), any()) }
    }

    @Test
    fun `the reconnect ceiling of a direct call still ends it`() = runTest {
        val host = Host(backgroundScope, isGroupCall = false, attempt = 99)
        val controller = controller(CallRestartBackoff.None)
        controller.attach(host)
        controller.onTransition(host.callState)
        runCurrent()

        budget.emit(Unit)

        verify(exactly = 1) { signals.emitEnd("call-1", any()) }
        verify(exactly = 0) { signals.emitLeave(any()) }
    }
}
