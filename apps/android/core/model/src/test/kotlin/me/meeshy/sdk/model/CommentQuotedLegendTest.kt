package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentQuotedLegendTest {
    private fun citation(caption: String?, withMedia: Boolean = true) = CommentQuotedMedia(
        postMediaId = "pm",
        kind = CommentQuotedMedia.Kind.VIDEO,
        media = if (withMedia) ApiPostMedia(id = "pm", fileUrl = "f", caption = caption) else null,
    )

    @Test
    fun `la legende du media precede sa nature`() {
        assertThat(citation("Le coucher de soleil").legend).isEqualTo(CommentQuotedLegend.Caption("Le coucher de soleil"))
    }

    @Test
    fun `une legende blanche degrade vers la nature`() {
        assertThat(citation("  ").legend).isEqualTo(CommentQuotedLegend.OfKind(CommentQuotedMedia.Kind.VIDEO))
    }

    @Test
    fun `un media disparu ne vide pas la citation il la degrade vers la nature`() {
        assertThat(citation(null, withMedia = false).legend).isEqualTo(CommentQuotedLegend.OfKind(CommentQuotedMedia.Kind.VIDEO))
    }
}
