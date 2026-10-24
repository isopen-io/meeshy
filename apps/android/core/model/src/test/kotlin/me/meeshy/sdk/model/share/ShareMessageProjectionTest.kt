package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

class ShareMessageProjectionTest {

    private fun message(
        content: String = "bonjour",
        viewOnce: Boolean? = null,
        blurred: Boolean? = null,
        flags: Int? = null,
        duration: Int? = null,
        expires: String? = null,
        encrypted: Boolean? = null,
        attachments: List<ApiMessageAttachment> = emptyList(),
        replyTo: ApiMessageReplyPreview? = null,
    ) = ApiMessage(
        id = "m", conversationId = "c", content = content, isViewOnce = viewOnce, isBlurred = blurred,
        effectFlags = flags, ephemeralDuration = duration, expiresAt = expires, isEncrypted = encrypted,
        attachments = attachments, replyTo = replyTo,
    )

    @Test
    fun `a plain message projects its text and no protection`() {
        val share = message().shareMessage()
        assertThat(share.id).isEqualTo("m")
        assertThat(share.text).isEqualTo("bonjour")
        assertThat(share.encrypted).isFalse()
        assertThat(share.citesProtected).isFalse()
        assertThat(share.exitLaw()).isEqualTo(ContentExitLaw.Ordinary)
        assertThat(message(content = "").shareMessage().text).isNull()
    }

    @Test
    fun `message flags are read through the exit law subject`() {
        val timed = message(flags = MessageEffectFlags.EPHEMERAL.toInt(), duration = 60).shareMessage()
        assertThat(timed.ephemeralDuration).isEqualTo(60.0)
        assertThat(timed.exitLaw().forward).isEqualTo(ContentExitLaw.ForwardVerdict.Allowed(60))

        val afterRead = (MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ).toInt()
        assertThat(message(flags = afterRead).shareMessage().exitLaw().nature)
            .isEqualTo(ContentExitLaw.Nature.AFTER_READ_FLAME)

        val expiring = message(expires = "2026-10-23T10:00:00Z").shareMessage()
        assertThat(expiring.expiresAt).isEqualTo("2026-10-23T10:00:00Z")
        assertThat(expiring.exitLaw().nature).isEqualTo(ContentExitLaw.Nature.AFTER_READ_FLAME)

        assertThat(message(viewOnce = true).shareMessage().exitLaw().nature).isEqualTo(ContentExitLaw.Nature.VIEW_ONCE)
        assertThat(message(blurred = true).shareMessage().isBlurred).isTrue()
    }

    @Test
    fun `piece flags travel with each piece and the most restrictive wins`() {
        val ordinary = ApiMessageAttachment(id = "a", mimeType = "image/jpeg", fileSize = 2048, duration = null)
        val viewOnce = ApiMessageAttachment(id = "b", mimeType = "video/mp4", duration = 4000, isViewOnce = true)
        val share = message(attachments = listOf(ordinary, viewOnce)).shareMessage()

        assertThat(share.pieces.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(share.pieces[0].bytes).isEqualTo(2048L)
        assertThat(share.pieces[1].durationMs).isEqualTo(4000)
        assertThat(share.pieces[1].isViewOnce).isTrue()
        assertThat(share.exitLaw().nature).isEqualTo(ContentExitLaw.Nature.VIEW_ONCE)
        assertThat(share.exitLaw(chosen = listOf(share.pieces[0])).nature).isEqualTo(ContentExitLaw.Nature.ORDINARY)
    }

    @Test
    fun `a blurred or after read piece keeps its own flags`() {
        val blurred = ApiMessageAttachment(id = "a", mimeType = "image/png", isBlurred = true)
        val flame = ApiMessageAttachment(id = "b", mimeType = "image/png", effectFlags = MessageEffectFlags.EPHEMERAL_AFTER_READ)
        val share = message(attachments = listOf(blurred, flame)).shareMessage()

        assertThat(share.pieces[0].isBlurred).isTrue()
        assertThat(share.pieces[1].effectFlags).isEqualTo(MessageEffectFlags.EPHEMERAL_AFTER_READ)
        assertThat(share.exitLaw().nature).isEqualTo(ContentExitLaw.Nature.AFTER_READ_FLAME)
    }

    @Test
    fun `an empty size is unknown and a shared place is not a piece`() {
        val empty = ApiMessageAttachment(id = "a", mimeType = "application/pdf", fileSize = 0)
        val place = ApiMessageAttachment(id = "p", latitude = 48.89, longitude = 2.25)
        val share = message(attachments = listOf(empty, place)).shareMessage()

        assertThat(share.pieces.map { it.id }).containsExactly("a")
        assertThat(share.pieces.single().bytes).isNull()
        assertThat(ApiMessageAttachment(id = "x").shareMedia.mimeType).isEmpty()
    }

    @Test
    fun `encryption of the message or a piece or the conversation marks the share encrypted`() {
        assertThat(message(encrypted = true).shareMessage().encrypted).isTrue()
        val cipherPiece = ApiMessageAttachment(id = "a", mimeType = "image/jpeg", isEncrypted = true)
        assertThat(message(attachments = listOf(cipherPiece)).shareMessage().encrypted).isTrue()
        assertThat(message().shareMessage(conversationIsEncrypted = true).encrypted).isTrue()
    }

    @Test
    fun `quoting a protected message is carried as cites protected`() {
        val quoted = ApiMessageReplyPreview(id = "q", isViewOnce = true)
        assertThat(message(replyTo = quoted).shareMessage().citesProtected).isTrue()
        assertThat(message(replyTo = quoted.copy(isViewOnce = false)).shareMessage().citesProtected).isFalse()
    }
}
