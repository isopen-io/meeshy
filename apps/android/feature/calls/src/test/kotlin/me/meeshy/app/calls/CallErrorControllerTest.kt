package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import me.meeshy.sdk.model.call.CallErrorSignal
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.socket.CallAccessoryRequest
import me.meeshy.sdk.socket.CallSignalManager
import org.junit.Test

class CallErrorControllerTest {
    private var answeredAccessory: CallAccessoryRequest? = null
    private val signals: CallSignalManager = mockk(relaxed = true) {
        every { accessoryRequestAnswered(any()) } answers { answeredAccessory != null }
    }
    private val dispatched = mutableListOf<CallEvent>()
    private var pendingTurnRequest = false
    private var resuming = false

    private val turn: CallTurnCredentialsController = mockk(relaxed = true) {
        every { hasPendingRequest } answers { pendingTurnRequest }
    }
    private val host: CallSessionHost = mockk(relaxed = true) {
        every { callId } returns "c1"
        every { callState } returns CallState.Connecting
        every { dispatch(any()) } answers { dispatched += firstArg<CallEvent>() }
    }
    private val controller = CallErrorController(signals, turn) { resuming }

    @Test
    fun `a refused TURN refresh does not end the call`() {
        pendingTurnRequest = true
        controller.handle(host, CallErrorSignal("NOT_A_PARTICIPANT", "c1", "nope"))
        assertThat(dispatched).isEmpty()
        verify(exactly = 0) { host.endMedia() }
    }

    @Test
    fun `an error answering a recent accessory request does not end the call`() {
        answeredAccessory = CallAccessoryRequest.Reaction
        controller.handle(host, CallErrorSignal("NOT_A_PARTICIPANT", "c1", "nope"))
        assertThat(dispatched).isEmpty()
        verify(exactly = 0) { host.endMedia() }
    }

    @Test
    fun `an error of another call is ignored`() {
        controller.handle(host, CallErrorSignal("BUSY", "other", "busy"))
        assertThat(dispatched).isEmpty()
    }

    @Test
    fun `a fatal error ends the call and tells the gateway`() {
        controller.handle(host, CallErrorSignal("BUSY", "c1", "Line busy"))
        assertThat(dispatched).containsExactly(CallEvent.ConnectionFailed("Line busy"))
        verify(exactly = 1) { signals.emitEnd("c1") }
        verify(exactly = 1) { host.endMedia() }
    }

    @Test
    fun `CALL_ENDED reconciles to a remote hangup`() {
        controller.handle(host, CallErrorSignal("CALL_ENDED", "c1", null))
        assertThat(dispatched).containsExactly(CallEvent.RemoteHangUp)
    }

    @Test
    fun `NOT_A_PARTICIPANT during a rejoin is transient`() {
        resuming = true
        controller.handle(host, CallErrorSignal("NOT_A_PARTICIPANT", "c1", null))
        assertThat(dispatched).isEmpty()
    }
}
