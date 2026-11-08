package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test

class ReadReceiptLanguagesTest {

    private fun id(n: Int) = "507f1f77bcf86cd7994390" + n.toString(16).padStart(2, '0')

    private fun message(n: Int, original: String, vararg translated: String) = ApiMessage(
        id = id(n),
        conversationId = "c1",
        content = "x",
        originalLanguage = original,
        translations = translated.map { ApiTextTranslation(targetLanguage = it, translatedContent = "t") },
    )

    @Test
    fun `the dominant language is the one most messages were read in`() {
        val d = ReadReceiptLanguages.declare(
            listOf(message(1, "en", "fr"), message(2, "en", "fr"), message(3, "es")),
            prism = listOf("fr"),
        )
        assertThat(d.language).isEqualTo("fr")
        assertThat(d.messageLanguages).containsExactly(id(3), "es")
    }

    @Test
    fun `on a tie the alphabetically first code is dominant`() {
        val d = ReadReceiptLanguages.declare(listOf(message(1, "en"), message(2, "de")), prism = listOf("fr"))
        assertThat(d.language).isEqualTo("de")
        assertThat(d.messageLanguages).containsExactly(id(1), "en")
    }

    @Test
    fun `a manual switch wins over the prism`() {
        val d = ReadReceiptLanguages.declare(
            listOf(message(1, "en", "fr", "es")),
            prism = listOf("fr"),
            manualSelections = mapOf(id(1) to "es"),
        )
        assertThat(d.language).isEqualTo("es")
    }

    @Test
    fun `a read in one pass carries no exceptions and names the newest as the catch-up cursor`() {
        val d = ReadReceiptLanguages.declare(listOf(message(1, "en", "fr"), message(2, "en", "fr")), prism = listOf("fr"))
        assertThat(d.messageLanguages).isEmpty()
        assertThat(d.caughtUpToMessageId).isEqualTo(id(2))
        assertThat(d.messageIds).containsExactly(id(1), id(2)).inOrder()
    }

    @Test
    fun `an optimistic local id is never named`() {
        val local = message(1, "en").copy(id = "local-123")
        val d = ReadReceiptLanguages.declare(listOf(local, message(2, "en")), prism = listOf("en"))
        assertThat(d.messageIds).containsExactly(id(2))
    }

    @Test
    fun `an empty batch declares nothing`() {
        val d = ReadReceiptLanguages.declare(emptyList(), prism = listOf("fr"))
        assertThat(d.language).isNull()
        assertThat(d.messageIds).isEmpty()
    }
}
