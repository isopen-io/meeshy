package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.ui.component.bubble.BubbleContentBuilder
import org.junit.Test

class AudioTranslationInputsTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun voice() = ApiMessageAttachment(
        id = "a1",
        mimeType = "audio/mp4",
        fileUrl = "/media/original.m4a",
        transcription = ApiAttachmentTranscription(text = "Hello", language = "en"),
        translations = mapOf(
            "fr" to ApiAttachmentTranslation(url = "/media/fr.mp3", transcription = "Bonjour"),
            "es" to ApiAttachmentTranslation(transcription = "Hola"),
        ),
    )

    private fun bubble(isViewOnce: Boolean = false) = BubbleContentBuilder.build(
        message = ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "",
            originalLanguage = "en",
            isViewOnce = isViewOnce,
            attachments = listOf(voice()),
        ),
        currentUserId = "me",
        preferences = Prefs,
    )

    private fun input(
        bubble: me.meeshy.ui.component.bubble.BubbleContent = bubble(),
        shownSealed: Boolean = false,
        mode: String? = null,
    ) = AudioTranslationInputs.of(bubble, listOf(voice()), listOf("fr", "en", "es", "de"), mode, shownSealed)

    @Test
    fun `un vocal ouvert propose les langues de l'explorateur sans sa langue d'origine`() {
        val input = input()!!

        assertThat(input.messageId).isEqualTo("m1")
        assertThat(input.languages).containsExactly("fr", "es", "de").inOrder()
        assertThat(input.voices).containsExactly(AudioTranslationTarget("a1", "en"))
    }

    @Test
    fun `les pistes deja dans le cache sont celles qui ont une adresse`() {
        assertThat(input()!!.readyTracks).containsExactly("a1|fr")
    }

    @Test
    fun `un vocal protege n'offre ni feuille ni demande`() {
        assertThat(input(bubble = bubble(isViewOnce = true))).isNull()
    }

    @Test
    fun `une conversation scellee refuse la requete serveur`() {
        assertThat(input(shownSealed = true)!!.refused).isTrue()
        assertThat(input()!!.refused).isFalse()
    }
}
