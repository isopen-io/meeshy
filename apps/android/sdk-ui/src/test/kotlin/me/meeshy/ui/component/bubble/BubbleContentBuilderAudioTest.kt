package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyMediaConsumption
import org.junit.Test

/** Ce que la bulle d'un vocal sait de sa pièce : sa protection (message OU pièce), sa consommation servie, ses langues. */
class BubbleContentBuilderAudioTest {

    private val prefs = object : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "de"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun voice(
        id: String = "a1",
        isBlurred: Boolean? = null,
        consumption: MeeshyMediaConsumption? = null,
    ) = ApiMessageAttachment(
        id = id,
        mimeType = "audio/mp4",
        fileUrl = "https://cdn.meeshy.me/$id.m4a",
        fileSize = 48_000,
        duration = 12_000,
        isBlurred = isBlurred,
        currentUserConsumption = consumption,
        transcription = ApiAttachmentTranscription(text = "Bonjour", language = "fr"),
        translations = mapOf(
            "en" to ApiAttachmentTranslation(transcription = "Hello", url = "https://cdn.meeshy.me/$id-en.m4a"),
            "es" to ApiAttachmentTranslation(transcription = "Hola"),
        ),
    )

    private fun message(vararg attachments: ApiMessageAttachment, isBlurred: Boolean? = null) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "other",
        content = "",
        originalLanguage = "fr",
        isBlurred = isBlurred,
        attachments = attachments.toList(),
    )

    private fun audios(message: ApiMessage) = BubbleContentBuilder.build(message, currentUserId = "me", preferences = prefs).audios

    @Test
    fun `un vocal ordinaire n'est pas protege`() {
        assertThat(audios(message(voice())).single().isProtected).isFalse()
    }

    @Test
    fun `un vocal dont la piece est floutee est protege, meme sous un message ordinaire`() {
        val built = audios(message(voice("a1", isBlurred = true), voice("a2")))

        assertThat(built.map { it.attachmentId to it.isProtected }).containsExactly("a1" to true, "a2" to false).inOrder()
    }

    @Test
    fun `tous les vocaux d'un message floute sont proteges`() {
        val built = audios(message(voice("a1"), voice("a2"), isBlurred = true))

        assertThat(built.map { it.isProtected }).containsExactly(true, true)
    }

    @Test
    fun `la consommation servie voyage avec la piece`() {
        val built = audios(message(voice(consumption = MeeshyMediaConsumption(lastPlayPositionMs = 6_000, listenedComplete = true)))).single()

        assertThat(built.lastPlayPositionMs).isEqualTo(6_000)
        assertThat(built.listenedComplete).isTrue()
    }

    @Test
    fun `sans consommation servie, la piece repose au debut`() {
        val built = audios(message(voice())).single()

        assertThat(built.lastPlayPositionMs).isNull()
        assertThat(built.listenedComplete).isFalse()
    }

    @Test
    fun `la piece dit la langue de sa transcription et celles de ses pistes traduites, jamais d'un texte seul`() {
        val built = audios(message(voice())).single()

        assertThat(built.originalLanguage).isEqualTo("fr")
        assertThat(built.translatedLanguages).containsExactly("en")
    }
}
