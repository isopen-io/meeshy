package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure socket-frame → [CallEvent] mapper. Mirrors the
 * iOS `MessageSocketManager` call listen-table (`call:initiated` / `call:signal`
 * offer|answer|ice-candidate / `call:ended` / `call:missed` / `call:media-toggled`
 * / `call:error` / `call:already-answered`) and routes each inbound frame into
 * the vocabulary the pure [CallStateMachine] understands.
 *
 * Tested through the public `CallSignalMapper.map(eventName, rawJson)` only:
 * given a Socket.IO event name and its JSON payload string, assert the mapped
 * [CallEvent] (or `null` when the frame is inert to the FSM / malformed). Every
 * branch — each event name, the `signal.type` switch, the `reason` switch, the
 * inert plumbing events, unknown names, and malformed JSON — is exercised.
 */
class CallSignalMapperTest {

    private fun map(event: String, json: String): CallEvent? =
        CallSignalMapper.map(event, json)

    // --- call:initiated -----------------------------------------------------

    @Test
    fun `an incoming call offer maps to ReceiveIncoming`() {
        val json = """
            {"callId":"c1","conversationId":"conv1","type":"video",
             "initiator":{"userId":"u9","username":"alice","displayName":"Alice"}}
        """.trimIndent()
        assertThat(map("call:initiated", json)).isEqualTo(CallEvent.ReceiveIncoming)
    }

    @Test
    fun `an initiated frame missing the callId is inert`() {
        assertThat(map("call:initiated", """{"conversationId":"conv1"}""")).isNull()
    }

    // --- call:participant-joined -------------------------------------------

    @Test
    fun `a participant-joined frame maps to ParticipantJoined`() {
        val json = """{"callId":"c1","participantId":"p2","userId":"u2","mode":"p2p"}"""
        assertThat(map("call:participant-joined", json)).isEqualTo(CallEvent.ParticipantJoined)
    }

    // --- call:signal (offer / answer / ice-candidate) ----------------------

    @Test
    fun `a remote SDP answer maps to RemoteAnswer`() {
        val json = """{"callId":"c1","signal":{"type":"answer","sdp":"v=0..."}}"""
        assertThat(map("call:signal", json)).isEqualTo(CallEvent.RemoteAnswer)
    }

    @Test
    fun `a renegotiation offer signal is inert to the FSM`() {
        val json = """{"callId":"c1","signal":{"type":"offer","sdp":"v=0..."}}"""
        assertThat(map("call:signal", json)).isNull()
    }

    @Test
    fun `an ice-candidate signal is inert to the FSM`() {
        val json = """
            {"callId":"c1","signal":{"type":"ice-candidate","candidate":"candidate:1 udp",
             "sdpMLineIndex":0,"sdpMid":"0"}}
        """.trimIndent()
        assertThat(map("call:signal", json)).isNull()
    }

    @Test
    fun `an unknown signal type is inert`() {
        val json = """{"callId":"c1","signal":{"type":"renegotiate"}}"""
        assertThat(map("call:signal", json)).isNull()
    }

    @Test
    fun `a signal frame with no signal object is inert`() {
        assertThat(map("call:signal", """{"callId":"c1"}""")).isNull()
    }

    @Test
    fun `an answer signal carrying unknown extra fields still maps to RemoteAnswer`() {
        val json = """
            {"callId":"c1","signal":{"type":"answer","sdp":"v=0","negotiationId":4,
             "brandNewField":true}}
        """.trimIndent()
        assertThat(map("call:signal", json)).isEqualTo(CallEvent.RemoteAnswer)
    }

    // --- call:ended ---------------------------------------------------------

    @Test
    fun `an ended frame with reason missed maps to RingTimeout`() {
        val json = """{"callId":"c1","reason":"missed","endedBy":"u9"}"""
        assertThat(map("call:ended", json)).isEqualTo(CallEvent.RingTimeout)
    }

    @Test
    fun `an ended frame with reason completed maps to RemoteHangUp`() {
        val json = """{"callId":"c1","reason":"completed","duration":42,"endedBy":"u9"}"""
        assertThat(map("call:ended", json)).isEqualTo(CallEvent.RemoteHangUp)
    }

    @Test
    fun `an ended frame with reason rejected maps to RemoteHangUp`() {
        val json = """{"callId":"c1","reason":"rejected"}"""
        assertThat(map("call:ended", json)).isEqualTo(CallEvent.RemoteHangUp)
    }

    @Test
    fun `an ended frame with no reason maps to RemoteHangUp`() {
        assertThat(map("call:ended", """{"callId":"c1"}""")).isEqualTo(CallEvent.RemoteHangUp)
    }

    // --- call:missed --------------------------------------------------------

    @Test
    fun `a missed frame maps to RingTimeout`() {
        val json = """{"callId":"c1","conversationId":"conv1","callerId":"u9","callerName":"Alice"}"""
        assertThat(map("call:missed", json)).isEqualTo(CallEvent.RingTimeout)
    }

    // --- call:media-toggled -------------------------------------------------

    @Test
    fun `a media-toggled frame is inert to the FSM`() {
        val json = """{"callId":"c1","participantId":"p2","mediaType":"video","enabled":false}"""
        assertThat(map("call:media-toggled", json)).isNull()
    }

    @Test
    fun `a media-toggled frame missing the required mediaType is inert`() {
        assertThat(map("call:media-toggled", """{"callId":"c1","enabled":true}""")).isNull()
    }

    // --- call:error ---------------------------------------------------------

    @Test
    fun `an error frame maps to ConnectionFailed carrying the message`() {
        val json = """{"code":"ROOM_FULL","message":"The call is full"}"""
        assertThat(map("call:error", json))
            .isEqualTo(CallEvent.ConnectionFailed("The call is full"))
    }

    @Test
    fun `an error frame without a message falls back to the code`() {
        assertThat(map("call:error", """{"code":"CALL_ALREADY_ACTIVE"}"""))
            .isEqualTo(CallEvent.ConnectionFailed("CALL_ALREADY_ACTIVE"))
    }

    @Test
    fun `an error frame with neither message nor code maps to a generic ConnectionFailed`() {
        assertThat(map("call:error", "{}"))
            .isEqualTo(CallEvent.ConnectionFailed("Call error"))
    }

    // --- call:already-answered ---------------------------------------------

    @Test
    fun `an already-answered frame maps to RemoteHangUp`() {
        assertThat(map("call:already-answered", """{"callId":"c1"}"""))
            .isEqualTo(CallEvent.RemoteHangUp)
    }

    // --- unknown / malformed ------------------------------------------------

    @Test
    fun `an unknown event name is inert`() {
        assertThat(map("call:heartbeat", """{"callId":"c1"}""")).isNull()
    }

    @Test
    fun `a malformed JSON payload is inert rather than crashing`() {
        assertThat(map("call:ended", "not-json-at-all")).isNull()
        assertThat(map("call:signal", "")).isNull()
    }
}
