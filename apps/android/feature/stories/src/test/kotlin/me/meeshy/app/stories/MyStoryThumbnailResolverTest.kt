package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MyStoryThumbnailResolverTest {

    @Test
    fun `le composite l'emporte sur le media brut distant`() {
        assertThat(MyStoryThumbnailResolver.resolve("abc", "https://x/t.jpg")).isEqualTo(MyStoryThumbnailSource.Composite("abc"))
    }

    @Test
    fun `sans composite, le media brut distant`() {
        assertThat(MyStoryThumbnailResolver.resolve(null, "https://x/t.jpg")).isEqualTo(MyStoryThumbnailSource.RemoteUrl("https://x/t.jpg"))
        assertThat(MyStoryThumbnailResolver.resolve("", "https://x/t.jpg")).isEqualTo(MyStoryThumbnailSource.RemoteUrl("https://x/t.jpg"))
    }

    @Test
    fun `ni l'un ni l'autre donne le placeholder`() {
        assertThat(MyStoryThumbnailResolver.resolve(null, null)).isEqualTo(MyStoryThumbnailSource.Placeholder)
        assertThat(MyStoryThumbnailResolver.resolve(null, "")).isEqualTo(MyStoryThumbnailSource.Placeholder)
    }

    @Test
    fun `la couverture locale rendue l'emporte sur l'ancien repli`() {
        assertThat(MyStoryThumbnailResolver.localCoverPath("/a", "/b")).isEqualTo("/a")
        assertThat(MyStoryThumbnailResolver.localCoverPath(null, "/b")).isEqualTo("/b")
        assertThat(MyStoryThumbnailResolver.localCoverPath(null, null)).isNull()
    }
}
