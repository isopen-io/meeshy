package me.meeshy.sdk.model.composer.sound

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SoundLanguageChoicesTest {
    @Test
    fun `the sound starts in the author's primary language, then the device's, then French`() {
        assertThat(SoundLanguageChoices.initial(systemLanguage = "pt-BR", deviceLanguage = "en")).isEqualTo("pt")
        assertThat(SoundLanguageChoices.initial(systemLanguage = null, deviceLanguage = "de_DE")).isEqualTo("de")
        assertThat(SoundLanguageChoices.initial(systemLanguage = " ", deviceLanguage = null)).isEqualTo("fr")
    }

    @Test
    fun `five suggestions, the author's languages first, never twice the same`() {
        val chips = SoundLanguageChoices.suggested(systemLanguage = "fr", regionalLanguage = "pt", deviceLanguage = "fr-CA", selected = "fr")
        assertThat(chips).containsExactly("fr", "pt", "en", "es", "de").inOrder()
    }

    @Test
    fun `a language chosen elsewhere stays visible and selected among the suggestions`() {
        val chips = SoundLanguageChoices.suggested(systemLanguage = "fr", regionalLanguage = null, deviceLanguage = null, selected = "ja")
        assertThat(chips).hasSize(SoundLanguageChoices.SUGGESTION_CAP)
        assertThat(chips.last()).isEqualTo("ja")
        assertThat(chips.first()).isEqualTo("fr")
    }
}
