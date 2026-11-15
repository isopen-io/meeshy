package me.meeshy.sdk.model.speech

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OnDeviceLanguageMatchTest {

    private val installed = listOf("en-US", "fr-CA", "fr-FR", "es-ES")

    @Test
    fun `une région exacte est conservée`() {
        assertThat(OnDeviceLanguageMatch.resolve("fr-CA", installed, "FR")).isEqualTo("fr-CA")
        assertThat(OnDeviceLanguageMatch.resolve("fr_fr", installed, null)).isEqualTo("fr-FR")
    }

    @Test
    fun `une langue seule prend la région de l'appareil puis la première installée`() {
        assertThat(OnDeviceLanguageMatch.resolve("fr", installed, "FR")).isEqualTo("fr-FR")
        assertThat(OnDeviceLanguageMatch.resolve("fr", installed, "BE")).isEqualTo("fr-CA")
        assertThat(OnDeviceLanguageMatch.resolve("es", installed, null)).isEqualTo("es-ES")
    }

    @Test
    fun `une langue non installée ne se résout pas`() {
        assertThat(OnDeviceLanguageMatch.resolve("de", installed, "DE")).isNull()
        assertThat(OnDeviceLanguageMatch.resolve("fr-BE", installed, "FR")).isNull()
        assertThat(OnDeviceLanguageMatch.resolve("", installed, "FR")).isNull()
    }
}
