package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import org.junit.Test

/** #16541 — un commentaire VOCAL porte ses drapeaux comme une bulle : la langue jouée est l'active, le toucher la change. */
class CommentAudioFlagsTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val voice = ApiPostComment(
        id = "c1",
        content = "",
        originalLanguage = "en",
        media = listOf(
            ApiPostMedia(
                id = "m1",
                mimeType = "audio/mpeg",
                fileUrl = "https://cdn.meeshy.me/o.mp3",
                transcription = ApiAttachmentTranscription(language = "en"),
                translations = mapOf("fr" to ApiAttachmentTranslation(url = "https://cdn.meeshy.me/fr.mp3")),
            ),
        ),
    )

    @Test
    fun `a voice comment shows its original and the reader's spoken language, the played one active`() {
        val audio = CommentProjection.build(voice, Prefs(systemLanguage = "fr"), null).media.single()
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/fr.mp3")
        assertThat(audio.audioChips.map { it.code }).containsExactly("en", "fr").inOrder()
        assertThat(audio.audioChips.single { it.isActive }.code).isEqualTo("fr")
        assertThat(audio.audioChips.single { it.isOriginal }.code).isEqualTo("en")
    }

    @Test
    fun `tapping the original flag plays the original`() {
        val audio = CommentProjection.build(voice, Prefs(systemLanguage = "fr"), null, activeLanguageCode = "en").media.single()
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/o.mp3")
        assertThat(audio.audioChips.single { it.isActive }.code).isEqualTo("en")
    }

    @Test
    fun `a voice already in the reader's language shows no flag`() {
        val audio = CommentProjection.build(voice, Prefs(systemLanguage = "en"), null).media.single()
        assertThat(audio.audioChips).isEmpty()
        assertThat(audio.url).isEqualTo("https://cdn.meeshy.me/o.mp3")
    }
}
