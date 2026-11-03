package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import org.junit.Test

class CommentPresentationAudioTest {

    private class Prefs(override val systemLanguage: String?) : LanguageResolver.ContentLanguagePreferences {
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val voice = ApiPostMedia(
        id = "v1",
        mimeType = "audio/mpeg",
        fileUrl = "https://cdn.test/o.mp3",
        transcription = ApiAttachmentTranscription(language = "en"),
        translations = mapOf("fr" to ApiAttachmentTranslation(url = "https://cdn.test/fr.mp3")),
    )

    private fun url(system: String) = CommentProjection
        .build(ApiPostComment(id = "c", content = "", originalLanguage = "en", media = listOf(voice)), Prefs(system), null)
        .media.single().url

    @Test
    fun `un commentaire vocal joue la piste de la langue du lecteur`() {
        assertThat(url("fr")).isEqualTo("https://cdn.test/fr.mp3")
    }

    @Test
    fun `sans piste dans sa langue le lecteur entend l'original`() {
        assertThat(url("de")).isEqualTo("https://cdn.test/o.mp3")
    }
}
