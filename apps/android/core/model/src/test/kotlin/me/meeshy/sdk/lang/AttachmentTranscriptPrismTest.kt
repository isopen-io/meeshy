package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import org.junit.Test

class AttachmentTranscriptPrismTest {

    private class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val english = ApiAttachmentTranscription(transcribedText = "The meeting is moved", language = "en")

    private fun translations() = mapOf(
        "es" to ApiAttachmentTranslation(transcription = "La reunión se mueve", url = "https://cdn/es.m4a", durationMs = 9_000),
        "de" to ApiAttachmentTranslation(transcription = "Das Treffen", url = "https://cdn/de.m4a"),
    )

    @Test
    fun `rank 1 missing but rank 2 translated serves the rank 2 text and voice`() {
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "es")
        val served = AttachmentTranscriptPrism.served(english, translations(), prefs)
        val track = AttachmentTranscriptPrism.track(english, translations(), prefs)
        assertThat(served?.language).isEqualTo("es")
        assertThat(served?.isTranslated).isTrue()
        assertThat(track?.language).isEqualTo("es")
        assertThat(track?.url).isEqualTo("https://cdn/es.m4a")
    }

    @Test
    fun `the original language at rank 2 keeps the original voice when rank 1 has no translation`() {
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en", customDestinationLanguage = "es")
        val served = AttachmentTranscriptPrism.served(english, translations(), prefs)
        assertThat(served?.isTranslated).isFalse()
        assertThat(served?.language).isEqualTo("en")
        assertThat(AttachmentTranscriptPrism.track(english, translations(), prefs)).isNull()
    }

    @Test
    fun `the device locale is the fourth rank`() {
        val prefs = Prefs(deviceLocale = "de_DE")
        assertThat(AttachmentTranscriptPrism.served(english, translations(), prefs)?.language).isEqualTo("de")
        assertThat(AttachmentTranscriptPrism.track(english, translations(), prefs)?.language).isEqualTo("de")
    }

    @Test
    fun `no configured language serves the original, never a french default`() {
        val withFrench = translations() + ("fr" to ApiAttachmentTranslation(transcription = "La réunion", url = "https://cdn/fr.m4a"))
        val served = AttachmentTranscriptPrism.served(english, withFrench, Prefs())
        assertThat(served?.isTranslated).isFalse()
        assertThat(served?.text).isEqualTo("The meeting is moved")
        assertThat(AttachmentTranscriptPrism.track(english, withFrench, Prefs())).isNull()
    }

    @Test
    fun `a blank url is not a track`() {
        val blank = mapOf("es" to ApiAttachmentTranslation(transcription = "Hola", url = "  "))
        assertThat(AttachmentTranscriptPrism.track(english, blank, Prefs(systemLanguage = "es"))).isNull()
    }
}
