package me.meeshy.sdk.model.voice

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceProfilePromptsTest {

    @Test
    fun `chaque langue propose cinq series`() {
        VoiceProfilePrompts.supportedLanguageCodes.forEach { code ->
            assertThat(VoiceProfilePrompts.prompts(code)).hasSize(5)
        }
    }

    @Test
    fun `sept langues sont proposees dans l'ordre d'iOS`() {
        assertThat(VoiceProfilePrompts.supportedLanguageCodes).containsExactly("en", "es", "fr", "pt", "de", "it", "ar").inOrder()
    }

    @Test
    fun `une langue absente du catalogue retombe sur l'anglais`() {
        val prompts = VoiceProfilePrompts.prompts("ja")

        assertThat(prompts.map { it.languageCode }.toSet()).containsExactly("en")
        assertThat(VoiceProfilePrompts.prompts(null).first().languageCode).isEqualTo("en")
    }

    @Test
    fun `une etiquette regionale est ramenee a sa langue`() {
        assertThat(VoiceProfilePrompts.prompts("pt-BR").first().languageCode).isEqualTo("pt")
        assertThat(VoiceProfilePrompts.prompts(" FR_ca ").first().languageCode).isEqualTo("fr")
    }

    @Test
    fun `seul l'arabe se lit de droite a gauche dans le catalogue`() {
        assertThat(VoiceProfilePrompts.prompts("ar").all { it.isRightToLeft }).isTrue()
        assertThat(VoiceProfilePrompts.prompts("fr").none { it.isRightToLeft }).isTrue()
    }

    @Test
    fun `le decalage change le texte de depart et l'index boucle`() {
        val first = VoiceProfilePrompts.prompt("fr", 0, rotation = 0)
        val shifted = VoiceProfilePrompts.prompt("fr", 0, rotation = 2)

        assertThat(shifted).isNotEqualTo(first)
        assertThat(VoiceProfilePrompts.prompt("fr", 5, rotation = 0)).isEqualTo(first)
        assertThat(VoiceProfilePrompts.prompt("fr", -1, rotation = 0)).isEqualTo(VoiceProfilePrompts.prompt("fr", 4))
    }

    @Test
    fun `les trois premiers textes d'une session sont distincts`() {
        val texts = (0..2).map { VoiceProfilePrompts.prompt("en", it, rotation = 3)!!.text }

        assertThat(texts.toSet()).hasSize(3)
    }
}
