package me.meeshy.ui.story.reader

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryReaderContextTest {

    @Test
    fun `un muet verrouille ignore la demande de l hote`() {
        val card = StoryReaderContext(mute = true, locksMute = true)
        assertThat(card.effectiveMute(requested = false)).isTrue()
    }

    @Test
    fun `un muet libre suit la demande de l hote`() {
        val detail = StoryReaderContext(mute = false)
        assertThat(detail.effectiveMute(requested = true)).isTrue()
        assertThat(detail.effectiveMute(requested = null)).isFalse()
    }

    @Test
    fun `changer les langues conserve les autres reglages`() {
        val context = StoryReaderContext(mute = true, locksMute = true, showsImageRectOnly = true)
        val moved = context.withPreferredLanguages(listOf("es"))
        assertThat(moved.preferredLanguages).containsExactly("es")
        assertThat(moved.mute).isTrue()
        assertThat(moved.locksMute).isTrue()
        assertThat(moved.showsImageRectOnly).isTrue()
    }

    @Test
    fun `un media adopte garde son fichier local tant qu il existe`() {
        val context = StoryReaderContext(localMediaAliases = mapOf("https://cdn/x.jpg" to "/data/x.jpg"))
        assertThat(context.aliasing("https://cdn/x.jpg") { true }).isEqualTo("/data/x.jpg")
        assertThat(context.aliasing("https://cdn/x.jpg") { false }).isEqualTo("https://cdn/x.jpg")
        assertThat(context.aliasing("https://cdn/autre.jpg") { true }).isEqualTo("https://cdn/autre.jpg")
    }
}
