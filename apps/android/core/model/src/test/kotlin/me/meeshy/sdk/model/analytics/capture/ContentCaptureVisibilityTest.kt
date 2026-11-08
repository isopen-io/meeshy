package me.meeshy.sdk.model.analytics.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ContentExitLaw.CaptureVerdict
import org.junit.Test

class ContentCaptureVisibilityTest {

    private val oid = "0123456789abcdef01234567"
    private val quotedOid = "fedcba9876543210fedcba98"

    private fun message(
        viewOnce: Boolean? = null,
        source: String? = null,
        deletedAt: String? = null,
        senderId: String? = "other",
        ephemeral: Int? = null,
        replyTo: ApiMessageReplyPreview? = null,
    ) = ApiMessage(
        id = oid, conversationId = "c1", senderId = senderId, messageSource = source, deletedAt = deletedAt,
        isViewOnce = viewOnce, ephemeralDuration = ephemeral, replyTo = replyTo,
    )

    private fun candidates(message: ApiMessage, revealed: Boolean = false, viewer: String? = "me", serverId: String? = null) =
        ContentCaptureVisibility.candidates(message, viewer, revealed, serverId)

    @Test
    fun `an ordinary message is a free candidate`() {
        assertThat(candidates(message()).single().capture).isEqualTo(CaptureVerdict.FREE)
    }

    @Test
    fun `a flame is announced and a view once is blocked once revealed`() {
        assertThat(candidates(message(ephemeral = 30)).single().capture).isEqualTo(CaptureVerdict.ANNOUNCED)
        assertThat(candidates(message(viewOnce = true), revealed = true).single().capture).isEqualTo(CaptureVerdict.BLOCKED)
    }

    @Test
    fun `a sealed view once shows nothing and so declares nothing`() {
        assertThat(candidates(message(viewOnce = true), revealed = false)).isEmpty()
    }

    @Test
    fun `a system notice and a deleted message are excluded`() {
        assertThat(candidates(message(source = "system"))).isEmpty()
        assertThat(candidates(message(deletedAt = "2026-11-04T10:00:00Z"))).isEmpty()
    }

    @Test
    fun `the server id wins over the row id and my own message is marked mine`() {
        val c = candidates(message(senderId = "me"), serverId = quotedOid).single()

        assertThat(c.messageId).isEqualTo(quotedOid)
        assertThat(c.isMine).isTrue()
        assertThat(c.isDeclared).isFalse()
    }

    @Test
    fun `a quote is a second candidate carrying the quoted id`() {
        val out = candidates(message(replyTo = ApiMessageReplyPreview(id = quotedOid, senderId = "other")))

        assertThat(out.map { it.messageId }).containsExactly(oid, quotedOid).inOrder()
        assertThat(out[1].capture).isEqualTo(CaptureVerdict.ANNOUNCED)
        assertThat(out[1].isMine).isFalse()
    }

    @Test
    fun `a quote of a view once is blocked and a quote of my message is mine`() {
        val viewOnce = candidates(message(replyTo = ApiMessageReplyPreview(id = quotedOid, isViewOnce = true)))
        val mine = candidates(message(replyTo = ApiMessageReplyPreview(id = quotedOid, senderId = "me")))

        assertThat(viewOnce[1].capture).isEqualTo(CaptureVerdict.BLOCKED)
        assertThat(mine[1].isMine).isTrue()
    }

    @Test
    fun `a deleted quote adds no candidate`() {
        val out = candidates(message(replyTo = ApiMessageReplyPreview(id = quotedOid, deletedAt = "2026-11-04T10:00:00Z")))

        assertThat(out).hasSize(1)
    }

    @Test
    fun `a sealed view once still declares the quote it carries`() {
        val out = candidates(message(viewOnce = true, replyTo = ApiMessageReplyPreview(id = quotedOid)), revealed = false)

        assertThat(out.map { it.messageId }).containsExactly(quotedOid)
    }
}
