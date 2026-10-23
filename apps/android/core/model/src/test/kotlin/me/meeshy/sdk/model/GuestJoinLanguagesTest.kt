package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GuestJoinLanguagesTest {

    @Test
    fun offersTheFourteenLanguagesInOrder() {
        assertThat(GuestJoinLanguages.codes).containsExactly(
            "fr", "en", "es", "de", "it", "pt", "nl", "pl", "tr", "ru", "ar", "zh", "ja", "ko",
        ).inOrder()
    }

    @Test
    fun endonym_namesALanguageInItself() {
        assertThat(GuestJoinLanguages.endonym("fr")).isEqualTo("Français")
        assertThat(GuestJoinLanguages.endonym("de")).isEqualTo("Deutsch")
        assertThat(GuestJoinLanguages.endonym("es")).isEqualTo("Español")
        assertThat(GuestJoinLanguages.endonym("ja")).isEqualTo("日本語")
    }

    @Test
    fun normalize_keepsTheTwoLetterLanguage() {
        assertThat(GuestJoinLanguages.normalize("pt-BR")).isEqualTo("pt")
        assertThat(GuestJoinLanguages.normalize("fr_CA")).isEqualTo("fr")
        assertThat(GuestJoinLanguages.normalize("EN")).isEqualTo("en")
        assertThat(GuestJoinLanguages.normalize("")).isNull()
    }

    @Test
    fun defaultFor_takesTheFirstOfferedDeviceLanguage() {
        assertThat(GuestJoinLanguages.defaultFor(listOf("sw-KE", "de-DE", "en-US"))).isEqualTo("de")
    }

    @Test
    fun defaultFor_fallsBackToFrenchWhenNoneIsOffered() {
        assertThat(GuestJoinLanguages.defaultFor(listOf("sw-KE", "fi"))).isEqualTo("fr")
        assertThat(GuestJoinLanguages.defaultFor(emptyList())).isEqualTo("fr")
    }
}
