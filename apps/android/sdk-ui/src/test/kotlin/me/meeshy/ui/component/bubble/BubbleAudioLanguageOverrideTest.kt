package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.TranscriptionSegment
import org.junit.Test

/**
 * Le drapeau change texte, karaoké ET piste jouée d'un vocal d'UNE seule descente : jamais une voix en langue A sous un
 * karaoké en langue B (TrackAndKaraokeCoherence).
 */
class BubbleAudioLanguageOverrideTest {

    private class Prefs(override val systemLanguage: String?) : LanguageResolver.ContentLanguagePreferences

    private val french = Prefs("fr")

    private val englishSegments = listOf(
        TranscriptionSegment(text = "Hello", startTime = 0.0, endTime = 1.0),
        TranscriptionSegment(text = "everyone", startTime = 1.0, endTime = 2.0),
    )
    private val spanishSegments = listOf(
        TranscriptionSegment(text = "Hola", startTime = 0.0, endTime = 1.5),
        TranscriptionSegment(text = "a todos", startTime = 1.5, endTime = 3.0),
    )

    private fun voice() = ApiMessageAttachment(
        id = "aud1",
        mimeType = "audio/mp4",
        fileUrl = "/media/original.m4a",
        transcription = ApiAttachmentTranscription(text = "Hello everyone", language = "en", segments = englishSegments),
        translations = mapOf(
            "fr" to ApiAttachmentTranslation(url = "/media/fr.mp3", transcription = "Bonjour tout le monde"),
            "es" to ApiAttachmentTranslation(url = "/media/es.mp3", transcription = "Hola a todos", segments = spanishSegments),
        ),
    )

    private fun message() = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "other",
        content = "",
        originalLanguage = "en",
        attachments = listOf(voice()),
    )

    private fun built(override: String?) = BubbleContentBuilder.build(
        message = message(),
        currentUserId = "me",
        preferences = french,
        activeLanguageCode = override,
        mediaBaseUrl = "https://cdn.meeshy.me",
    ).audios.single()

    @Test
    fun `sans bascule la voix, le texte et le karaoke suivent le prisme`() {
        val audio = built(null)
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/media/fr.mp3")
        assertThat(audio.audioLanguage).isEqualTo("fr")
        assertThat(audio.transcriptionText).isEqualTo("Bonjour tout le monde")
    }

    @Test
    fun `une bascule vers l'espagnol change la voix, le texte et les segments ensemble`() {
        val audio = built("ES")
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/media/es.mp3")
        assertThat(audio.isAudioTranslated).isTrue()
        assertThat(audio.audioLanguage).isEqualTo("es")
        assertThat(audio.transcriptionText).isEqualTo("Hola a todos")
        assertThat(audio.transcriptionLanguage).isEqualTo("es")
        assertThat(audio.transcriptionSegments.map { it.text }).containsExactly("Hola", "a todos").inOrder()
        assertThat(audio.transcriptionSegments.map { it.startTime }).containsExactly(0.0, 1.5).inOrder()
    }

    @Test
    fun `une bascule vers l'origine rejoue la voix d'origine avec ses segments horodates`() {
        val audio = built("en")
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/media/original.m4a")
        assertThat(audio.isAudioTranslated).isFalse()
        assertThat(audio.transcriptionText).isEqualTo("Hello everyone")
        assertThat(audio.transcriptionSegments.map { it.startTime }).containsExactly(0.0, 1.0).inOrder()
    }

    @Test
    fun `une bascule vers une langue sans piste retombe sur l'original et ne prend pas la premiere traduction`() {
        val audio = built("de")
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/media/original.m4a")
        assertThat(audio.transcriptionText).isEqualTo("Hello everyone")
    }

    @Test
    fun `la piste traduite sans segments propres perd les horodatages d'une autre voix`() {
        val audio = built("fr")
        assertThat(audio.audioLanguage).isEqualTo("fr")
        assertThat(audio.transcriptionSegments.all { it.startTime == null }).isTrue()
    }

    @Test
    fun `le panneau secondaire d'un vocal offre l'original et les transcriptions traduites`() {
        val content = BubbleContentBuilder.build(
            message = message(),
            currentUserId = "me",
            preferences = french,
            mediaBaseUrl = null,
        )
        assertThat(content.secondaryTexts).containsEntry("en", "Hello everyone")
        assertThat(content.secondaryTexts).containsEntry("es", "Hola a todos")
    }
}
