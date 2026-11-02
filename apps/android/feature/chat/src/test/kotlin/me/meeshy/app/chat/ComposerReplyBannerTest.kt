package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

class ComposerReplyBannerTest {

    private fun bubble(
        text: String = "",
        isOutgoing: Boolean = false,
        senderName: String? = "Awa",
    ) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = senderName,
        showSenderName = true,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
    )

    @Test
    fun `a quoted text names its author and carries the text`() {
        val banner = ComposerReplyBanner.of(bubble(text = "On se voit demain ?"))

        assertThat(banner.author).isEqualTo(ReplyBannerAuthor.Named("Awa"))
        assertThat(banner.preview).isEqualTo("On se voit demain ?")
        assertThat(banner.kind).isEqualTo(ReplyBannerKind.Text)
    }

    @Test
    fun `replying to my own message names me as You, not by my name`() {
        val banner = ComposerReplyBanner.of(bubble(text = "ok", isOutgoing = true, senderName = "atabeth"))

        assertThat(banner.author).isEqualTo(ReplyBannerAuthor.Me)
    }

    @Test
    fun `a message without a name is never named by its text`() {
        val banner = ComposerReplyBanner.of(bubble(text = "Un long message sans nom", senderName = null))

        assertThat(banner.author).isEqualTo(ReplyBannerAuthor.Unknown)
        assertThat(banner.preview).isEqualTo("Un long message sans nom")
    }

    @Test
    fun `a quoted media without text is announced by its kind`() {
        val voice = bubble().copy(audios = listOf(BubbleAudio(attachmentId = "a1")))
        val photo = bubble().copy(images = listOf(BubbleImage(attachmentId = "i1", url = "u")))
        val video = bubble().copy(files = listOf(BubbleFile(attachmentId = "v1", name = "v.mp4", isVideo = true)), videoCount = 1)
        val file = bubble().copy(files = listOf(BubbleFile(attachmentId = "f1", name = "devis.pdf")))

        assertThat(ComposerReplyBanner.of(voice).kind).isEqualTo(ReplyBannerKind.Voice)
        assertThat(ComposerReplyBanner.of(photo).kind).isEqualTo(ReplyBannerKind.Photo)
        assertThat(ComposerReplyBanner.of(video).kind).isEqualTo(ReplyBannerKind.Video)
        assertThat(ComposerReplyBanner.of(file).kind).isEqualTo(ReplyBannerKind.File)
        assertThat(ComposerReplyBanner.of(file).preview).isNull()
    }

    @Test
    fun `a protected quoted message never shows its text`() {
        val blurred = bubble(text = "secret").copy(isBlurred = true)
        val viewOnce = bubble(text = "secret").copy(isViewOnce = true)

        assertThat(ComposerReplyBanner.of(blurred).preview).isNull()
        assertThat(ComposerReplyBanner.of(viewOnce).preview).isNull()
    }

    @Test
    fun `a reply whose quoted message is not loaded still gets a banner`() {
        val banner = ComposerReplyBanner.of(null)

        assertThat(banner.author).isEqualTo(ReplyBannerAuthor.Unknown)
        assertThat(banner.preview).isNull()
        assertThat(banner.kind).isEqualTo(ReplyBannerKind.Unloaded)
    }
}
