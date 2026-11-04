package me.meeshy.sdk.model.analytics.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentCaptureCandidate
import me.meeshy.sdk.model.ContentCaptureKind
import me.meeshy.sdk.model.ContentCaptureReport
import me.meeshy.sdk.model.ContentExitLaw.CaptureVerdict
import org.junit.Test

class ContentCaptureReportTest {

    private fun oid(n: Int) = n.toString(16).padStart(24, '0')

    private fun candidate(
        n: Int,
        conversation: String = "c1",
        verdict: CaptureVerdict = CaptureVerdict.ANNOUNCED,
        mine: Boolean = false,
        id: String = oid(n),
    ) = ContentCaptureCandidate(conversation, id, verdict, mine)

    private fun reports(vararg candidates: ContentCaptureCandidate) =
        ContentCaptureReport.reports(candidates.toList(), ContentCaptureKind.SCREENSHOT, "cap_12345678")

    @Test
    fun `a message still in flight is never declared`() {
        assertThat(reports(candidate(1, id = "cid_0123456789abcdef"))).isEmpty()
    }

    @Test
    fun `an id that is not a 24 hex ObjectId is never declared`() {
        assertThat(reports(candidate(1, id = "0123"), candidate(2, id = "g".repeat(24)))).isEmpty()
    }

    @Test
    fun `my own message, a free message and a missing conversation are never declared`() {
        assertThat(reports(candidate(1, mine = true), candidate(2, verdict = CaptureVerdict.FREE), candidate(3, conversation = ""))).isEmpty()
    }

    @Test
    fun `a blocked message is declared`() {
        assertThat(reports(candidate(1, verdict = CaptureVerdict.BLOCKED)).single().messageIds).containsExactly(oid(1))
    }

    @Test
    fun `twenty five messages of one conversation split into chunks of ten in screen order`() {
        val chunks = reports(*(1..25).map { candidate(it) }.toTypedArray())

        assertThat(chunks.map { it.messageIds.size }).containsExactly(10, 10, 5).inOrder()
        assertThat(chunks.flatMap { it.messageIds }).containsExactlyElementsIn((1..25).map(::oid)).inOrder()
    }

    @Test
    fun `each conversation gets its own report in order of first appearance and a duplicate is dropped`() {
        val out = reports(candidate(1, "b"), candidate(2, "a"), candidate(1, "b"), candidate(3, "b"))

        assertThat(out.map { it.conversationId }).containsExactly("b", "a").inOrder()
        assertThat(out.first().messageIds).containsExactly(oid(1), oid(3)).inOrder()
    }

    @Test
    fun `every report of one capture carries the same capture id`() {
        assertThat(reports(candidate(1, "a"), candidate(2, "b")).map { it.captureId }.toSet()).containsExactly("cap_12345678")
    }

    @Test
    fun `a fresh capture id is valid, prefixed and unique`() {
        val a = ContentCaptureReport.newCaptureId()
        val b = ContentCaptureReport.newCaptureId()

        assertThat(a).startsWith("cap_")
        assertThat(ContentCaptureReport.isValidCaptureId(a)).isTrue()
        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `a capture id must be 8 to 64 safe characters`() {
        assertThat(ContentCaptureReport.isValidCaptureId("short")).isFalse()
        assertThat(ContentCaptureReport.isValidCaptureId("a".repeat(65))).isFalse()
        assertThat(ContentCaptureReport.isValidCaptureId("has space1")).isFalse()
        assertThat(ContentCaptureReport.isValidCaptureId("ok_id-123")).isTrue()
    }
}
