package me.meeshy.sdk.model.translation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DeviceTranslationTargetTest {
    private fun candidates(prism: List<String>, original: String? = "en", translated: List<String> = emptyList()) =
        DeviceTranslationTarget.candidates(prism, original, translated)

    @Test
    fun `les candidats suivent l'ordre du prisme`() {
        assertThat(candidates(listOf("fr", "es", "de"))).isEqualTo(DeviceTranslationCandidates("en", listOf("fr", "es", "de")))
    }

    @Test
    fun `la descente s'arrete au rang deja servi`() {
        assertThat(candidates(listOf("fr", "en", "es"))!!.targets).containsExactly("fr")
        assertThat(candidates(listOf("fr", "es", "de"), translated = listOf("es"))!!.targets).containsExactly("fr")
    }

    @Test
    fun `rang servi des le premier ou rien a calculer donne null`() {
        assertThat(candidates(listOf("en", "fr"))).isNull()
        assertThat(candidates(listOf("fr"), translated = listOf("fr"))).isNull()
        assertThat(candidates(emptyList())).isNull()
        assertThat(candidates(listOf(" ", ""))).isNull()
        assertThat(candidates(listOf("fr"), original = null)).isNull()
        assertThat(candidates(listOf("fr"), original = "  ")).isNull()
    }

    @Test
    fun `normalisation aveugle a la region et doublons ecartes`() {
        val result = candidates(listOf("pt-BR", "pt", "fr_CA"), original = "EN-us")!!
        assertThat(result.source).isEqualTo("en")
        assertThat(result.targets).containsExactly("pt", "fr").inOrder()
        assertThat(candidates(listOf("fr"), original = "en_US", translated = listOf("fr-FR"))).isNull()
    }

    @Test
    fun `resolve saute le rang que le moteur ne sait pas traduire`() {
        val pair = DeviceTranslationTarget.resolve(listOf("fr", "es"), "en", emptyList()) { _, t -> t == "es" }
        assertThat(pair).isEqualTo(DeviceTranslationPair("en", "es"))
        assertThat(DeviceTranslationTarget.resolve(listOf("fr"), "en", emptyList()) { _, _ -> false }).isNull()
        assertThat(DeviceTranslationTarget.resolve(listOf("en"), "en", emptyList()) { _, _ -> true }).isNull()
    }

    @Test
    fun `l'orthographe du lecteur est conservee`() {
        assertThat(DeviceTranslationTarget.readerSpelling("pt", listOf("fr", "pt-BR"))).isEqualTo("pt-BR")
        assertThat(DeviceTranslationTarget.readerSpelling("de", listOf("fr"))).isEqualTo("de")
    }
}
