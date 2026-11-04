package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposeLanguageDefaultTest {
    private fun prefs(system: String? = null, regional: String? = null, custom: String? = null, device: String? = null) =
        object : LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage = system
            override val regionalLanguage = regional
            override val customDestinationLanguage = custom
            override val deviceLocale = device
        }

    @Test
    fun `la langue de contenu configuree gagne sur le clavier`() {
        assertThat(ComposeLanguageDefault.of(prefs(system = "fr"), "en-US")).isEqualTo("fr")
    }

    @Test
    fun `sans langue de contenu on prend le clavier actif`() {
        assertThat(ComposeLanguageDefault.of(prefs(), "es-ES")).isEqualTo("es")
    }

    @Test
    fun `la langue regionale vient avant le clavier`() {
        assertThat(ComposeLanguageDefault.of(prefs(regional = "de"), "es")).isEqualTo("de")
    }

    @Test
    fun `la locale appareil n'est jamais la langue de composition`() {
        assertThat(ComposeLanguageDefault.of(prefs(device = "en-US"), null)).isNull()
        assertThat(ComposeLanguageDefault.of(prefs(device = "en-US"), "it")).isEqualTo("it")
    }

    @Test
    fun `un code hors de la liste supportee est ecarte`() {
        assertThat(ComposeLanguageDefault.of(prefs(system = "fr"), "en", setOf("en"))).isEqualTo("en")
        assertThat(ComposeLanguageDefault.of(prefs(), "  ")).isNull()
    }
}
