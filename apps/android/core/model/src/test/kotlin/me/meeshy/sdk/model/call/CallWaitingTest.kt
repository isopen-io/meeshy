package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the call-waiting decision core — the pure port of the iOS
 * `CallManager` pending-incoming-call slot + `CallWaitingBannerView` lifecycle.
 * Exercised entirely through the public API: [WaitingCall.from], the
 * [CallWaitingState] derivation, and the total [CallWaitingReducer].
 *
 * Every branch is covered: the identity builder's blank-id guard, the four-tier
 * name resolution incl. blank skips + the no-initiator fallback, the media flag,
 * and each reducer arm — offer (newest wins), reject, accept, and remote-end with
 * a matching id, a mismatched id, and no pending call at all.
 */
class CallWaitingTest {

    private fun payload(
        callId: String = "call-1",
        type: String? = "video",
        initiator: CallInitiatorInfo? = CallInitiatorInfo(userId = "u1", username = "bob", displayName = "Bob"),
    ) = CallInitiatedPayload(callId = callId, type = type, initiator = initiator)

    private fun waiting(callId: String = "call-1") =
        WaitingCall(callId = callId, callerId = "u1", callerName = "Bob", isVideo = true)

    // --- WaitingCall.from: identity builder -------------------------------

    @Test
    fun `from a full initiated frame carries id caller and video media`() {
        val call = WaitingCall.from(payload())

        assertThat(call).isEqualTo(
            WaitingCall(callId = "call-1", callerId = "u1", callerName = "Bob", isVideo = true),
        )
    }

    @Test
    fun `from a blank call id yields null - nothing to reject or answer`() {
        assertThat(WaitingCall.from(payload(callId = ""))).isNull()
    }

    @Test
    fun `an audio media type is not a video call`() {
        assertThat(WaitingCall.from(payload(type = "audio"))!!.isVideo).isFalse()
    }

    @Test
    fun `an absent media type defaults to audio`() {
        assertThat(WaitingCall.from(payload(type = null))!!.isVideo).isFalse()
    }

    @Test
    fun `the caller name prefers the display name`() {
        assertThat(WaitingCall.from(payload())!!.callerName).isEqualTo("Bob")
    }

    @Test
    fun `a blank display name falls back to the username`() {
        val call = WaitingCall.from(
            payload(initiator = CallInitiatorInfo(userId = "u1", username = "bob", displayName = "  ")),
        )
        assertThat(call!!.callerName).isEqualTo("bob")
    }

    @Test
    fun `a blank display name and username fall back to the user id`() {
        val call = WaitingCall.from(
            payload(initiator = CallInitiatorInfo(userId = "u1", username = "", displayName = null)),
        )
        assertThat(call!!.callerName).isEqualTo("u1")
        assertThat(call.callerId).isEqualTo("u1")
    }

    @Test
    fun `no initiator at all resolves to the shared fallback name and blank id`() {
        val call = WaitingCall.from(payload(initiator = null))

        assertThat(call!!.callerName).isEqualTo(WAITING_CALL_FALLBACK_NAME)
        assertThat(call.callerId).isEmpty()
    }

    // --- CallWaitingState derivation --------------------------------------

    @Test
    fun `the empty state shows no banner`() {
        assertThat(CallWaitingState.EMPTY.isBannerVisible).isFalse()
    }

    @Test
    fun `a pending call makes the banner visible`() {
        assertThat(CallWaitingState(pending = waiting()).isBannerVisible).isTrue()
    }

    // --- CallWaitingReducer -----------------------------------------------

    @Test
    fun `offering a second call raises the banner for that call`() {
        val next = CallWaitingReducer.reduce(CallWaitingState.EMPTY, CallWaitingEvent.Offered(waiting()))

        assertThat(next.pending).isEqualTo(waiting())
        assertThat(next.isBannerVisible).isTrue()
    }

    @Test
    fun `a newer offer replaces the older pending call`() {
        val first = CallWaitingReducer.reduce(CallWaitingState.EMPTY, CallWaitingEvent.Offered(waiting("call-1")))
        val second = CallWaitingReducer.reduce(first, CallWaitingEvent.Offered(waiting("call-2")))

        assertThat(second.pending?.callId).isEqualTo("call-2")
    }

    @Test
    fun `rejecting clears the pending call`() {
        val pending = CallWaitingState(pending = waiting())

        assertThat(CallWaitingReducer.reduce(pending, CallWaitingEvent.Rejected)).isEqualTo(CallWaitingState.EMPTY)
    }

    @Test
    fun `accepting clears the pending call`() {
        val pending = CallWaitingState(pending = waiting())

        assertThat(CallWaitingReducer.reduce(pending, CallWaitingEvent.Accepted)).isEqualTo(CallWaitingState.EMPTY)
    }

    @Test
    fun `a remote end matching the pending id dismisses the banner`() {
        val pending = CallWaitingState(pending = waiting("call-9"))

        val next = CallWaitingReducer.reduce(pending, CallWaitingEvent.RemotelyEnded("call-9"))

        assertThat(next).isEqualTo(CallWaitingState.EMPTY)
    }

    @Test
    fun `a remote end for a different id leaves the banner untouched`() {
        val pending = CallWaitingState(pending = waiting("call-9"))

        val next = CallWaitingReducer.reduce(pending, CallWaitingEvent.RemotelyEnded("call-other"))

        assertThat(next).isEqualTo(pending)
    }

    @Test
    fun `a remote end with no pending call is inert`() {
        val next = CallWaitingReducer.reduce(CallWaitingState.EMPTY, CallWaitingEvent.RemotelyEnded("call-9"))

        assertThat(next).isEqualTo(CallWaitingState.EMPTY)
    }
}
