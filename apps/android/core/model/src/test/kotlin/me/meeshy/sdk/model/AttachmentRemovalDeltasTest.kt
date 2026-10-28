package me.meeshy.sdk.model

import me.meeshy.sdk.model.preview.LastMessageAttachmentSummary

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentRemovalDeltasTest {

    private val at = "2026-10-28T10:00:00Z"

    private fun piece(id: String, mime: String = "image/jpeg", size: Int = 10) =
        ApiMessageAttachment(id = id, mimeType = mime, fileSize = size)

    private fun message(content: String, vararg pieces: ApiMessageAttachment) =
        ApiMessage(id = "m1", conversationId = "c1", senderId = "u1", content = content, attachments = pieces.toList())

    @Test
    fun `the piece leaves a message that keeps its text`() {
        val result = AttachmentRemovalDeltas.message(message("légende", piece("a"), piece("b")), "a", at)

        assertThat(result.attachments.map { it.id }).containsExactly("b")
        assertThat(result.content).isEqualTo("légende")
        assertThat(result.deletedAt).isNull()
    }

    @Test
    fun `a message left with neither text nor piece becomes a tombstone like a local deletion`() {
        val result = AttachmentRemovalDeltas.message(message("  ", piece("a")), "a", at)

        assertThat(result.attachments).isEmpty()
        assertThat(result.content).isEmpty()
        assertThat(result.deletedAt).isEqualTo(at)
    }

    @Test
    fun `the last piece of a captioned message leaves the caption alone`() {
        val result = AttachmentRemovalDeltas.message(message("légende", piece("a")), "a", at)

        assertThat(result.attachments).isEmpty()
        assertThat(result.deletedAt).isNull()
    }

    @Test
    fun `a piece already gone is the same instance, so nothing is written twice`() {
        val gone = message("x", piece("b"))

        assertThat(AttachmentRemovalDeltas.message(gone, "a", at)).isSameInstanceAs(gone)
    }

    private fun conversation(last: ApiConversationLastMessage?) = ApiConversation(
        id = "c1",
        lastMessage = last,
        lastMessageTranslations = mapOf("en" to "caption"),
    )

    private fun last(content: String?, vararg pieces: ApiMessageAttachment) = ApiConversationLastMessage(
        id = "m1",
        content = content,
        messageType = "image",
        attachments = pieces.toList(),
        count = ApiMessageCount(attachments = pieces.size),
        attachmentSummary = LastMessageAttachmentSummary(
            count = pieces.size,
            kinds = pieces.groupingBy { it.mimeType!!.substringBefore('/') }.eachCount(),
            totalSize = pieces.sumOf { (it.fileSize ?: 0).toLong() },
        ),
    )

    @Test
    fun `the list preview of the last message drops the piece and recounts its summary`() {
        val before = conversation(last("", piece("a"), piece("b", "video/mp4", 30)))

        val after = AttachmentRemovalDeltas.preview(before, "m1", "a", previous = null)

        val preview = after.lastMessage!!
        assertThat(preview.attachments!!.map { it.id }).containsExactly("b")
        assertThat(preview.count?.attachments).isEqualTo(1)
        assertThat(preview.attachmentSummary).isEqualTo(
            LastMessageAttachmentSummary(count = 1, kinds = mapOf("video" to 1), totalSize = 30),
        )
    }

    @Test
    fun `a preview of another message, or already without the piece, is the same instance`() {
        val before = conversation(last("", piece("b")))

        assertThat(AttachmentRemovalDeltas.preview(before, "other", "b", null)).isSameInstanceAs(before)
        assertThat(AttachmentRemovalDeltas.preview(before, "m1", "a", null)).isSameInstanceAs(before)
        assertThat(AttachmentRemovalDeltas.preview(conversation(null), "m1", "a", null).lastMessage).isNull()
    }

    @Test
    fun `an emptied last message gives the row back the previous message`() {
        val before = conversation(last("", piece("a")))
        val previous = ApiMessage(
            id = "m0", conversationId = "c1", senderId = "u2", content = "avant", originalLanguage = "fr",
            createdAt = "2026-10-28T09:00:00Z", sender = ApiMessageSender(displayName = "Zoé"),
        )

        val after = AttachmentRemovalDeltas.preview(before, "m1", "a", previous)

        assertThat(after.lastMessage?.id).isEqualTo("m0")
        assertThat(after.lastMessage?.content).isEqualTo("avant")
        assertThat(after.lastMessage?.senderName).isEqualTo("Zoé")
        assertThat(after.lastMessageTranslations).isNull()
        assertThat(after.lastMessageOriginalLanguage).isEqualTo("fr")
    }

    @Test
    fun `an emptied last message with no previous one shows nothing instead of a stale photo`() {
        val after = AttachmentRemovalDeltas.preview(conversation(last("", piece("a"))), "m1", "a", null)

        val preview = after.lastMessage!!
        assertThat(preview.attachments).isEmpty()
        assertThat(preview.attachmentSummary).isNull()
        assertThat(preview.messageType).isEqualTo("text")
        assertThat(after.lastMessageTranslations).isNull()
    }

    @Test
    fun `a captioned last message keeps its caption and its translations`() {
        val after = AttachmentRemovalDeltas.preview(conversation(last("légende", piece("a"))), "m1", "a", null)

        assertThat(after.lastMessage?.content).isEqualTo("légende")
        assertThat(after.lastMessageTranslations).isNotNull()
        assertThat(after.lastMessage?.attachmentSummary).isNull()
    }
}
