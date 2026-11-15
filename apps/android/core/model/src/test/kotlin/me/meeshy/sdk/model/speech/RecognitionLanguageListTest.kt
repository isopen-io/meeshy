package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecognitionLanguageListTest {
    private val installed = setOf("fr-FR", "en-US")

    @Test
    fun `par defaut seules les langues installees sont listees`() {
        val codes = RecognitionLanguageList.options(installed, showAll = false, query = "").map { it.code }
        assertThat(codes).containsExactly("fr", "en")
    }

    @Test
    fun `afficher toutes les langues les liste toutes`() {
        val all = RecognitionLanguageList.options(installed, showAll = true, query = "")
        assertThat(all.size).isGreaterThan(10)
        assertThat(all.map { it.code }).containsAtLeast("fr", "es", "ar")
    }

    @Test
    fun `la recherche porte sur le nom et sur le code`() {
        assertThat(RecognitionLanguageList.options(installed, true, "fran").map { it.code }).contains("fr")
        assertThat(RecognitionLanguageList.options(installed, true, "  ES ").map { it.code }).contains("es")
        assertThat(RecognitionLanguageList.options(installed, false, "zzzz")).isEmpty()
    }

    @Test
    fun `la coche suit la langue choisie quelle que soit la region`() {
        val french = RecognitionLanguageList.options(installed, false, "").first { it.code == "fr" }
        assertThat(RecognitionLanguageList.isSelected(french, "fr-CA")).isTrue()
        assertThat(RecognitionLanguageList.isSelected(french, "en")).isFalse()
    }
}
