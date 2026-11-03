package me.meeshy.sdk.model.recording

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.LanguageData
import org.junit.Test

class SpokenLanguageStripLawTest {
    @Test
    fun `les langues courantes ouvrent la bande dans leur ordre`() {
        val head = SpokenLanguageStripLaw.chips.take(LanguageData.commonLanguageCodes.size).map { it.code }
        assertThat(head).isEqualTo(LanguageData.commonLanguageCodes)
    }

    @Test
    fun `la bande est une permutation du catalogue`() {
        assertThat(SpokenLanguageStripLaw.chips.map { it.code })
            .containsExactlyElementsIn(LanguageData.allLanguages.map { it.code })
    }

    @Test
    fun `la langue de depart nettoie celle de l'appelant et retombe sur le francais`() {
        assertThat(SpokenLanguageStripLaw.initialSelection(" EN ")).isEqualTo("en")
        assertThat(SpokenLanguageStripLaw.initialSelection(null)).isEqualTo("fr")
        assertThat(SpokenLanguageStripLaw.initialSelection("  ")).isEqualTo("fr")
    }

    @Test
    fun `seule la langue choisie est active`() {
        val chips = SpokenLanguageStripLaw.chips
        assertThat(chips.count { SpokenLanguageStripLaw.isActive(it, "es") }).isEqualTo(1)
    }
}
