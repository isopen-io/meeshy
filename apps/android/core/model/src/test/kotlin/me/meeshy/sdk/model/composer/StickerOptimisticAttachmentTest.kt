package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSticker
import org.junit.Test

class StickerOptimisticAttachmentTest {

    private fun make(sticker: MessageSticker?) = StickerOptimisticAttachment.make(
        attachmentId = "att1", mimeType = "image/png", localUrl = "file:///tmp/s.png",
        widthPx = 200, heightPx = 100, scale = 2f, sticker = sticker, uploadedBy = "u1",
    )

    @Test
    fun `poids zero, dimensions fois l'echelle, vignette egale a l'URL locale`() {
        val a = make(null)
        assertThat(a.fileSize).isEqualTo(0)
        assertThat(a.width).isEqualTo(400)
        assertThat(a.height).isEqualTo(200)
        assertThat(a.fileUrl).isEqualTo("file:///tmp/s.png")
        assertThat(a.thumbnailUrl).isEqualTo("file:///tmp/s.png")
        assertThat(a.fileName).isEqualTo("sticker_att1.png")
        assertThat(a.alt).isNull()
    }

    @Test
    fun `le texte du sticker devient l'alt`() {
        assertThat(make(MessageSticker(emoji = "🎉")).alt).isEqualTo("🎉")
    }
}
