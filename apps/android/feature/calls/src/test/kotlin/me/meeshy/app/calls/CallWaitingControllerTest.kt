package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallWaitingControllerTest {

    private class FakeHost(override val scope: CoroutineScope) : CallSessionHost {
        override val config = CallConfig.EMPTY
        override var callId = "active"
        override val selfId = "me"
        override var callState: CallState = CallState.Connected
        override val elapsedSeconds = 0L
        var publishes = 0
        override fun dispatch(event: CallEvent) = Unit
        override fun endMedia() = Unit
        override fun restartMediaIce() = Unit
        override fun publish() { publishes++ }
    }

    private class Rig(scope: TestScope) {
        val offers = MutableSharedFlow<WaitingCall>(extraBufferCapacity = 16)
        val signals: CallSignalManager = mockk(relaxed = true)
        val haptics: CallHaptics = mockk(relaxed = true)
        val host = FakeHost(scope.backgroundScope)
        val controller: CallWaitingController

        init {
            io.mockk.every { signals.incomingOffers } returns offers
            val virtual15s = object : CallWaitingTimer {
                override fun countdown(): Flow<Unit> = flow { delay(15_000); emit(Unit) }
            }
            controller = CallWaitingController(signals, virtual15s, haptics).also { it.attach(host) }
        }
    }

    private fun call(id: String) = WaitingCall(callId = id, callerId = "u-$id", callerName = "N-$id", isVideo = false)

    private fun rig(scope: TestScope) = Rig(scope)

    @Test
    fun `a newer offer refuses the displaced caller on the wire`() = runTest(StandardTestDispatcher()) {
        val r = rig(this)
        runCurrent()
        r.offers.emit(call("b")); runCurrent()
        r.offers.emit(call("c")); runCurrent()
        r.offers.emit(call("d")); runCurrent()

        verifyOrder {
            r.signals.emitEnd("b", "rejected")
            r.signals.emitEnd("c", "rejected")
        }
        verify(exactly = 0) { r.signals.emitEnd("d", any()) }
        verify(exactly = 0) { r.signals.emitEnd("active", any()) }
        assertThat(r.controller.state.pending?.callId).isEqualTo("d")
        r.controller.reset()
    }

    @Test
    fun `a redelivered pending offer refuses nobody`() = runTest(StandardTestDispatcher()) {
        val r = rig(this)
        runCurrent()
        r.offers.emit(call("b")); runCurrent()
        r.offers.emit(call("b")); runCurrent()

        verify(exactly = 0) { r.signals.emitEnd(any(), any()) }
        r.controller.reset()
    }

    @Test
    fun `ignored for fifteen virtual seconds the banner closes and refuses`() = runTest(StandardTestDispatcher()) {
        val r = rig(this)
        runCurrent()
        r.offers.emit(call("b")); runCurrent()

        advanceTimeBy(14_999); runCurrent()
        assertThat(r.controller.state.pending).isNotNull()
        verify(exactly = 0) { r.signals.emitEnd("b", any()) }

        advanceTimeBy(2); runCurrent()
        assertThat(r.controller.state.pending).isNull()
        verify(exactly = 1) { r.signals.emitEnd("b", "rejected") }
    }

    @Test
    fun `a replacing offer restarts the window and the old countdown cannot refuse the new caller`() =
        runTest(StandardTestDispatcher()) {
            val r = rig(this)
            runCurrent()
            r.offers.emit(call("b")); runCurrent()
            advanceTimeBy(10_000); runCurrent()
            r.offers.emit(call("c")); runCurrent()
            advanceTimeBy(10_000); runCurrent()

            assertThat(r.controller.state.pending?.callId).isEqualTo("c")
            advanceTimeBy(5_001); runCurrent()
            verify(exactly = 1) { r.signals.emitEnd("c", "rejected") }
        }

    @Test
    fun `rejecting keeps the active call and answering hands the waiting call back`() = runTest(StandardTestDispatcher()) {
        val r = rig(this)
        runCurrent()
        r.offers.emit(call("b")); runCurrent()
        r.controller.reject()
        verify(exactly = 1) { r.signals.emitEnd("b", "rejected") }
        verify(exactly = 0) { r.signals.emitEnd("active", any()) }

        r.offers.emit(call("c")); runCurrent()
        val handed = r.controller.accept()
        assertThat(handed?.callId).isEqualTo("c")
        verify(exactly = 0) { r.signals.emitEnd("c", any()) }
        assertThat(r.controller.state.pending).isNull()
    }

    @Test
    fun `haptics are light on arrival, refusal and acceptance but silent on timeout`() = runTest(StandardTestDispatcher()) {
        val r = rig(this)
        runCurrent()
        r.offers.emit(call("b")); runCurrent()
        verify(exactly = 1) { r.haptics.play(CallHapticKind.Light) }
        r.controller.reject()
        verify(exactly = 2) { r.haptics.play(CallHapticKind.Light) }
        r.offers.emit(call("c")); runCurrent()
        r.controller.accept()
        verify(exactly = 4) { r.haptics.play(CallHapticKind.Light) }

        r.offers.emit(call("d")); runCurrent()
        advanceTimeBy(15_001); runCurrent()
        verify(exactly = 5) { r.haptics.play(CallHapticKind.Light) }
    }

    @Test
    fun `an offer without an active call raises nothing`() = runTest(StandardTestDispatcher()) {
        val r = rig(this)
        r.host.callState = CallState.Idle
        runCurrent()
        r.offers.emit(call("b")); runCurrent()
        assertThat(r.controller.state.pending).isNull()
        verify(exactly = 0) { r.haptics.play(any()) }
    }
}
