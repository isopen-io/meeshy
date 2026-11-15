package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallSocialEventParserTest {
    private val oid = "64b7f0c2a1b2c3d4e5f60718"

    @Test
    fun `participant invited decodes the invitee and the count`() {
        val event = CallSocialEventParser.participantInvited(
            """{"callId":"$oid","invitedBy":"u1","invitee":{"userId":"u2","username":"bob","displayName":"Bob","avatar":null},"participantCount":3,"isGroup":true}""",
        )
        assertThat(event).isEqualTo(
            CallParticipantInvited(oid, "u1", CallInvitedUser("u2", "bob", "Bob", null), 3),
        )
    }

    @Test
    fun `invite declined and expired carry their outcome`() {
        val raw = """{"callId":"$oid","userId":"u2"}"""
        assertThat(CallSocialEventParser.inviteSettled(raw, CallInviteOutcome.DECLINED)?.outcome).isEqualTo(CallInviteOutcome.DECLINED)
        assertThat(CallSocialEventParser.inviteSettled(raw, CallInviteOutcome.EXPIRED)?.userId).isEqualTo("u2")
    }

    @Test
    fun `muted by moderator decodes`() {
        assertThat(CallSocialEventParser.mutedByModerator("""{"callId":"c","byUserId":"m"}"""))
            .isEqualTo(CallMutedByModerator("c", "m"))
    }

    @Test
    fun `reaction received decodes a closed-list emoji and ignores others`() {
        assertThat(CallSocialEventParser.reactionReceived("""{"callId":"c","userId":"u","emoji":"🔥","at":"2026-10-22T10:00:00Z"}""")?.emoji)
            .isEqualTo(CallReactionEmoji.FIRE)
        assertThat(CallSocialEventParser.reactionReceived("""{"callId":"c","userId":"u","emoji":"💩"}""")).isNull()
    }

    @Test
    fun `transcription active decodes`() {
        assertThat(CallSocialEventParser.transcriptionActive("""{"callId":"c","speakerId":"s","active":true}"""))
            .isEqualTo(CallTranscriptionActive("c", "s", true))
    }

    @Test
    fun `preview requested decodes and preview signal reuses the signal envelope`() {
        assertThat(CallSocialEventParser.previewRequested("""{"callId":"c","userId":"u"}""")).isEqualTo(CallPreviewRequested("c", "u"))
        val signal = CallSocialEventParser.previewSignal("""{"callId":"c","signal":{"type":"offer","sdp":"v=0","from":"a","to":"b","negotiationId":2}}""")
        assertThat(signal?.signal?.type).isEqualTo("offer")
        assertThat(signal?.signal?.negotiationId).isEqualTo(2)
    }

    @Test
    fun `recording requested reads kind and expiry, defaulting an absent kind to audio`() {
        val event = CallSocialEventParser.recordingRequested(
            """{"callId":"c","recordingId":"r","requesterId":"u","requiredUserIds":["a","b"],"expiresAt":"2026-10-22T10:00:30.000Z"}""",
        )
        assertThat(event?.kind).isEqualTo(CallRecordingKind.AUDIO)
        assertThat(event?.requiredUserIds).containsExactly("a", "b").inOrder()
        assertThat(event?.expiresAtMillis).isEqualTo(java.time.Instant.parse("2026-10-22T10:00:30Z").toEpochMilli())
    }

    @Test
    fun `recording started and stopped decode, an unknown kind reads audio`() {
        assertThat(CallSocialEventParser.recordingStarted("""{"callId":"c","recordingId":"r","recorderId":"u","startedAt":"x","kind":"video"}""")?.kind)
            .isEqualTo(CallRecordingKind.VIDEO)
        assertThat(CallSocialEventParser.recordingStarted("""{"callId":"c","recordingId":"r","recorderId":"u","kind":"hologram"}""")?.kind)
            .isEqualTo(CallRecordingKind.AUDIO)
        assertThat(CallSocialEventParser.recordingStopped("""{"callId":"c","recordingId":"r","reason":"refused","byUserId":null,"wasRecording":false}"""))
            .isEqualTo(CallRecordingStopped("c", "r", "refused", null, false))
    }

    @Test
    fun `frame selected keeps null frame as a removal and an unknown reply as absent`() {
        val removal = CallSocialEventParser.frameSelected("""{"callId":"c","userId":"u","frameId":null,"at":"x"}""")
        assertThat(removal?.frameId).isNull()
        val proposal = CallSocialEventParser.frameSelected(
            """{"callId":"c","userId":"u","frameId":"ambiance.aurore","texts":{"name":"Ana","city":"Lyon"},"reply":"maybe"}""",
        )
        assertThat(proposal).isEqualTo(CallLiveFrameSelected("c", "u", "ambiance.aurore", CallLiveFrameTexts("Ana", "Lyon"), null))
        assertThat(CallSocialEventParser.frameSelected("""{"callId":"c","userId":"u","reply":"accepted"}""")).isNull()
        assertThat(CallSocialEventParser.frameSelected("""{"callId":"c","userId":"u","frameId":"a.b","reply":"declined"}""")?.reply)
            .isEqualTo(CallLiveFrameReply.DECLINED)
    }

    @Test
    fun `malformed or incomplete payloads are ignored without crashing`() {
        assertThat(CallSocialEventParser.participantInvited("not json")).isNull()
        assertThat(CallSocialEventParser.participantInvited("""{"callId":"c"}""")).isNull()
        assertThat(CallSocialEventParser.mutedByModerator("[]")).isNull()
        assertThat(CallSocialEventParser.recordingRequested("""{"callId":"c","recordingId":"r","requesterId":"u","requiredUserIds":"nope"}""")).isNull()
        assertThat(CallSocialEventParser.reactionReceived("""{"callId":"","userId":"u","emoji":"👍"}""")).isNull()
        assertThat(CallSocialEventParser.transcriptionActive("""{"callId":"c","speakerId":"s","active":"yes"}""")).isNull()
    }

    @Test
    fun `unknown keys are tolerated`() {
        assertThat(CallSocialEventParser.mutedByModerator("""{"callId":"c","byUserId":"m","future":{"a":1}}""")).isNotNull()
    }
}
