package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

/** La langue lue est résolue à la composition de l'accusé : bascule manuelle, prisme, original. */
class ReadReceiptCompositionTest {

    private fun id(n: Int) = "507f1f77bcf86cd7994390" + n.toString(16).padStart(2, '0')

    private fun other(n: Int, original: String = "en", vararg translated: String) = ApiMessage(
        id = id(n),
        conversationId = "c1",
        senderId = "other",
        content = "x",
        originalLanguage = original,
        translations = translated.map { ApiTextTranslation(targetLanguage = it, translatedContent = "t") },
    )

    private fun compose(
        window: List<ApiMessage>,
        unread: Int = window.size,
        arrived: ApiMessage? = null,
        overrides: Map<String, String> = emptyMap(),
        showingOriginal: Set<String> = emptySet(),
    ) = ReadReceiptComposition.declaration(window, "me", unread, arrived, listOf("fr"), overrides, showingOriginal)

    @Test
    fun `the unread messages are read in the prism language when a translation exists`() {
        val declaration = compose(listOf(other(1, "en", "fr"), other(2, "en", "fr")))!!

        assertThat(declaration.language).isEqualTo("fr")
        assertThat(declaration.messageLanguages).isNull()
        assertThat(declaration.messageIds).containsExactly(id(1), id(2)).inOrder()
    }

    @Test
    fun `a message with no translation is an exception read in its original`() {
        val declaration = compose(listOf(other(1, "en", "fr"), other(2, "en", "fr"), other(3, "es")))!!

        assertThat(declaration.language).isEqualTo("fr")
        assertThat(declaration.messageLanguages).containsExactly(id(3), "es")
    }

    @Test
    fun `showing the original counts as reading the original`() {
        val declaration = compose(listOf(other(1, "en", "fr")), showingOriginal = setOf(id(1)))!!

        assertThat(declaration.language).isEqualTo("en")
    }

    @Test
    fun `only the unread messages of others are named`() {
        val mine = other(2).copy(senderId = "me")
        val declaration = compose(listOf(other(1), mine, other(3)), unread = 1)!!

        assertThat(declaration.messageIds).containsExactly(id(3))
    }

    @Test
    fun `the arriving message is declared even before the window shows it`() {
        val declaration = compose(listOf(other(1)), unread = 0, arrived = other(2, "en", "fr"))!!

        assertThat(declaration.messageIds).containsExactly(id(2))
    }

    @Test
    fun `nothing unread leaves the receipt a plain conversation receipt`() {
        assertThat(compose(listOf(other(1)), unread = 0)).isNull()
    }
}
