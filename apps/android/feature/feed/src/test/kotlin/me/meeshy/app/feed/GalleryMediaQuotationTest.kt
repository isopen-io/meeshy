package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CommentQuotedMedia
import org.junit.Test

class GalleryMediaQuotationTest {
    private val gallery = FeedGallery(
        pages = listOf(
            FeedGalleryPage(url = "https://f/a.jpg", thumbnailUrl = "https://f/a_t.jpg", caption = "Plage", mediaId = "m1"),
            FeedGalleryPage(url = "https://f/b.mp4", thumbnailUrl = null, mediaId = "m2", isVideo = true),
        ),
        startIndex = 0,
        postId = "p1",
    )

    @Test
    fun `une image citee porte sa vignette et sa legende`() {
        val citation = GalleryMediaQuotation.of(gallery, "m1")!!
        assertThat(citation.kind).isEqualTo(CommentQuotedMedia.Kind.IMAGE)
        assertThat(citation.thumbnailUrl).isEqualTo("https://f/a_t.jpg")
        assertThat(citation.media?.caption).isEqualTo("Plage")
    }

    @Test
    fun `une video sans poster ne propose pas le fichier video comme vignette`() {
        val citation = GalleryMediaQuotation.of(gallery, "m2")!!
        assertThat(citation.kind).isEqualTo(CommentQuotedMedia.Kind.VIDEO)
        assertThat(citation.thumbnailUrl).isNull()
    }

    @Test
    fun `un media qui n est pas de la galerie ne se cite pas`() {
        assertThat(GalleryMediaQuotation.of(gallery, "inconnu")).isNull()
    }
}
