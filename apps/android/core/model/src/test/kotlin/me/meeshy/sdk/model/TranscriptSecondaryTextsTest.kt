package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TranscriptSecondaryTextsTest {

    private val transcription = ApiAttachmentTranscription(transcribedText = "The meeting is moved", language = "en")

    @Test
    fun `le panneau secondaire reçoit l'original puis les transcriptions traduites non vides`() {
        val texts = TranscriptSecondaryTexts.of(
            transcription,
            mapOf(
                "FR" to ApiAttachmentTranslation(transcription = "La réunion est déplacée", url = "u"),
                "es" to ApiAttachmentTranslation(transcription = "  ", url = "u"),
                "de" to ApiAttachmentTranslation(transcription = null),
            ),
        )
        assertThat(texts).containsExactly("en", "The meeting is moved", "fr", "La réunion est déplacée").inOrder()
    }

    @Test
    fun `sans langue d'origine connue l'original n'est pas offert`() {
        val texts = TranscriptSecondaryTexts.of(
            ApiAttachmentTranscription(transcribedText = "Hello", language = null),
            mapOf("fr" to ApiAttachmentTranslation(transcription = "Bonjour")),
        )
        assertThat(texts).containsExactly("fr", "Bonjour")
    }

    @Test
    fun `une pièce sans transcription ne rend rien`() {
        assertThat(TranscriptSecondaryTexts.of(null, null)).isEmpty()
    }
}
