package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LinkMetadataTest {

    @Test
    fun `renderableImageUrl exposes an https image untouched`() {
        val meta = LinkMetadata(id = "https://x.com", imageUrl = "https://cdn.x.com/og.png")
        assertThat(meta.renderableImageUrl).isEqualTo("https://cdn.x.com/og.png")
    }

    @Test
    fun `renderableImageUrl is null when there is no image`() {
        val meta = LinkMetadata(id = "https://x.com", title = "A page")
        assertThat(meta.renderableImageUrl).isNull()
    }

    @Test
    fun `renderableImageUrl is null when the image is a blank string`() {
        val meta = LinkMetadata(id = "https://x.com", imageUrl = "   ")
        assertThat(meta.renderableImageUrl).isNull()
    }

    @Test
    fun `renderableImageUrl rejects a non-web image scheme`() {
        val meta = LinkMetadata(id = "https://x.com", imageUrl = "data:image/png;base64,AAAA")
        assertThat(meta.renderableImageUrl).isNull()
    }
}
