package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationPrimaryLanguagesTest {
    @Test
    fun `les langues se classent par effectif decroissant`() {
        assertThat(ConversationPrimaryLanguages.top(listOf("en", "fr", "fr", "es", "fr", "es"))).containsExactly("fr", "es", "en").inOrder()
    }

    @Test
    fun `a effectif egal la premiere apparue passe devant`() {
        assertThat(ConversationPrimaryLanguages.top(listOf("de", "it", "de", "it", "pt"))).containsExactly("de", "it", "pt").inOrder()
    }

    @Test
    fun `une region se reduit a sa langue et la casse est ignoree`() {
        assertThat(ConversationPrimaryLanguages.top(listOf("pt-BR", "PT", "pt_PT", "fr"))).containsExactly("pt", "fr").inOrder()
    }

    @Test
    fun `les codes absents ou vides sont ignores`() {
        assertThat(ConversationPrimaryLanguages.top(listOf(null, "", "  ", "fr"))).containsExactly("fr")
    }

    @Test
    fun `la liste est bornee a dix langues`() {
        val codes = listOf("fr", "en", "es", "de", "pt", "it", "zh", "ja", "ko", "ar", "ru", "hi")
        assertThat(ConversationPrimaryLanguages.top(codes)).hasSize(10)
    }
}
