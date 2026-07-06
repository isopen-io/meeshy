package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

private data class Prefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

private fun message(
    id: String = "m1",
    senderId: String? = "other",
    content: String = "Hello",
    translations: List<ApiTextTranslation> = emptyList(),
    isEdited: Boolean = false,
    deletedAt: String? = null,
    sender: ApiMessageSender? = null,
) = ApiMessage(
    id = id,
    conversationId = "c1",
    senderId = senderId,
    content = content,
    originalLanguage = "en",
    isEdited = isEdited,
    deletedAt = deletedAt,
    translations = translations,
    sender = sender,
)

class BubbleContentBuilderTest {

    private val french = Prefs(systemLanguage = "fr")

    @Test
    fun `a message from the current user is outgoing`() {
        val content = BubbleContentBuilder.build(message(senderId = "me"), currentUserId = "me", preferences = french)

        assertThat(content.isOutgoing).isTrue()
    }

    @Test
    fun `a message from another user is incoming`() {
        val content = BubbleContentBuilder.build(message(senderId = "other"), currentUserId = "me", preferences = french)

        assertThat(content.isOutgoing).isFalse()
    }

    @Test
    fun `the preferred translation is displayed and the original is kept`() {
        val content = BubbleContentBuilder.build(
            message(
                content = "Hello",
                translations = listOf(
                    ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.text).isEqualTo("Bonjour")
        assertThat(content.isTranslated).isTrue()
        assertThat(content.originalText).isEqualTo("Hello")
    }

    @Test
    fun `showOriginal swaps a translated bubble back to its original text`() {
        val content = BubbleContentBuilder.build(
            message(
                content = "Hello",
                translations = listOf(
                    ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            showOriginal = true,
        )

        assertThat(content.text).isEqualTo("Hello")
        assertThat(content.isShowingOriginal).isTrue()
        assertThat(content.isTranslated).isTrue()
        assertThat(content.originalText).isNull()
    }

    @Test
    fun `showOriginal is inert on an untranslated bubble`() {
        val content = BubbleContentBuilder.build(
            message(content = "Hello"),
            currentUserId = "me",
            preferences = french,
            showOriginal = true,
        )

        assertThat(content.text).isEqualTo("Hello")
        assertThat(content.isShowingOriginal).isFalse()
    }

    @Test
    fun `with no matching translation the original content is shown (Prisme rule 1)`() {
        val content = BubbleContentBuilder.build(
            message(
                content = "Hello",
                translations = listOf(
                    ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.text).isEqualTo("Hello")
        assertThat(content.isTranslated).isFalse()
        assertThat(content.originalText).isNull()
    }

    @Test
    fun `a deleted message carries the deleted flag and no text`() {
        val content = BubbleContentBuilder.build(
            message(content = "secret", deletedAt = "2026-05-18T10:00:00Z"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isDeleted).isTrue()
        assertThat(content.text).isEmpty()
        assertThat(content.isTranslated).isFalse()
    }

    @Test
    fun `a reply to a deleted message carries the replyToDeleted flag and no preview text`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "secret",
                    senderDisplayName = "Alice",
                    deletedAt = "2026-05-18T10:00:00Z",
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToDeleted).isTrue()
        assertThat(content.replyToText).isNull()
        assertThat(content.replyToSenderName).isEqualTo("Alice")
    }

    @Test
    fun `a reply to a live message keeps its preview text`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "original",
                    senderDisplayName = "Alice",
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToDeleted).isFalse()
        assertThat(content.replyToText).isEqualTo("original")
        assertThat(content.replyToId).isEqualTo("r1")
    }

    @Test
    fun `a message with no reply carries a null replyToId`() {
        val content = BubbleContentBuilder.build(
            message().copy(replyTo = null),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToId).isNull()
    }

    @Test
    fun `the sender name shows only for incoming messages when requested`() {
        val sender = ApiMessageSender(displayName = "Alice")

        val incoming = BubbleContentBuilder.build(
            message(senderId = "other", sender = sender),
            currentUserId = "me",
            preferences = french,
            showSenderName = true,
        )
        val outgoing = BubbleContentBuilder.build(
            message(senderId = "me", sender = sender),
            currentUserId = "me",
            preferences = french,
            showSenderName = true,
        )

        assertThat(incoming.showSenderName).isTrue()
        assertThat(incoming.senderName).isEqualTo("Alice")
        assertThat(outgoing.showSenderName).isFalse()
    }

    @Test
    fun `a pending outgoing message shows the Pending status`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "me"),
            currentUserId = "me",
            preferences = french,
            isPending = true,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Pending)
    }

