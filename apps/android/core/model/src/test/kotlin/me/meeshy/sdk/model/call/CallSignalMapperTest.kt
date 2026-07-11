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

    // --- group/UX side-channels are inert to the 1:1 FSM map -----------------

    @Test
    fun `a participant-left frame is inert to the FSM map`() {
        assertThat(map("call:participant-left", """{"callId":"c1","participantId":"p2","mode":"p2p"}"""))
            .isNull()
    }

    @Test
    fun `a quality-alert frame is inert to the FSM map`() {
        assertThat(map("call:quality-alert", """{"callId":"c1","participantId":"p2","metric":"rtt","value":900,"threshold":500}"""))
            .isNull()
    }

    @Test
    fun `a screen-capture-alert frame is inert to the FSM map`() {
        assertThat(map("call:screen-capture-alert", """{"callId":"c1","participantId":"p2","isCapturing":true}"""))
            .isNull()
    }

    @Test
    fun `a translated-segment frame is inert to the FSM map`() {
        assertThat(map("call:translated-segment", """{"callId":"c1","segment":{"text":"hello","speakerId":"u2"}}"""))
            .isNull()
    }

    // --- participantLeft: group-roster decode --------------------------------

    @Test
    fun `participantLeft decodes the leaver identity and the surviving mode`() {
        val json = """{"callId":"c1","participantId":"p2","userId":"u2","mode":"p2p"}"""
        assertThat(CallSignalMapper.participantLeft(json))
            .isEqualTo(CallParticipantLeftPayload(callId = "c1", participantId = "p2", userId = "u2", mode = "p2p"))
    }

    @Test
    fun `participantLeft tolerates a frame without the optional userId`() {
        assertThat(CallSignalMapper.participantLeft("""{"callId":"c1","participantId":"p2","mode":"sfu"}"""))
            .isEqualTo(CallParticipantLeftPayload(callId = "c1", participantId = "p2", mode = "sfu"))
    }

    @Test
    fun `participantLeft returns null for a frame carrying a blank call id`() {
        assertThat(CallSignalMapper.participantLeft("""{"callId":"","participantId":"p2"}""")).isNull()
    }

    @Test
    fun `participantLeft is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.participantLeft("not-json-at-all")).isNull()
    }

    // --- qualityAlert: the REMOTE peer's sustained bad network ---------------

    @Test
    fun `qualityAlert decodes the flagged metric and its threshold`() {
        val json = """{"callId":"c1","participantId":"p2","metric":"packetLoss","value":12.5,"threshold":8}"""
        assertThat(CallSignalMapper.qualityAlert(json)).isEqualTo(
            CallQualityAlertPayload(
                callId = "c1", participantId = "p2", metric = "packetLoss", value = 12.5, threshold = 8.0,
            ),
        )
    }

    @Test
    fun `qualityAlert returns null for a frame carrying no call id`() {
        assertThat(CallSignalMapper.qualityAlert("""{"metric":"rtt","value":900}""")).isNull()
    }

    @Test
    fun `qualityAlert is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.qualityAlert("not-json-at-all")).isNull()
    }

    // --- screenCaptureAlert: the peer's capture privacy signal ---------------

    @Test
    fun `screenCaptureAlert decodes a capture-started frame`() {
        assertThat(CallSignalMapper.screenCaptureAlert("""{"callId":"c1","participantId":"p2","isCapturing":true}"""))
            .isEqualTo(CallScreenCaptureAlertPayload(callId = "c1", participantId = "p2", isCapturing = true))
    }

    @Test
    fun `screenCaptureAlert decodes a capture-stopped frame`() {
        assertThat(CallSignalMapper.screenCaptureAlert("""{"callId":"c1","isCapturing":false}"""))
            .isEqualTo(CallScreenCaptureAlertPayload(callId = "c1", isCapturing = false))
    }

    @Test
    fun `screenCaptureAlert returns null for a frame missing the capture flag`() {
        assertThat(CallSignalMapper.screenCaptureAlert("""{"callId":"c1","participantId":"p2"}""")).isNull()
    }

    @Test
    fun `screenCaptureAlert is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.screenCaptureAlert("not-json-at-all")).isNull()
    }

    // --- translatedSegment: live caption decode -------------------------------

    @Test
    fun `translatedSegment decodes a translated caption segment`() {
        val json = """
            {"callId":"c1","segment":{"text":"bonjour","translatedText":"hello","speakerId":"u2",
             "startMs":1200,"endMs":2400,"isFinal":true,"sourceLanguage":"fr","targetLanguage":"en",
             "confidence":0.92}}
        """.trimIndent()
        assertThat(CallSignalMapper.translatedSegment(json)).isEqualTo(
            CallTranslatedSegmentPayload(
                callId = "c1",
                segment = CallTranslatedSegmentRef(
                    text = "bonjour", translatedText = "hello", speakerId = "u2",
                    startMs = 1200.0, endMs = 2400.0, isFinal = true,
                    sourceLanguage = "fr", targetLanguage = "en", confidence = 0.92,
                ),
            ),
        )
    }

    @Test
    fun `translatedSegment tolerates an untranslated relay carrying only the original text`() {
        val json = """{"callId":"c1","segment":{"text":"bonjour","speakerId":"u2","isFinal":false}}"""
        val decoded = CallSignalMapper.translatedSegment(json)
        assertThat(decoded?.segment?.text).isEqualTo("bonjour")
        assertThat(decoded?.segment?.translatedText).isNull()
        assertThat(decoded?.segment?.isFinal).isFalse()
    }

    @Test
    fun `translatedSegment returns null for a frame missing the segment`() {
        assertThat(CallSignalMapper.translatedSegment("""{"callId":"c1"}""")).isNull()
    }

    @Test
    fun `translatedSegment returns null for a segment missing its text`() {
        assertThat(CallSignalMapper.translatedSegment("""{"callId":"c1","segment":{"speakerId":"u2"}}""")).isNull()
    }

    @Test
    fun `translatedSegment is inert on malformed JSON rather than crashing`() {
        assertThat(CallSignalMapper.translatedSegment("not-json-at-all")).isNull()
    }
}
