package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #16665 — the captures kept beside the persisted sentences take their place among
 * them, at their instant: « Awa a capturé l'écran », « L'enregistrement de l'appel a
 * commencé ». A screen capture names its author; a call-recording bound names nobody.
 */
class CallTranscriptCaptureReplayTest {

    private val startIso = "2026-10-29T10:00:00.000Z"
    private val startMs = 1_793_268_000_000L

    private fun sentence(at: Long, text: String = "Hello") = PersistedTranscriptSegment(
        id = "s$at",
        speakerId = "peer",
        speakerDisplayName = "Zoé",
        text = text,
        language = "en",
        capturedAtMs = at,
    )

    private fun capture(
        kind: String = "screenshot",
        userId: String? = "peer",
        displayName: String? = "Awa",
        offsetMs: Long = 10_000,
        at: String? = null,
    ) = PersistedTranscriptCapture(
        id = "c$offsetMs$kind",
        participantId = "part-1",
        userId = userId,
        displayName = displayName,
        kind = kind,
        offsetMs = offsetMs,
        at = at,
    )

    private fun lines(
        segments: List<PersistedTranscriptSegment> = emptyList(),
        captures: List<PersistedTranscriptCapture>,
    ) = CallTranscriptReplay.lines(
        page = CallTranscriptPage(callId = "call-1", conversationId = "conv-1", callStartedAt = startIso, segments = segments, captures = captures),
        reader = CallTranscriptReader(userId = "me", name = "Ada", prism = listOf("fr")),
        recordStartedAt = startIso,
        youLabel = "Vous",
        participantLabel = "Participant",
    )

    @Test
    fun `a capture takes its place between the sentences`() {
        val result = lines(
            segments = listOf(sentence(startMs + 5_000, "a"), sentence(startMs + 20_000, "b")),
            captures = listOf(capture(offsetMs = 10_000)),
        )

        assertThat(result.map { it.captureKind }).containsExactly(null, CallCaptureKind.SCREENSHOT, null).inOrder()
        assertThat(result[1].speakerName).isEqualTo("Awa")
        assertThat(result[1].elapsedLabel).isEqualTo(CallDuration.clock(10))
    }

    @Test
    fun `the capture instant wins over its offset`() {
        val result = lines(captures = listOf(capture(offsetMs = 0, at = "2026-10-29T10:00:42.000Z"))).single()

        assertThat(result.elapsedLabel).isEqualTo(CallDuration.clock(42))
    }

    @Test
    fun `the reader's own capture carries the reader's name`() {
        val result = lines(captures = listOf(capture(userId = "me", displayName = null))).single()

        assertThat(result.speakerName).isEqualTo("Ada")
        assertThat(result.isLocal).isTrue()
    }

    @Test
    fun `a call-recording bound names nobody`() {
        val result = lines(captures = listOf(capture(kind = "call-recording-started"))).single()

        assertThat(result.captureKind).isEqualTo(CallCaptureKind.CALL_RECORDING_STARTED)
        assertThat(result.speakerName).isEmpty()
    }

    @Test
    fun `an unknown capture kind is not guessed`() {
        assertThat(lines(captures = listOf(capture(kind = "hologram")))).isEmpty()
    }

    @Test
    fun `a journal holding only captures is still shown, with no original toggle`() {
        val state = CallTranscriptState.of(lines(captures = listOf(capture())))

        assertThat((state as CallTranscriptState.Ready).canShowOriginal).isFalse()
    }
}
