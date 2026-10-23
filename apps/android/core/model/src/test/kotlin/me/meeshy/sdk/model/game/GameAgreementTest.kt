package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameAgreementTest {

    @Test
    fun `le zero est singulier en francais et en portugais`() {
        assertThat(GameAgreement.isSingular(0, "fr")).isTrue()
        assertThat(GameAgreement.isSingular(0, "pt")).isTrue()
    }

    @Test
    fun `le zero est pluriel en anglais en arabe et sans langue`() {
        assertThat(GameAgreement.isSingular(0, "en")).isFalse()
        assertThat(GameAgreement.isSingular(0, "ar")).isFalse()
        assertThat(GameAgreement.isSingular(0, null)).isFalse()
    }

    @Test
    fun `un est singulier et deux pluriel dans toutes les langues`() {
        listOf("fr", "pt", "en", "ar", "es", "de", "it", null).forEach { language ->
            assertThat(GameAgreement.isSingular(1, language)).isTrue()
            assertThat(GameAgreement.isSingular(2, language)).isFalse()
        }
    }

    @Test
    fun `l accord se choisit sur l entier et jamais sur un texte formate`() {
        assertThat(GameAgreement.isSingular(1_221, "fr")).isFalse()
        assertThat(GameAgreement.isSingular(-1, "fr")).isFalse()
    }
}