    @Test
    fun `a failed outgoing message shows the Failed status even while pending`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "me"),
            currentUserId = "me",
            preferences = french,
            isPending = true,
            isFailed = true,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Failed)
    }

    @Test
    fun `incoming messages never show a failure status`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "other"),
            currentUserId = "me",
            preferences = french,
            isFailed = true,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Sent)
    }

    @Test
    fun `the edited flag passes through`() {
        val content = BubbleContentBuilder.build(
            message(isEdited = true),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isEdited).isTrue()
    }

    @Test
    fun `an image attachment becomes a bubble image with its url resolved against the media base`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "a1",
                        mimeType = "image/jpeg",
                        fileUrl = "/files/photo.jpg",
                        thumbnailUrl = "/files/photo_thumb.jpg",
                        width = 800,
                        height = 600,
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://gate.meeshy.me",
        )

        val image = content.images.single()
        assertThat(image.attachmentId).isEqualTo("a1")
        assertThat(image.url).isEqualTo("https://gate.meeshy.me/files/photo.jpg")
        assertThat(image.thumbnailUrl).isEqualTo("https://gate.meeshy.me/files/photo_thumb.jpg")
        assertThat(image.width).isEqualTo(800)
        assertThat(image.height).isEqualTo(600)
        assertThat(content.files).isEmpty()
    }

    @Test
    fun `an absolute attachment url is kept as-is`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "a1",
                        mimeType = "image/png",
                        fileUrl = "https://cdn.meeshy.me/files/photo.png",
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://gate.meeshy.me",
        )

        assertThat(content.images.single().url).isEqualTo("https://cdn.meeshy.me/files/photo.png")
    }

    @Test
    fun `a non-image attachment becomes a bubble file named after its original name`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "a1",
                        fileName = "stored-1234.pdf",
                        originalName = "rapport.pdf",
                        mimeType = "application/pdf",
                        fileSize = 2048,
                        fileUrl = "/files/stored-1234.pdf",
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://gate.meeshy.me",
        )

        val file = content.files.single()
        assertThat(file.name).isEqualTo("rapport.pdf")
        assertThat(file.sizeBytes).isEqualTo(2048)
        assertThat(content.images).isEmpty()
    }

    @Test
    fun `a file attachment without any name carries a null name for the renderer to localize`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "a1",
                        mimeType = "application/pdf",
                        fileSize = 2048,
                        fileUrl = "/files/stored-1234.pdf",
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.files.single().name).isNull()
    }

    @Test
    fun `an image attachment without a file url is skipped`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "a1", mimeType = "image/jpeg"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.images).isEmpty()
        assertThat(content.files).isEmpty()
    }

    @Test
    fun `a deleted message hides its attachments`() {
        val content = BubbleContentBuilder.build(
            message(deletedAt = "2026-05-18T10:00:00Z").copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "a1", mimeType = "image/jpeg", fileUrl = "/files/p.jpg"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.images).isEmpty()
        assertThat(content.files).isEmpty()
    }

    @Test
    fun `an emoji-only message carries its cluster count`() {
        val content = BubbleContentBuilder.build(
            message(content = "😂🔥"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.emojiOnlyCount).isEqualTo(2)
    }

    @Test
    fun `attachments disable the emoji-only treatment`() {
        val content = BubbleContentBuilder.build(
            message(content = "😂").copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "a1", mimeType = "image/jpeg", fileUrl = "/p.jpg"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.emojiOnlyCount).isEqualTo(0)
    }

    @Test
    fun `regular text is not emoji-only`() {
        val content = BubbleContentBuilder.build(
            message(content = "Hello"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.emojiOnlyCount).isEqualTo(0)
    }

    @Test
    fun `own reactions mark their entry as includesMe`() {
        val content = BubbleContentBuilder.build(
            message().copy(reactionSummary = mapOf("❤️" to 2, "🔥" to 1)),
            currentUserId = "me",
            preferences = french,
            ownReactions = setOf("❤️"),
        )

        assertThat(content.reactions.single { it.emoji == "❤️" }.includesMe).isTrue()
        assertThat(content.reactions.single { it.emoji == "🔥" }.includesMe).isFalse()
    }

}
