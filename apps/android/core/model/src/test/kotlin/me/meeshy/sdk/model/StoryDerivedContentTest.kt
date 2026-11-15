package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryDerivedContentTest {

    private val overlays = listOf("Bonjour", " ", "le monde")

    @Test
    fun `the index is the non-empty overlay texts joined by one space`() {
        assertThat(StoryDerivedContent.composed(overlays)).isEqualTo("Bonjour le monde")
    }

    @Test
    fun `content equal to the index is derived`() {
        assertThat(StoryDerivedContent.isDerivedIndex("Bonjour le monde", overlays)).isTrue()
    }

    @Test
    fun `content merely containing the index is an author caption`() {
        assertThat(StoryDerivedContent.isDerivedIndex("Bonjour le monde entier", overlays)).isFalse()
    }

    @Test
    fun `missing overlays or content fail safe to caption`() {
        assertThat(StoryDerivedContent.isDerivedIndex("Bonjour", emptyList())).isFalse()
        assertThat(StoryDerivedContent.isDerivedIndex(null, overlays)).isFalse()
        assertThat(StoryDerivedContent.isDerivedIndex("  ", overlays)).isFalse()
    }

    @Test
    fun `a derived index is not rendered even when read in another language`() {
        val caption = StoryDerivedContent.caption(
            original = "Bonjour le monde",
            resolved = "Hello world",
            overlayTexts = overlays,
        )
        assertThat(caption).isNull()
    }

    @Test
    fun `a real caption is rendered as resolved`() {
        assertThat(StoryDerivedContent.caption("Ma légende", "My caption", overlays)).isEqualTo("My caption")
        assertThat(StoryDerivedContent.caption("Ma légende", "  ", overlays)).isNull()
    }
}
