package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCanvasAccessibilityTest {
    private fun label(
        author: String? = "Alice",
        texts: List<String> = emptyList(),
        stickers: List<String> = emptyList(),
        transcript: String? = null,
    ) = StoryCanvasAccessibility.label("Story 2 sur 5", author, texts, stickers, transcript)

    @Test
    fun `la position puis l'auteur ouvrent l'annonce`() {
        assertThat(label()).isEqualTo("Story 2 sur 5, Alice")
    }

    @Test
    fun `sans auteur seul la position reste`() {
        assertThat(label(author = "  ")).isEqualTo("Story 2 sur 5")
    }

    @Test
    fun `les textes gardent l'ordre de pose et les vides tombent`() {
        assertThat(label(texts = listOf("Premier", " ", "Second"))).isEqualTo("Story 2 sur 5, Alice, Premier. Second")
    }

    @Test
    fun `les stickers viennent apres les textes et avant la transcription`() {
        val out = label(texts = listOf("Salut"), stickers = listOf("Sticker 🔥", ""), transcript = "Transcription : bonjour")
        assertThat(out).isEqualTo("Story 2 sur 5, Alice, Salut, Sticker 🔥, Transcription : bonjour")
    }

    @Test
    fun `une transcription vide ne laisse pas de separateur orphelin`() {
        assertThat(label(transcript = "   ")).doesNotContain(", ,")
        assertThat(label(transcript = "   ").endsWith(",")).isFalse()
    }
}
