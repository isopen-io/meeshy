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
    fun `a participant-joined frame maps to ParticipantJoined carrying the joiner id`() {
        val json = """{"callId":"c1","participant":{"userId":"u2"},"mode":"p2p"}"""
        assertThat(map("call:participant-joined", json)).isEqualTo(CallEvent.ParticipantJoined("u2"))
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

    // --- call:ended / call:missed are identity-gated (see endedSignal), so the ---
    // --- FSM-facing map deliberately treats them as inert (never a blind teardown) ---

    @Test
    fun `an ended frame is inert to the identity-less FSM map`() {
        val json = """{"callId":"c1","reason":"completed","duration":42,"endedBy":"u9"}"""
        assertThat(map("call:ended", json)).isNull()
    }

    @Test
    fun `an ended frame with reason missed is inert to the identity-less FSM map`() {
        assertThat(map("call:ended", """{"callId":"c1","reason":"missed"}""")).isNull()
    }

    @Test
    fun `a missed frame is inert to the identity-less FSM map`() {
        val json = """{"callId":"c1","conversationId":"conv1","callerId":"u9","callerName":"Alice"}"""
        assertThat(map("call:missed", json)).isNull()
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

    // --- incomingOffer: identity decode for the call-waiting banner --------

    @Test
    fun `incomingOffer decodes the caller identity and media from an initiated frame`() {
        val json = """
            {"callId":"c1","type":"video",
             "initiator":{"userId":"u9","username":"alice","displayName":"Alice"}}
        """.trimIndent()

        assertThat(CallSignalMapper.incomingOffer(json))
            .isEqualTo(WaitingCall(callId = "c1", callerId = "u9", callerName = "Alice", isVideo = true))
    }

    @Test
    fun `incomingOffer returns null for a frame carrying no call id`() {
        assertThat(CallSignalMapper.incomingOffer("""{"type":"video"}""")).isNull()
    }

    @Test
    fun `incomingOffer is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.incomingOffer("not-json-at-all")).isNull()
    }

    // --- endedSignal: identity-carrying teardown decode (id + FSM event) -----

    @Test
    fun `endedSignal decodes a completed ended frame as a RemoteHangUp keyed by its id`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", """{"callId":"c7","reason":"completed"}"""))
            .isEqualTo(CallEndedSignal("c7", CallEvent.RemoteHangUp))
    }

    @Test
    fun `endedSignal decodes a rejected ended frame as a RemoteHangUp keyed by its id`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", """{"callId":"c7","reason":"rejected"}"""))
            .isEqualTo(CallEndedSignal("c7", CallEvent.RemoteHangUp))
    }

    @Test
    fun `endedSignal decodes an ended frame with no reason as a RemoteHangUp`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", """{"callId":"c7"}"""))
            .isEqualTo(CallEndedSignal("c7", CallEvent.RemoteHangUp))
    }

    @Test
    fun `endedSignal decodes a missed-reason ended frame as a RingTimeout keyed by its id`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", """{"callId":"c7","reason":"missed"}"""))
            .isEqualTo(CallEndedSignal("c7", CallEvent.RingTimeout))
    }

    @Test
    fun `endedSignal decodes a missed frame as a RingTimeout keyed by its id`() {
        assertThat(CallSignalMapper.endedSignal("call:missed", """{"callId":"c8","callerId":"u3"}"""))
            .isEqualTo(CallEndedSignal("c8", CallEvent.RingTimeout))
    }

    @Test
    fun `endedSignal is null for a non-teardown frame`() {
        assertThat(CallSignalMapper.endedSignal("call:signal", """{"callId":"c9","signal":{"type":"answer"}}"""))
            .isNull()
    }

    @Test
    fun `endedSignal is null for an initiated frame`() {
        assertThat(CallSignalMapper.endedSignal("call:initiated", """{"callId":"c1","type":"video"}"""))
            .isNull()
    }

    @Test
    fun `endedSignal returns null for an ended frame carrying a blank call id`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", """{"callId":"","reason":"completed"}"""))
            .isNull()
    }

    @Test
    fun `endedSignal returns null for a missed frame carrying a blank call id`() {
        assertThat(CallSignalMapper.endedSignal("call:missed", """{"callId":""}""")).isNull()
    }

    @Test
    fun `endedSignal returns null for an ended frame carrying no call id`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", """{"reason":"completed"}""")).isNull()
    }

    @Test
    fun `endedSignal is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.endedSignal("call:ended", "not-json-at-all")).isNull()
    }

    // --- call:participant-left (inert to the 1:1 FSM; teardown rides call:ended) --

    @Test
    fun `a participant-left frame is inert to the FSM`() {
        assertThat(map("call:participant-left", """{"callId":"c1","participantId":"p2","mode":"p2p"}"""))
            .isNull()
    }

    // --- qualityAlert: the remote peer's link degraded (call:quality-alert) --

    @Test
    fun `qualityAlert decodes an rtt alert keyed by its call id`() {
        val json = """{"callId":"c1","participantId":"p2","metric":"rtt","value":412.5,"threshold":300}"""

        assertThat(CallSignalMapper.qualityAlert(json)).isEqualTo(
            CallQualityAlertPayload(
                callId = "c1",
                participantId = "p2",
                metric = "rtt",
                value = 412.5,
                threshold = 300.0,
            ),
        )
    }

    @Test
    fun `qualityAlert decodes a packet-loss alert without a participant id`() {
        val json = """{"callId":"c1","metric":"packetLoss","value":9,"threshold":5}"""

        assertThat(CallSignalMapper.qualityAlert(json)).isEqualTo(
            CallQualityAlertPayload(callId = "c1", metric = "packetLoss", value = 9.0, threshold = 5.0),
        )
    }

    @Test
    fun `qualityAlert returns null for a frame carrying a blank call id`() {
        assertThat(CallSignalMapper.qualityAlert("""{"callId":"","metric":"rtt","value":400,"threshold":300}"""))
            .isNull()
    }

    @Test
    fun `qualityAlert is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.qualityAlert("not-json-at-all")).isNull()
    }

    // --- screenCaptureAlert: remote screen-recording privacy signal ----------

    @Test
    fun `screenCaptureAlert decodes a capture-started frame keyed by its call id`() {
        val json = """{"callId":"c1","participantId":"p2","isCapturing":true}"""

        assertThat(CallSignalMapper.screenCaptureAlert(json)).isEqualTo(
            CallScreenCaptureAlertPayload(callId = "c1", participantId = "p2", isCapturing = true),
        )
    }

    @Test
    fun `screenCaptureAlert decodes a capture-stopped frame`() {
        val json = """{"callId":"c1","isCapturing":false}"""

        assertThat(CallSignalMapper.screenCaptureAlert(json)).isEqualTo(
            CallScreenCaptureAlertPayload(callId = "c1", isCapturing = false),
        )
    }

    @Test
    fun `screenCaptureAlert returns null for a frame carrying a blank call id`() {
        assertThat(CallSignalMapper.screenCaptureAlert("""{"callId":"","isCapturing":true}""")).isNull()
    }

    @Test
    fun `screenCaptureAlert is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.screenCaptureAlert("not-json-at-all")).isNull()
    }
}
