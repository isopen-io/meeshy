package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallWaitingReducerTest {
    private fun call(id: String) = WaitingCall(callId = id, callerId = "u-$id", callerName = "N-$id", isVideo = false)
    private fun waiting(id: String) = CallWaitingState(pending = call(id))

    @Test
    fun `a newer offer replaces the pending one`() {
        val next = CallWaitingReducer.reduce(waiting("a"), CallWaitingEvent.Offered(call("b")))
        assertThat(next.pending?.callId).isEqualTo("b")
    }

    @Test
    fun `the displaced caller is named so it can be refused`() {
        assertThat(CallWaitingReducer.displacedBy(waiting("a"), call("b"))).isEqualTo(call("a"))
    }

    @Test
    fun `a redelivery of the pending offer displaces nobody`() {
        assertThat(CallWaitingReducer.displacedBy(waiting("a"), call("a"))).isNull()
    }

    @Test
    fun `an offer on an empty banner displaces nobody`() {
        assertThat(CallWaitingReducer.displacedBy(CallWaitingState.EMPTY, call("a"))).isNull()
    }

    @Test
    fun `successive callers leave only the last one pending and each earlier one displaced once`() {
        val ids = listOf("a", "b", "c", "d")
        val (final, displaced) = ids.fold(CallWaitingState.EMPTY to emptyList<String>()) { (state, out), id ->
            val gone = CallWaitingReducer.displacedBy(state, call(id))?.callId
            CallWaitingReducer.reduce(state, CallWaitingEvent.Offered(call(id))) to (out + listOfNotNull(gone))
        }
        assertThat(final.pending?.callId).isEqualTo("d")
        assertThat(displaced).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `a remote end of the pending call clears it and an unrelated one is inert`() {
        assertThat(CallWaitingReducer.reduce(waiting("a"), CallWaitingEvent.RemotelyEnded("a"))).isEqualTo(CallWaitingState.EMPTY)
        assertThat(CallWaitingReducer.reduce(waiting("a"), CallWaitingEvent.RemotelyEnded("z"))).isEqualTo(waiting("a"))
    }

    @Test
    fun `reject and accept both clear the banner`() {
        assertThat(CallWaitingReducer.reduce(waiting("a"), CallWaitingEvent.Rejected)).isEqualTo(CallWaitingState.EMPTY)
        assertThat(CallWaitingReducer.reduce(waiting("a"), CallWaitingEvent.Accepted)).isEqualTo(CallWaitingState.EMPTY)
    }
}
