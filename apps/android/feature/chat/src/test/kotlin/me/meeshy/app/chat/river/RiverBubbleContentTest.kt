package me.meeshy.app.chat.river

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleStoryReply
import me.meeshy.ui.component.bubble.EmojiDetector
import me.meeshy.ui.component.bubble.ReplyMediaKind
import org.junit.Test

class RiverBubbleContentTest {

    private fun contentOf(source: BubbleContent): RiverBubbleContent {
        val list = listOf(source)
        return RiverRenderingBuilder.build(
            geometry = RiverThreadMapping.geometry(list),
            bubbles = list,
            storyRing = { StoryRingState.None },
            zone = ZoneOffset.UTC,
            locale = Locale.FRANCE,
        ).contentByMessageId.getValue(source.messageId)
    }

    private fun reply(kind: ReplyMediaKind, thumb: String?, deleted: Boolean = false, text: String? = "photo") =
        riverBubble("b", "bob", 1, replyToId = "a", replyToSenderName = "Alice", replyToText = text)
            .copy(replyToMediaKind = kind, replyToThumbnailUrl = thumb, replyToDeleted = deleted)

    @Test
    fun `la citation d'une image garde sa vignette, sous la ligne`() {
        val preview = contentOf(reply(ReplyMediaKind.Image, "https://cdn/x.jpg")).replyPreview
        assertThat(preview?.thumbnailUrl).isEqualTo("https://cdn/x.jpg")
    }

    @Test
    fun `une citation supprimee ou d'un simple fichier ne montre aucune vignette`() {
        assertThat(contentOf(reply(ReplyMediaKind.Image, "https://cdn/x.jpg", deleted = true)).replyPreview?.thumbnailUrl).isNull()
        assertThat(contentOf(reply(ReplyMediaKind.File, "https://cdn/x.jpg")).replyPreview?.thumbnailUrl).isNull()
    }

    @Test
    fun `une citation sans texte mais avec vignette reste une citation`() {
        val content = contentOf(reply(ReplyMediaKind.Image, "https://cdn/x.jpg", text = null).copy(replyToSenderName = null))
        assertThat(content.replyPreview).isNotNull()
    }

    @Test
    fun `un emoji seul grossit, sauf dans une reponse ou sous protection`() {
        val alone = riverBubble("a", "alice", 0, text = "😀").copy(emojiOnlyCount = 1)
        assertThat(contentOf(alone).emojiFontSizeSp).isEqualTo(EmojiDetector.fontSizeSp(1))
        val inReply = alone.copy(replyToId = "z", replyToText = "x")
        assertThat(RiverRenderingBuilder.emojiFontSize(inReply)).isNull()
        val sealed = alone.copy(isEndToEndSealed = true)
        assertThat(RiverRenderingBuilder.emojiFontSize(sealed)).isNull()
    }

    @Test
    fun `la story citee et les pieces ne sortent jamais d'un message protege`() {
        val story = BubbleStoryReply(previewText = "story", postId = "p1")
        val open = riverBubble("a", "alice", 0).copy(storyReply = story, sealedPieceIds = listOf("p1"))
        assertThat(contentOf(open).storyReply).isEqualTo(story)
        assertThat(contentOf(open).attachments).isNotNull()

        val sealed = open.copy(isEndToEndSealed = true)
        assertThat(contentOf(sealed).storyReply).isNull()
        assertThat(contentOf(sealed).attachments).isNull()

        val burned = open.copy(isViewOnce = true, isViewOnceOpenedByMe = true)
        assertThat(contentOf(burned).storyReply).isNull()
        assertThat(contentOf(burned).attachments).isNull()
    }

    @Test
    fun `un message sans piece ne porte aucune source de pieces`() {
        assertThat(contentOf(riverBubble("a", "alice", 0)).attachments).isNull()
    }
}
