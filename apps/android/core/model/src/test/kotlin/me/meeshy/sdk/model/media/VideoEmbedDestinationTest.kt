package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoEmbedDestinationTest {
    private val watch = "https://www.youtube.com/watch?v=abcdefghijk"

    @Test fun `le lien suivi est prioritaire`() {
        assertThat(VideoEmbedDestination.url(watch, "https://meeshy.me/l/tok")).isEqualTo("https://meeshy.me/l/tok")
    }

    @Test fun `sans lien suivi on ouvre l'url de visionnage`() {
        assertThat(VideoEmbedDestination.url(watch, null)).isEqualTo(watch)
        assertThat(VideoEmbedDestination.url(watch, " ")).isEqualTo(watch)
    }
}
