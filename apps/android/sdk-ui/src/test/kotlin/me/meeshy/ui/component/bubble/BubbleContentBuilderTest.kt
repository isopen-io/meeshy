package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiPostReplyTarget
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
    deliveredCount: Int = 0,
    readCount: Int = 0,
    readByAllAt: String? = null,
    pinnedAt: String? = null,
    forwardedFromId: String? = null,
    forwardedFromConversationId: String? = null,
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
    deliveredCount = deliveredCount,
    readCount = readCount,
    readByAllAt = readByAllAt,
    pinnedAt = pinnedAt,
    forwardedFromId = forwardedFromId,
    forwardedFromConversationId = forwardedFromConversationId,
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
    fun `a reply to a text-only message has no media kind and no thumbnail`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(id = "r1", content = "hi"),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.None)
        assertThat(content.replyToThumbnailUrl).isNull()
    }

    @Test
    fun `a reply to an image message is flagged Image with the resolved thumbnail url`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "",
                    attachments = listOf(
                        ApiMessageAttachment(
                            id = "a1",
                            mimeType = "image/jpeg",
                            thumbnailUrl = "/thumbs/a1.jpg",
                            fileUrl = "/files/a1.jpg",
                        ),
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.Image)
        assertThat(content.replyToThumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/a1.jpg")
    }

    @Test
    fun `a reply to an image with no thumbnail falls back to the file url`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "",
                    attachments = listOf(
                        ApiMessageAttachment(id = "a1", mimeType = "image/png", fileUrl = "/files/a1.png"),
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.Image)
        assertThat(content.replyToThumbnailUrl).isEqualTo("https://cdn.meeshy.me/files/a1.png")
    }

    @Test
    fun `a reply to an image with neither thumbnail nor file url is Image with a null thumbnail`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "",
                    attachments = listOf(ApiMessageAttachment(id = "a1", mimeType = "image/webp")),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.Image)
        assertThat(content.replyToThumbnailUrl).isNull()
    }

    @Test
    fun `a reply to a non-image attachment is flagged File with no thumbnail`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "",
                    attachments = listOf(
                        ApiMessageAttachment(id = "a1", mimeType = "application/pdf", fileUrl = "/files/report.pdf"),
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.File)
        assertThat(content.replyToThumbnailUrl).isNull()
    }

    @Test
    fun `a reply carrying both a file and an image prefers the image thumbnail regardless of order`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "look",
                    attachments = listOf(
                        ApiMessageAttachment(id = "f1", mimeType = "application/pdf", fileUrl = "/files/x.pdf"),
                        ApiMessageAttachment(id = "i1", mimeType = "image/jpeg", thumbnailUrl = "/thumbs/i1.jpg"),
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.Image)
        assertThat(content.replyToThumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/i1.jpg")
    }

    @Test
    fun `a reply to a deleted message suppresses its media kind and thumbnail`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "secret",
                    deletedAt = "2026-05-18T10:00:00Z",
                    attachments = listOf(
                        ApiMessageAttachment(id = "a1", mimeType = "image/jpeg", thumbnailUrl = "/thumbs/a1.jpg"),
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.replyToDeleted).isTrue()
        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.None)
        assertThat(content.replyToThumbnailUrl).isNull()
    }

    @Test
    fun `a message with no reply has no reply media`() {
        val content = BubbleContentBuilder.build(
            message().copy(replyTo = null),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.replyToMediaKind).isEqualTo(ReplyMediaKind.None)
        assertThat(content.replyToThumbnailUrl).isNull()
    }

    @Test
    fun `an absolute reply thumbnail url is left unchanged by the media base url`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(
                    id = "r1",
                    content = "",
                    attachments = listOf(
                        ApiMessageAttachment(
                            id = "a1",
                            mimeType = "image/jpeg",
                            thumbnailUrl = "https://other.cdn/x.jpg",
                        ),
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.replyToThumbnailUrl).isEqualTo("https://other.cdn/x.jpg")
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
    fun `a direct message the peer read shows Read`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "me", deliveredCount = 1, readCount = 1),
            currentUserId = "me",
            preferences = french,
            recipientCount = 1,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Read)
    }

    @Test
    fun `a group message only one member read stays Sent`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "me", deliveredCount = 1, readCount = 1),
            currentUserId = "me",
            preferences = french,
            recipientCount = 4,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Sent)
    }

    @Test
    fun `a group message every member received shows Delivered`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "me", deliveredCount = 4, readCount = 0),
            currentUserId = "me",
            preferences = french,
            recipientCount = 4,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Delivered)
    }

    @Test
    fun `a group message every member read shows Read`() {
        val content = BubbleContentBuilder.build(
            message(senderId = "me", deliveredCount = 4, readCount = 4),
            currentUserId = "me",
            preferences = french,
            recipientCount = 4,
        )

        assertThat(content.deliveryStatus).isEqualTo(DeliveryStatus.Read)
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
    fun `a location attachment becomes a bubble location, not a file`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "loc1",
                        originalName = "Tour Eiffel",
                        mimeType = "application/x-location",
                        latitude = 48.8584,
                        longitude = 2.2945,
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        val location = content.locations.single()
        assertThat(location.attachmentId).isEqualTo("loc1")
        assertThat(location.latitude).isEqualTo(48.8584)
        assertThat(location.longitude).isEqualTo(2.2945)
        assertThat(location.placeName).isEqualTo("Tour Eiffel")
        assertThat(content.files).isEmpty()
        assertThat(content.images).isEmpty()
    }

    @Test
    fun `a location with a blank original name carries a null place name`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "loc1",
                        originalName = "   ",
                        mimeType = "application/x-location",
                        latitude = 1.0,
                        longitude = 2.0,
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.locations.single().placeName).isNull()
    }

    @Test
    fun `a location attachment without coordinates is still surfaced as a location`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "loc1", mimeType = "application/x-location"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        val location = content.locations.single()
        assertThat(location.hasCoordinates).isFalse()
        assertThat(content.files).isEmpty()
    }

    @Test
    fun `an image, a file and a location land in their own buckets`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "img", mimeType = "image/jpeg", fileUrl = "/p.jpg"),
                    ApiMessageAttachment(id = "doc", mimeType = "application/pdf", fileUrl = "/x.pdf"),
                    ApiMessageAttachment(
                        id = "loc",
                        mimeType = "application/x-location",
                        latitude = 1.0,
                        longitude = 2.0,
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.images.single().attachmentId).isEqualTo("img")
        assertThat(content.files.single().attachmentId).isEqualTo("doc")
        assertThat(content.locations.single().attachmentId).isEqualTo("loc")
    }

    @Test
    fun `a deleted message hides its location`() {
        val content = BubbleContentBuilder.build(
            message(deletedAt = "2026-05-18T10:00:00Z").copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "loc1",
                        mimeType = "application/x-location",
                        latitude = 1.0,
                        longitude = 2.0,
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.locations).isEmpty()
    }

    @Test
    fun `a location attachment disables the emoji-only treatment`() {
        val content = BubbleContentBuilder.build(
            message(content = "😂").copy(
                attachments = listOf(
                    ApiMessageAttachment(
                        id = "loc1",
                        mimeType = "application/x-location",
                        latitude = 1.0,
                        longitude = 2.0,
                    ),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.emojiOnlyCount).isEqualTo(0)
    }

    @Test
    fun `a message with no location attachment has an empty locations list`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                attachments = listOf(
                    ApiMessageAttachment(id = "img", mimeType = "image/jpeg", fileUrl = "/p.jpg"),
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.locations).isEmpty()
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

    @Test
    fun `a pinned message carries its pinned instant`() {
        val content = BubbleContentBuilder.build(
            message(pinnedAt = "2026-07-08T10:00:00Z"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.pinnedAtIso).isEqualTo("2026-07-08T10:00:00Z")
    }

    @Test
    fun `a blank pinned instant is dropped`() {
        val content = BubbleContentBuilder.build(
            message(pinnedAt = "   "),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.pinnedAtIso).isNull()
    }

    @Test
    fun `a deleted message is never pinned`() {
        val content = BubbleContentBuilder.build(
            message(deletedAt = "2026-07-08T09:00:00Z", pinnedAt = "2026-07-08T10:00:00Z"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.pinnedAtIso).isNull()
    }

    @Test
    fun `a message forwarded from another message is flagged forwarded`() {
        val content = BubbleContentBuilder.build(
            message(forwardedFromId = "orig-msg", forwardedFromConversationId = "orig-conv"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isForwarded).isTrue()
    }

    @Test
    fun `a message with no forward origin is not flagged forwarded`() {
        val content = BubbleContentBuilder.build(
            message(forwardedFromId = null),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isForwarded).isFalse()
    }

    @Test
    fun `a blank forward origin id is not flagged forwarded`() {
        val content = BubbleContentBuilder.build(
            message(forwardedFromId = "   "),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isForwarded).isFalse()
    }

    @Test
    fun `a forward flagged only by conversation id is not forwarded`() {
        val content = BubbleContentBuilder.build(
            message(forwardedFromId = null, forwardedFromConversationId = "orig-conv"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isForwarded).isFalse()
    }

    @Test
    fun `a deleted message is never flagged forwarded`() {
        val content = BubbleContentBuilder.build(
            message(deletedAt = "2026-07-08T09:00:00Z", forwardedFromId = "orig-msg"),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.isForwarded).isFalse()
    }

    // --- Story / mood reply previews (postReplyTo / storyReplyToId) ---

    @Test
    fun `a message with no post reply carries a null storyReply`() {
        val content = BubbleContentBuilder.build(
            message(),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.storyReply).isNull()
    }

    @Test
    fun `a story-reply snapshot projects its metrics and resolved thumbnail`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                postReplyTo = ApiPostReplyTarget(
                    id = "p1",
                    type = "STORY",
                    reactionCount = 4,
                    commentCount = 2,
                    shareCount = 1,
                    thumbnailUrl = "/thumbs/p1.jpg",
                    previewText = "beach sunset",
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        val story = content.storyReply
        assertThat(story).isNotNull()
        assertThat(story!!.isMood).isFalse()
        assertThat(story.reactionCount).isEqualTo(4)
        assertThat(story.commentCount).isEqualTo(2)
        assertThat(story.shareCount).isEqualTo(1)
        assertThat(story.hasMetrics).isTrue()
        assertThat(story.previewText).isEqualTo("beach sunset")
        assertThat(story.thumbnailUrl).isEqualTo("https://cdn.meeshy.me/thumbs/p1.jpg")
        assertThat(story.moodEmoji).isNull()
    }

    @Test
    fun `a story reply with no engagement has no metrics`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                postReplyTo = ApiPostReplyTarget(id = "p1", previewText = ""),
            ),
            currentUserId = "me",
            preferences = french,
        )

        val story = content.storyReply
        assertThat(story).isNotNull()
        assertThat(story!!.hasMetrics).isFalse()
        assertThat(story.thumbnailUrl).isNull()
    }

    @Test
    fun `an absolute story thumbnail url is passed through unchanged`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                postReplyTo = ApiPostReplyTarget(
                    id = "p1",
                    thumbnailUrl = "https://other.cdn/p1.jpg",
                ),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.storyReply?.thumbnailUrl).isEqualTo("https://other.cdn/p1.jpg")
    }

    @Test
    fun `a blank story thumbnail url is dropped`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                postReplyTo = ApiPostReplyTarget(id = "p1", thumbnailUrl = "   "),
            ),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = "https://cdn.meeshy.me",
        )

        assertThat(content.storyReply?.thumbnailUrl).isNull()
    }

    @Test
    fun `a mood-reply snapshot projects the emoji and preview text without metrics`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                postReplyTo = ApiPostReplyTarget(
                    id = "p1",
                    reactionCount = 9,
                    previewText = "feeling great",
                    moodEmoji = "😄",
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        val story = content.storyReply
        assertThat(story).isNotNull()
        assertThat(story!!.isMood).isTrue()
        assertThat(story.moodEmoji).isEqualTo("😄")
        assertThat(story.previewText).isEqualTo("feeling great")
        // A mood carries no story engagement metrics or thumbnail.
        assertThat(story.hasMetrics).isFalse()
        assertThat(story.thumbnailUrl).isNull()
    }

    @Test
    fun `a blank mood emoji falls back to a story preview`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                postReplyTo = ApiPostReplyTarget(
                    id = "p1",
                    reactionCount = 3,
                    previewText = "hi",
                    moodEmoji = "  ",
                ),
            ),
            currentUserId = "me",
            preferences = french,
        )

        val story = content.storyReply
        assertThat(story).isNotNull()
        assertThat(story!!.isMood).isFalse()
        assertThat(story.reactionCount).isEqualTo(3)
    }

    @Test
    fun `a bare story reply id yields a metadata-less story preview`() {
        val content = BubbleContentBuilder.build(
            message().copy(storyReplyToId = "story-42"),
            currentUserId = "me",
            preferences = french,
        )

        val story = content.storyReply
        assertThat(story).isNotNull()
        assertThat(story!!.isMood).isFalse()
        assertThat(story.hasMetrics).isFalse()
        assertThat(story.previewText).isEmpty()
    }

    @Test
    fun `a blank story reply id yields no story preview`() {
        val content = BubbleContentBuilder.build(
            message().copy(storyReplyToId = "   "),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.storyReply).isNull()
    }

    @Test
    fun `a message reply takes precedence over a post reply snapshot`() {
        val content = BubbleContentBuilder.build(
            message().copy(
                replyTo = me.meeshy.sdk.model.ApiMessageReplyPreview(id = "r1", content = "quoted"),
                postReplyTo = ApiPostReplyTarget(id = "p1", previewText = "story"),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.storyReply).isNull()
        assertThat(content.replyToText).isEqualTo("quoted")
    }

    @Test
    fun `a deleted message never carries a story reply`() {
        val content = BubbleContentBuilder.build(
            message(deletedAt = "2026-07-09T09:00:00Z").copy(
                postReplyTo = ApiPostReplyTarget(id = "p1", previewText = "story", reactionCount = 5),
            ),
            currentUserId = "me",
            preferences = french,
        )

        assertThat(content.storyReply).isNull()
    }

}
