package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13765 — the call rejoins its room when the signalling socket comes back, as iOS
 * `CallSignalingRouter.observeSocketReconnect`: `call:join` with its ACK, then the peer hears my camera and my
 * microphone again (the gateway forgets the media of a dropped socket), and the engine takes the fresh TURN set
 * the ACK carries. A call the gateway ended meanwhile settles instead.
 */
class CallSignalingRejoinTest {
    private val turn = listOf(SocketIceServer(urls = listOf("turn:turn.meeshy.me:3478"), username = "u", credential = "c"))
    private val speaking = CallRejoinMedia(isMuted = false, isCameraOn = true)

    @Test
    fun `only the return of a dropped socket is a return, never the first connection`() {
        assertThat(CallSignalingRejoinLaw.returns(wasConnected = null, isConnected = true)).isFalse()
        assertThat(CallSignalingRejoinLaw.returns(wasConnected = false, isConnected = true)).isTrue()
        assertThat(CallSignalingRejoinLaw.returns(wasConnected = true, isConnected = true)).isFalse()
        assertThat(CallSignalingRejoinLaw.returns(wasConnected = true, isConnected = false)).isFalse()
    }

    @Test
    fun `a call in the room rejoins it, a ringing callee who never joined does not`() {
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Connected, "call-1")).isTrue()
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Reconnecting(attempt = 1), "call-1")).isTrue()
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Ringing(isOutgoing = true), "call-1")).isTrue()
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Ringing(isOutgoing = false), "call-1")).isFalse()
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Ringing(isOutgoing = true), "")).isFalse()
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Ended(CallEndReason.Local), "call-1")).isFalse()
        assertThat(CallSignalingRejoinLaw.rejoins(CallState.Idle, "call-1")).isFalse()
    }

    @Test
    fun `a rejoined call says its camera and its microphone again, then takes the fresh TURN set`() {
        val plan = CallSignalingRejoinLaw.plan(CallJoinResult.Success(turn), speaking)

        assertThat(plan).containsExactly(
            CallRejoinStep.AnnounceVideo(enabled = true),
            CallRejoinStep.AnnounceAudio(enabled = true),
            CallRejoinStep.RefreshIceServers(turn),
        ).inOrder()
    }

    @Test
    fun `a muted microphone is said muted, and a camera that is off is not announced, as iOS`() {
        val plan = CallSignalingRejoinLaw.plan(CallJoinResult.Success(emptyList()), CallRejoinMedia(isMuted = true, isCameraOn = false))

        assertThat(plan).containsExactly(CallRejoinStep.AnnounceAudio(enabled = false))
    }

    @Test
    fun `a join that did not answer still resyncs the media, without TURN to refresh`() {
        val plan = CallSignalingRejoinLaw.plan(CallJoinResult.Failure(CallJoinAckParser.NO_ACK), speaking)

        assertThat(plan).containsExactly(
            CallRejoinStep.AnnounceVideo(enabled = true),
            CallRejoinStep.AnnounceAudio(enabled = true),
        ).inOrder()
    }

    @Test
    fun `a call the gateway ended meanwhile settles with its real cause, nothing is announced`() {
        val lost = CallJoinResult.Failure("ended", code = CallSignalingRejoinLaw.CALL_ENDED, endReason = "connectionLost")
        val hungUp = CallJoinResult.Failure("ended", code = CallSignalingRejoinLaw.CALL_ENDED)

        assertThat(CallSignalingRejoinLaw.plan(lost, speaking))
            .containsExactly(CallRejoinStep.End(CallEvent.ConnectionFailed("connectionLost")))
        assertThat(CallSignalingRejoinLaw.plan(hungUp, speaking)).containsExactly(CallRejoinStep.End(CallEvent.RemoteHangUp))
    }
}
