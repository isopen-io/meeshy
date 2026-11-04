package me.meeshy.sdk.model.analytics.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentCaptureCandidate
import me.meeshy.sdk.model.ContentCaptureKind
import me.meeshy.sdk.model.ContentExitLaw.CaptureVerdict
import org.junit.Test

class ContentCaptureTrackerTest {

    private fun oid(n: Int) = n.toString(16).padStart(24, '0')

    private fun visible(vararg n: Int, conversation: String = "c1") =
        n.map { ContentCaptureCandidate(conversation, oid(it), CaptureVerdict.ANNOUNCED, isMine = false) }

    @Test
    fun `a screenshot declares everything visible under the id it is given`() {
        val out = ContentCaptureTracker().screenshot(visible(1, 2), "cap_aaaaaaaa")

        assertThat(out.single().kind).isEqualTo(ContentCaptureKind.SCREENSHOT)
        assertThat(out.single().captureId).isEqualTo("cap_aaaaaaaa")
        assertThat(out.single().messageIds).containsExactly(oid(1), oid(2))
    }

    @Test
    fun `two screenshots do not share an id and the same messages are declared again`() {
        val tracker = ContentCaptureTracker()

        val first = tracker.screenshot(visible(1), "cap_aaaaaaaa")
        val second = tracker.screenshot(visible(1), "cap_bbbbbbbb")

        assertThat(first.single().captureId).isNotEqualTo(second.single().captureId)
        assertThat(second.single().messageIds).containsExactly(oid(1))
    }

    @Test
    fun `a recording declares what is visible at once and keeps one id until the end`() {
        val tracker = ContentCaptureTracker()

        val start = tracker.recordingStarted(visible(1), "cap_rec00001", nowMillis = 0)
        val later = tracker.note(visible(1, 2), nowMillis = 11_000)

        assertThat(tracker.isRecording).isTrue()
        assertThat(start.single().kind).isEqualTo(ContentCaptureKind.RECORDING)
        assertThat(start.single().captureId).isEqualTo("cap_rec00001")
        assertThat(later.single().captureId).isEqualTo("cap_rec00001")
        assertThat(later.single().messageIds).containsExactly(oid(2))
    }

    @Test
    fun `a message already declared during the recording is not declared again`() {
        val tracker = ContentCaptureTracker()
        tracker.recordingStarted(visible(1), "cap_rec00001", 0)

        assertThat(tracker.note(visible(1), 60_000)).isEmpty()
    }

    @Test
    fun `a conversation is declared at most once every ten seconds during a recording`() {
        val tracker = ContentCaptureTracker()
        tracker.recordingStarted(visible(1), "cap_rec00001", 0)

        assertThat(tracker.note(visible(2), 9_999)).isEmpty()
        assertThat(tracker.note(visible(2), 10_000).single().messageIds).containsExactly(oid(2))
    }

    @Test
    fun `the ten second budget is per conversation`() {
        val tracker = ContentCaptureTracker()
        tracker.recordingStarted(visible(1, conversation = "a"), "cap_rec00001", 0)

        val out = tracker.note(visible(2, conversation = "b"), 1_000)

        assertThat(out.single().conversationId).isEqualTo("b")
    }

    @Test
    fun `ending the recording flushes what was waiting and forgets the session`() {
        val tracker = ContentCaptureTracker()
        tracker.recordingStarted(visible(1), "cap_rec00001", 0)
        tracker.note(visible(2), 1_000)

        val last = tracker.recordingEnded(visible(2), 2_000)

        assertThat(last.single().messageIds).containsExactly(oid(2))
        assertThat(tracker.isRecording).isFalse()
        assertThat(tracker.recordingCaptureId).isNull()
        assertThat(tracker.note(visible(3), 99_000)).isEmpty()
    }

    @Test
    fun `a second recording starts clean under its own id`() {
        val tracker = ContentCaptureTracker()
        tracker.recordingStarted(visible(1), "cap_rec00001", 0)
        tracker.recordingEnded(emptyList(), 1_000)

        val again = tracker.recordingStarted(visible(1), "cap_rec00002", 2_000)

        assertThat(again.single().captureId).isEqualTo("cap_rec00002")
        assertThat(again.single().messageIds).containsExactly(oid(1))
    }

    @Test
    fun `starting while recording keeps the first id`() {
        val tracker = ContentCaptureTracker()
        tracker.recordingStarted(visible(1), "cap_rec00001", 0)

        tracker.recordingStarted(visible(2), "cap_other999", 20_000)

        assertThat(tracker.recordingCaptureId).isEqualTo("cap_rec00001")
    }

    @Test
    fun `nothing is declared by note outside a recording`() {
        assertThat(ContentCaptureTracker().note(visible(1), 0)).isEmpty()
    }

    @Test
    fun `a free or own message is not declared during a recording`() {
        val tracker = ContentCaptureTracker()
        val free = ContentCaptureCandidate("c1", oid(1), CaptureVerdict.FREE, false)
        val mine = ContentCaptureCandidate("c1", oid(2), CaptureVerdict.ANNOUNCED, true)

        assertThat(tracker.recordingStarted(listOf(free, mine), "cap_rec00001", 0)).isEmpty()
    }

    @Test
    fun `a failed recording report makes its messages declarable again under the same id`() {
        val tracker = ContentCaptureTracker()
        val failed = tracker.recordingStarted(visible(1), "cap_rec00001", 0).single()

        tracker.reportFailed(failed)
        val retry = tracker.note(visible(1), 10_000)

        assertThat(retry.single().messageIds).containsExactly(oid(1))
        assertThat(retry.single().captureId).isEqualTo("cap_rec00001")
    }

    @Test
    fun `a failed screenshot report changes nothing`() {
        val tracker = ContentCaptureTracker()
        val shot = tracker.screenshot(visible(1), "cap_aaaaaaaa").single()

        tracker.reportFailed(shot)

        assertThat(tracker.isRecording).isFalse()
    }
}
