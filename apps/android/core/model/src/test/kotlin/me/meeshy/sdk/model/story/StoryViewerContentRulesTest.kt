package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryViewerContentRulesTest {

    @Test
    fun `no override leaves the reader chain untouched`() {
        assertThat(StoryViewerContentRules.viewerLanguageChain(listOf("fr", "en"), null)).containsExactly("fr", "en").inOrder()
        assertThat(StoryViewerContentRules.viewerLanguageChain(listOf("fr", "en"), "")).containsExactly("fr", "en").inOrder()
    }

    @Test
    fun `an exploration language leads the chain and leaves its former rank`() {
        assertThat(StoryViewerContentRules.viewerLanguageChain(listOf("fr", "en", "es"), "en"))
            .containsExactly("en", "fr", "es").inOrder()
    }

    @Test
    fun `an exploration language absent from the chain is simply prepended`() {
        assertThat(StoryViewerContentRules.viewerLanguageChain(listOf("fr"), "de")).containsExactly("de", "fr").inOrder()
    }

    @Test
    fun `Original empties the chain so every text falls back to its own language`() {
        assertThat(
            StoryViewerContentRules.viewerLanguageChain(listOf("fr", "en"), StoryViewerContentRules.ORIGINAL_LANGUAGE_OVERRIDE),
        ).isEmpty()
    }

    @Test
    fun `tapping the language already chosen releases it`() {
        assertThat(StoryViewerContentRules.overrideAfterTapping("fr", current = "fr")).isNull()
        assertThat(StoryViewerContentRules.overrideAfterTapping("pt", current = "pt-BR")).isNull()
    }

    @Test
    fun `tapping another language chooses it`() {
        assertThat(StoryViewerContentRules.overrideAfterTapping("en", current = "fr")).isEqualTo("en")
        assertThat(StoryViewerContentRules.overrideAfterTapping("en", current = null)).isEqualTo("en")
    }

    @Test
    fun `Original is never released by a flag tap`() {
        val original = StoryViewerContentRules.ORIGINAL_LANGUAGE_OVERRIDE
        assertThat(StoryViewerContentRules.overrideAfterTapping("en", current = original)).isEqualTo("en")
    }

    @Test
    fun `a retranslation is in flight while the text has not moved from its baseline`() {
        assertThat(StoryViewerContentRules.isRetranslating(baseline = "Hello", currentText = "Hello")).isTrue()
        assertThat(StoryViewerContentRules.isRetranslating(baseline = "Hello", currentText = "Hi")).isFalse()
        assertThat(StoryViewerContentRules.isRetranslating(baseline = null, currentText = "Hello")).isFalse()
    }

    @Test
    fun `the retranslation guard expires after twenty seconds`() {
        assertThat(StoryViewerContentRules.isRetranslationExpired(startedAt = 1_000, now = 20_999)).isFalse()
        assertThat(StoryViewerContentRules.isRetranslationExpired(startedAt = 1_000, now = 21_000)).isTrue()
    }

    @Test
    fun `a row preview keeps fifty characters then an ellipsis`() {
        assertThat(StoryViewerContentRules.rowPreview("a".repeat(50))).isEqualTo("a".repeat(50))
        assertThat(StoryViewerContentRules.rowPreview("b".repeat(51))).isEqualTo("b".repeat(50) + "…")
    }
}
