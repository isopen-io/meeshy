package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallCaptureKind
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import me.meeshy.sdk.model.call.CallRecordingStarted
import me.meeshy.sdk.model.call.CallRecordingStopped
import org.junit.Test

/** #16665 — the live journal of captures and the captions band that shows it (loi 13, R1). */
class CallLiveCapturesTest {

    private fun capture(id: String, atMs: Long, kind: CallCaptureKind = CallCaptureKind.SCREENSHOT, userId: String = "u-karim") =
        CallLiveCapture(id = id, kind = kind, userId = userId, atMs = atMs, elapsedLabel = "12:40")

    private fun sentence(key: String, atMs: Long) = CallLiveCaptionLine(
        key = key, speakerId = "u-awa", speakerName = "Awa", isLocal = false, text = "Bonjour", languageTag = null,
        isFinal = true, capturedAtMs = atMs, isShowingOriginal = false, canRevealOriginal = false,
    )

    @Test
    fun `the same capture by the same person within 5 s is written once`() {
        val once = CallLiveCaptureJournal.adding(emptyList(), capture("a", 1_000))
        val twice = CallLiveCaptureJournal.adding(once, capture("b", 4_000))
        val otherKind = CallLiveCaptureJournal.adding(twice, capture("c", 4_500, CallCaptureKind.RECORDING))
        val later = CallLiveCaptureJournal.adding(otherKind, capture("d", 7_000))

        assertThat(later.map { it.id }).containsExactly("a", "c", "d").inOrder()
    }

    @Test
    fun `the consented recording notes its start and its end, never a stop before any start`() {
        val started = CallRecordingSocketEvent.Started(CallRecordingStarted("call-9", "r1", "u-awa", CallRecordingKind.entries.first()))
        val stopped = CallRecordingSocketEvent.Stopped(CallRecordingStopped("call-9", "r1", "stopped", null, wasRecording = true))
        val refused = CallRecordingSocketEvent.Stopped(CallRecordingStopped("call-9", "r2", "refused", null, wasRecording = false))

        assertThat(CallLiveCaptureJournal.recordingMoment(started)).isEqualTo("rec-start:r1" to CallCaptureKind.CALL_RECORDING_STARTED)
        assertThat(CallLiveCaptureJournal.recordingMoment(stopped)).isEqualTo("rec-stop:r1" to CallCaptureKind.CALL_RECORDING_STOPPED)
        assertThat(CallLiveCaptureJournal.recordingMoment(refused)).isNull()
    }

    @Test
    fun `the band shows the two last entries, a capture between two sentences at its time`() {
        val entries = CallBandEntries.last(
            lines = listOf(sentence("s1", 1_000), sentence("s2", 3_000)),
            captures = listOf(capture("n1", 2_000)),
            count = 2,
        )

        assertThat(entries.map { if (it is CallBandEntry.Capture) it.capture.id else (it as CallBandEntry.Sentence).line.key })
            .containsExactly("n1", "s2").inOrder()
    }

    @Test
    fun `in a group the capture is named by who captured, the peer name only standing in`() {
        val roster = me.meeshy.sdk.model.call.group.GroupCallRoster(
            localUserId = "u-me",
            members = listOf(me.meeshy.sdk.model.call.group.GroupCallMember(userId = "u-karim", displayName = "Karim")),
        )

        assertThat(CallCapturerName.resolve("u-karim", roster, peerName = "Équipe")).isEqualTo("Karim")
        assertThat(CallCapturerName.resolve("u-unknown", roster, peerName = "Équipe")).isEqualTo("Équipe")
        assertThat(CallCapturerName.resolve("", roster, peerName = "Awa")).isEqualTo("Awa")
    }

    @Test
    fun `the journal holds every sentence and every capture, at their time`() {
        val entries = CallBandEntries.all(
            lines = listOf(sentence("s1", 1_000), sentence("s2", 3_000)),
            captures = listOf(capture("c1", 2_000)),
        )

        assertThat(entries.map { it.atMs }).containsExactly(1_000L, 2_000L, 3_000L).inOrder()
        assertThat(entries[1]).isInstanceOf(CallBandEntry.Capture::class.java)
    }
}
