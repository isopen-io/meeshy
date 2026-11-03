package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.ShareItemRepresentation.Companion.FILE_URL_TYPE
import me.meeshy.sdk.model.share.ShareItemRepresentation.Companion.URL_TYPE
import org.junit.Test

class ShareItemRepresentationTest {
    private fun choose(vararg types: String, text: String? = null) = ShareItemRepresentation.choose(types.toList(), text)

    @Test
    fun `Google Photos - the media wins over its file path which is never a piece`() {
        val chosen = choose("image/*", "image/jpeg", FILE_URL_TYPE)
        assertThat(chosen).isEqualTo(ShareItemRepresentation.Media("image/jpeg"))
        assertThat(chosen.isPiece).isTrue()
    }

    @Test
    fun `Chrome - a web link wins over its thumbnail`() {
        assertThat(choose("text/plain", "image/png", URL_TYPE)).isEqualTo(ShareItemRepresentation.Link)
    }

    @Test
    fun `Chrome - a text that is only a web URL is a link even next to a thumbnail`() {
        assertThat(choose("text/plain", "image/png", text = "https://meeshy.me/x")).isEqualTo(ShareItemRepresentation.Link)
    }

    @Test
    fun `a sentence containing a url stays text`() {
        assertThat(choose("text/plain", text = "regarde https://meeshy.me")).isEqualTo(ShareItemRepresentation.Text)
    }

    @Test
    fun `a bare file path is never a piece`() {
        val chosen = choose(FILE_URL_TYPE)
        assertThat(chosen).isEqualTo(ShareItemRepresentation.FileUrl)
        assertThat(chosen.isPiece).isFalse()
    }

    @Test
    fun `a document with its file url is a file`() {
        assertThat(choose("application/pdf", FILE_URL_TYPE)).isEqualTo(ShareItemRepresentation.File("application/pdf"))
    }

    @Test
    fun `a concrete media type beats the abstract one`() {
        assertThat(choose("video/*", "video/mp4")).isEqualTo(ShareItemRepresentation.Media("video/mp4"))
    }

    @Test
    fun `plain text, bare data and nothing`() {
        assertThat(choose("text/plain", text = "salut")).isEqualTo(ShareItemRepresentation.Text)
        assertThat(choose("application/zip")).isEqualTo(ShareItemRepresentation.File("application/zip"))
        assertThat(choose()).isEqualTo(ShareItemRepresentation.Unsupported)
    }
}
