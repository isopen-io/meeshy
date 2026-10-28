package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTextLanguageTest {
    @Test
    fun `no language offers the seven interface languages in iOS order`() {
        assertThat(StoryTextLanguage.choices(null)).containsExactly("fr", "en", "es", "de", "it", "pt", "ar").inOrder()
        assertThat(StoryTextLanguage.choices("  ")).isEqualTo(StoryTextLanguage.interfaceLanguages)
    }

    @Test
    fun `a regional code folds onto its interface language`() {
        assertThat(StoryTextLanguage.normalised("pt-BR")).isEqualTo("pt")
        assertThat(StoryTextLanguage.choices("pt-BR")).isEqualTo(StoryTextLanguage.interfaceLanguages)
    }

    @Test
    fun `a language outside the interface leads the list so the choice is never lost`() {
        assertThat(StoryTextLanguage.choices("ja").first()).isEqualTo("ja")
        assertThat(StoryTextLanguage.choices("ja")).hasSize(8)
    }
}
