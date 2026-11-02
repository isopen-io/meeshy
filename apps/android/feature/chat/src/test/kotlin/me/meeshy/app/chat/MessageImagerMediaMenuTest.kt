package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

/** #14330 — iOS `canImagine = hasText || hasPaintableMedia` : une photo ou une vidéo seule offre « Imager » ; protégée, jamais. */
class MessageImagerMediaMenuTest {

    private val photo = BubbleImage(attachmentId = "a1", url = "https://cdn.test/a1.jpg", width = 800, height = 600)
    private val video = BubbleFile(attachmentId = "v1", name = "v.mp4", url = "https://cdn.test/v1.mp4", isVideo = true, thumbnailUrl = "https://cdn.test/v1.jpg")

    private fun bubble(
        text: String = "",
        images: List<BubbleImage> = emptyList(),
        files: List<BubbleFile> = emptyList(),
        exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
        isEndToEndSealed: Boolean = false,
        sealedPieceIds: List<String> = emptyList(),
    ) = BubbleContent(
        messageId = "507f1f77bcf86cd799439011", text = text, isOutgoing = false, isTranslated = false, originalText = null,
        senderName = "Awa", showSenderName = true, isEdited = false, isDeleted = false, createdAtIso = "2026-10-27T10:00:00.000Z",
        images = images, files = files, exitOffer = exitOffer, isEndToEndSealed = isEndToEndSealed, sealedPieceIds = sealedPieceIds,
    )

    private fun offersImager(bubble: BubbleContent) =
        MessageAction.ExportCard in MessageActionMenu.actions(bubble.actionContext(canWrite = true, hostedEntries = setOf(MessageAction.ExportCard)))

    @Test
    fun `a photo alone and a video alone offer imager`() {
        assertThat(offersImager(bubble(images = listOf(photo)))).isTrue()
        assertThat(offersImager(bubble(files = listOf(video)))).isTrue()
    }

    @Test
    fun `a message without text nor paintable media offers no imager`() {
        val document = BubbleFile(attachmentId = "d1", name = "doc.pdf", url = "https://cdn.test/d1.pdf")
        assertThat(offersImager(bubble(files = listOf(document)))).isFalse()
    }

    @Test
    fun `a protected photo, a view once or a flame message never offers imager, its text included`() {
        assertThat(offersImager(bubble(text = "regarde", images = listOf(photo.copy(isProtected = true))))).isFalse()
        assertThat(offersImager(bubble(images = listOf(photo), exitOffer = MessageExitOffer(ContentExitLaw.ViewOnce, holdsBlur = false, isEncrypted = false)))).isFalse()
        assertThat(offersImager(bubble(images = listOf(photo), exitOffer = MessageExitOffer(ContentExitLaw.timedFlame(60), holdsBlur = false, isEncrypted = false)))).isFalse()
        assertThat(offersImager(bubble(images = listOf(photo), exitOffer = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = true, isEncrypted = false)))).isFalse()
    }

    @Test
    fun `an encrypted piece is not paintable and an unopened end to end message offers nothing`() {
        assertThat(offersImager(bubble(images = listOf(photo), sealedPieceIds = listOf("a1")))).isFalse()
        assertThat(offersImager(bubble(files = listOf(video.copy(isSealed = true))))).isFalse()
        assertThat(offersImager(bubble(images = listOf(photo), isEndToEndSealed = true))).isFalse()
    }
}
