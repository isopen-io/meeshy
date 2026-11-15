package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentQuotedMediaTest {
    @Test
    fun `media nul est la nature seule et non une erreur`() {
        CommentQuotedMedia.Kind.entries.forEach { kind ->
            val citation = CommentQuotedMedia(postMediaId = "pm", kind = kind)
            assertThat(citation.media).isNull()
            assertThat(citation.thumbnailUrl).isNull()
        }
    }

    @Test
    fun `la vignette precede l'url du media`() {
        val withThumb = CommentQuotedMedia("a", CommentQuotedMedia.Kind.IMAGE, ApiPostMedia(id = "a", fileUrl = "f", thumbnailUrl = "t"))
        val noThumb = CommentQuotedMedia("a", CommentQuotedMedia.Kind.IMAGE, ApiPostMedia(id = "a", fileUrl = "f"))
        assertThat(withThumb.thumbnailUrl).isEqualTo("t")
        assertThat(noThumb.thumbnailUrl).isEqualTo("f")
    }
}
