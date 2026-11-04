package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString
import org.junit.Test

class EphemeralEventsDecodeTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val oid = "0123456789abcdef01234567"
    private val oid2 = "fedcba9876543210fedcba98"

    private fun candidate(id: String = oid, conversation: String = "c1", mine: Boolean = false, verdict: ContentExitLaw.CaptureVerdict = ContentExitLaw.CaptureVerdict.BLOCKED) =
        ContentCaptureCandidate(conversation, id, verdict, mine)

    @Test
    fun `message consumed decodes who opened and the counters`() {
        val event = json.decodeFromString<MessageConsumedEvent>(
            """{"messageId":"m1","conversationId":"c1","userId":"u2","viewOnceCount":2,"maxViewOnceCount":3,"isFullyConsumed":false,"extra":1}""",
        )
        assertThat(event.userId).isEqualTo("u2")
        assertThat(event.viewOnceCount).isEqualTo(2)
        assertThat(event.maxViewOnceCount).isEqualTo(3)
    }

    @Test
    fun `message consumed tolerates a gateway that sends only the identity`() {
        val event = json.decodeFromString<MessageConsumedEvent>("""{"messageId":"m1","conversationId":"c1","userId":"u2"}""")
        assertThat(event.viewOnceCount).isEqualTo(0)
        assertThat(event.isFullyConsumed).isFalse()
    }

    @Test
    fun `countdown started and purged decode`() {
        val countdown = json.decodeFromString<MessageCountdownStartedEvent>(
            """{"messageId":"m1","conversationId":"c1","expiresAt":"2026-10-24T10:00:30Z"}""",
        )
        val purged = json.decodeFromString<MessageViewOncePurgedEvent>("""{"messageId":"m1","conversationId":"c1"}""")
        assertThat(countdown.expiresAt).isEqualTo("2026-10-24T10:00:30Z")
        assertThat(purged).isEqualTo(MessageViewOncePurgedEvent("m1", "c1"))
    }

    @Test
    fun `only a missing socket or a silent one falls back to REST`() {
        assertThat(ContentCaptureRefusal("NO_SOCKET").fallsBackToRest).isTrue()
        assertThat(ContentCaptureRefusal("TIMEOUT").fallsBackToRest).isTrue()
        assertThat(ContentCaptureRefusal("MALFORMED_ACK").fallsBackToRest).isTrue()
        listOf("UNAUTHENTICATED", "VALIDATION_ERROR", "NOT_A_PARTICIPANT", "RATE_LIMITED", "CONVERSATION_CLOSED", "HTTP_410")
            .forEach { assertThat(ContentCaptureRefusal(it).isFinal).isTrue() }
    }

    @Test
    fun `reports keep only declarable messages in screen order, one batch per conversation`() {
        val reports = ContentCaptureReport.reports(
            listOf(
                candidate(oid), candidate(oid), candidate("cid_pending"), candidate(oid2, mine = true),
                candidate(oid2, verdict = ContentExitLaw.CaptureVerdict.FREE), candidate(oid2, conversation = "c2"),
            ),
            ContentCaptureKind.SCREENSHOT, "cap_12345678",
        )
        assertThat(reports.map { it.conversationId to it.messageIds }).containsExactly("c1" to listOf(oid), "c2" to listOf(oid2)).inOrder()
    }

    @Test
    fun `a batch never exceeds ten messages`() {
        val ids = (0 until 23).map { "%024x".format(it) }
        val reports = ContentCaptureReport.reports(ids.map { candidate(it) }, ContentCaptureKind.SCREENSHOT, "cap_12345678")
        assertThat(reports.map { it.messageIds.size }).containsExactly(10, 10, 3).inOrder()
    }

    @Test
    fun `a new capture id is valid and the wire carries the kind`() {
        val id = ContentCaptureReport.newCaptureId()
        assertThat(ContentCaptureReport.isValidCaptureId(id)).isTrue()
        val report = ContentCaptureReport("c1", listOf(oid), ContentCaptureKind.RECORDING, id)
        assertThat(report.socketFields()["kind"]).isEqualTo("recording")
        assertThat(report.body().kind).isEqualTo("recording")
        assertThat(report.body().captureId).isEqualTo(id)
    }
}
