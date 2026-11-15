package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.TranscriptionSegment
import org.junit.Test

/**
 * UNE descente rend ensemble le texte, la piste jouée et la langue des segments d'un vocal : le drapeau change texte,
 * karaoké ET piste de façon cohérente (jamais une voix en langue A sous un karaoké en langue B).
 */
class AttachmentTranscriptPrismServedVoiceTest {

    private class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun english(segments: List<TranscriptionSegment>? = null) =
        ApiAttachmentTranscription(transcribedText = "The meeting is moved", language = "en", segments = segments)

    private fun track(text: String, url: String, segments: List<TranscriptionSegment>? = null) =
        ApiAttachmentTranslation(transcription = text, url = url, durationMs = 9_000, segments = segments)

    private fun translations() = mapOf(
        "fr" to track("La réunion est déplacée", "https://cdn/fr.m4a"),
        "es" to track("La reunión se mueve", "https://cdn/es.m4a"),
    )

    @Test
    fun `sans bascule la descente est celle du Prisme, texte et piste inchangés`() {
        val prefs = Prefs(systemLanguage = "fr", regionalLanguage = "en")
        val voice = AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = null)
        assertThat(voice.text).isEqualTo("La réunion est déplacée")
        assertThat(voice.textLanguage).isEqualTo("fr")
        assertThat(voice.isTranslated).isTrue()
        assertThat(voice.track?.language).isEqualTo("fr")
        assertThat(voice.track).isEqualTo(AttachmentTranscriptPrism.playedTrack(english(), translations(), prefs))
        assertThat(voice.segmentsLanguage).isEqualTo("fr")
    }

    @Test
    fun `une bascule vers la langue d'origine en majuscules joue l'original`() {
        val prefs = Prefs(systemLanguage = "fr")
        val voice = AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = "EN")
        assertThat(voice.track).isNull()
        assertThat(voice.text).isEqualTo("The meeting is moved")
        assertThat(voice.isTranslated).isFalse()
        assertThat(voice.textLanguage).isEqualTo("en")
        assertThat(voice.segmentsLanguage).isNull()
    }

    @Test
    fun `une bascule vers une langue a piste sert cette piste et sa transcription`() {
        val prefs = Prefs(systemLanguage = "fr")
        val voice = AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = "es")
        assertThat(voice.track?.language).isEqualTo("es")
        assertThat(voice.track?.url).isEqualTo("https://cdn/es.m4a")
        assertThat(voice.text).isEqualTo("La reunión se mueve")
        assertThat(voice.textLanguage).isEqualTo("es")
        assertThat(voice.isTranslated).isTrue()
        assertThat(voice.segmentsLanguage).isEqualTo("es")
    }

    @Test
    fun `une bascule vers une langue sans piste retombe sur l'original, jamais sur la premiere traduction`() {
        val voice = AttachmentTranscriptPrism.servedVoice(english(), translations(), Prefs(systemLanguage = "fr"), manualOverride = "de")
        assertThat(voice.track).isNull()
        assertThat(voice.text).isEqualTo("The meeting is moved")
        assertThat(voice.isTranslated).isFalse()
    }

    @Test
    fun `une bascule vide vaut l'absence de bascule`() {
        val prefs = Prefs(systemLanguage = "fr")
        val blank = AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = "  ")
        assertThat(blank).isEqualTo(AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = null))
        assertThat(blank.track?.language).isEqualTo("fr")
    }

    @Test
    fun `au rang deux la piste espagnole est jouee quand le rang un n'a pas de piste`() {
        val prefs = Prefs(systemLanguage = "de", regionalLanguage = "es")
        val voice = AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = null)
        assertThat(voice.track?.language).isEqualTo("es")
        assertThat(voice.textLanguage).isEqualTo("es")
    }

    @Test
    fun `la langue d'origine au rang deux ne rend pas la piste du rang trois`() {
        val prefs = Prefs(systemLanguage = "de", regionalLanguage = "en", customDestinationLanguage = "es")
        val voice = AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = null)
        assertThat(voice.track).isNull()
        assertThat(voice.isTranslated).isFalse()
        assertThat(voice.text).isEqualTo("The meeting is moved")
    }

    @Test
    fun `aucune piste sert l'original et ne prend jamais la premiere traduction`() {
        val textOnly = mapOf("fr" to ApiAttachmentTranslation(transcription = "La réunion", url = null))
        val voice = AttachmentTranscriptPrism.servedVoice(english(), textOnly, Prefs(systemLanguage = "de"), manualOverride = "fr")
        assertThat(voice.track).isNull()
        assertThat(voice.text).isEqualTo("The meeting is moved")
    }

    @Test
    fun `une piste dont la transcription est blanche garde le texte d'origine et perd ses horodatages`() {
        val blankTranscript = mapOf("es" to track("   ", "https://cdn/es.m4a"))
        val voice = AttachmentTranscriptPrism.servedVoice(english(), blankTranscript, Prefs(), manualOverride = "es")
        assertThat(voice.track?.language).isEqualTo("es")
        assertThat(voice.text).isEqualTo("The meeting is moved")
        assertThat(voice.isTranslated).isFalse()
        assertThat(voice.segmentsLanguage).isNull()
        assertThat(voice.segmentsDescribeTrack).isFalse()
    }

    @Test
    fun `les segments ne valent que sur la piste qu'ils decrivent`() {
        val prefs = Prefs(systemLanguage = "fr")
        assertThat(AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = "es").segmentsDescribeTrack).isTrue()
        assertThat(AttachmentTranscriptPrism.servedVoice(english(), translations(), prefs, manualOverride = "en").segmentsDescribeTrack).isTrue()
        assertThat(AttachmentTranscriptPrism.servedVoice(english(), translations(), Prefs(), manualOverride = null).segmentsDescribeTrack).isTrue()
    }

    @Test
    fun `une pièce sans transcription bascule sur sa piste sans texte`() {
        val voice = AttachmentTranscriptPrism.servedVoice(null, mapOf("es" to track("", "https://cdn/es.m4a")), Prefs(), manualOverride = "es")
        assertThat(voice.track?.language).isEqualTo("es")
        assertThat(voice.text).isNull()
        assertThat(voice.textLanguage).isNull()
    }

    @Test
    fun `l'origine d'une pièce est celle de SA transcription, pas celle du message`() {
        val french = ApiAttachmentTranscription(transcribedText = "Bonjour", language = "fr")
        val voice = AttachmentTranscriptPrism.servedVoice(french, translations(), Prefs(systemLanguage = "fr"), manualOverride = null)
        assertThat(voice.track).isNull()
        assertThat(voice.text).isEqualTo("Bonjour")
    }
}
