package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessageAttachment
import org.junit.Test

/** La transcription de la bulle est celle de la langue préférée la plus haute qui en a une, l'original sinon. */
class TranscriptionPrismeTest {

    private fun prefs(system: String?, regional: String? = null, custom: String? = null, device: String? = null) =
        object : LanguageResolver.ContentLanguagePreferences {
            override val systemLanguage = system
            override val regionalLanguage = regional
            override val customDestinationLanguage = custom
            override val deviceLocale = device
        }

    private fun voice(translations: Map<String, ApiAttachmentTranslation>) = ApiMessageAttachment(
        id = "a1",
        mimeType = "audio/mp4",
        fileUrl = "https://cdn.meeshy.me/a1.m4a",
        transcription = ApiAttachmentTranscription(text = "Bonjour", language = "fr"),
        translations = translations,
    )

    private fun served(attachment: ApiMessageAttachment, preferences: LanguageResolver.ContentLanguagePreferences) =
        BubbleAttachmentBuilder.buildAudio(attachment, preferences, mediaBaseUrl = null)

    @Test
    fun `le rang 3 est servi quand les rangs 1 et 2 n'ont pas de traduction`() {
        val audio = served(
            voice(mapOf("en" to ApiAttachmentTranslation(transcription = "Hello"), "es" to ApiAttachmentTranslation(transcription = "Hola"))),
            prefs(system = "de", regional = "it", custom = "es"),
        )

        assertThat(audio.transcriptionText).isEqualTo("Hola")
        assertThat(audio.isTranscriptionTranslated).isTrue()
    }

    @Test
    fun `sans traduction dans le prisme l'original est servi et jamais la premiere traduction`() {
        val audio = served(
            voice(mapOf("en" to ApiAttachmentTranslation(transcription = "Hello"))),
            prefs(system = "de", regional = "it"),
        )

        assertThat(audio.transcriptionText).isEqualTo("Bonjour")
        assertThat(audio.isTranscriptionTranslated).isFalse()
    }
}
