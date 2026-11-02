package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MobileTranscriptionPayload
import org.junit.Test

class PublishIntentTest {
    private val video = ComposerDocumentMedia("/a.mp4", "video/mp4", 5000)
    private val image = ComposerDocumentMedia("/b.jpg", "image/jpeg")
    private fun transcription(language: String = "wo") = MobileTranscriptionPayload("salaam", language)

    private fun document(
        media: List<ComposerDocumentMedia> = listOf(video),
        declaredType: me.meeshy.sdk.model.PostType? = null,
        force: Boolean = false,
        content: String? = null,
        transcription: MobileTranscriptionPayload? = null,
        captions: Map<String, String> = emptyMap(),
    ) = PublishIntent.document(
        localMedia = media, declaredType = declaredType, forcePlainPost = force, content = content,
        visibility = "PUBLIC", visibilityUserIds = null, originalLanguage = "fr", mentions = null,
        location = null, discoverabilityPrecision = null, transcription = transcription,
        storyEffects = null, mediaCaptions = captions, mediaAlts = emptyMap(), mediaObjectIds = emptyMap(),
        allowSoundExtraction = null,
    )

    @Test
    fun `a declared type wins over the deduced one`() {
        assertThat(document(declaredType = me.meeshy.sdk.model.PostType.STORY).type).isEqualTo("STORY")
        assertThat(document().type).isEqualTo("REEL")
        assertThat(document(force = true).type).isEqualTo("POST")
        assertThat(document(media = listOf(image)).type).isEqualTo("POST")
    }

    @Test
    fun `captions are realigned by index on the media order`() {
        val intent = document(media = listOf(image, video), captions = mapOf("/a.mp4" to "vidéo"))
        assertThat(intent.mediaCaptions).containsExactly(null, "vidéo").inOrder()
        assertThat(intent.mediaAlts).hasSize(2)
        assertThat(intent.mediaObjectIds).hasSize(2)
        assertThat(intent.localMediaPaths).containsExactly("/b.jpg", "/a.mp4").inOrder()
    }

    @Test
    fun `without text the spoken language wins and with text the declared one stays`() {
        assertThat(document(transcription = transcription()).originalLanguage).isEqualTo("wo")
        assertThat(document(content = "bonjour", transcription = transcription()).originalLanguage).isEqualTo("fr")
        assertThat(document().originalLanguage).isEqualTo("fr")
    }

    @Test
    fun `a voice note takes the language of its transcription and carries no scene`() {
        val intent = PublishIntent.audioRecording(
            filePath = "/v.m4a", mimeType = "audio/mp4", durationMs = 4000, transcription = transcription("en"),
            forcePlainPost = false, content = null, visibility = "PUBLIC", visibilityUserIds = null,
            mentions = null, location = null, discoverabilityPrecision = null,
        )
        assertThat(intent.originalLanguage).isEqualTo("en")
        assertThat(intent.type).isEqualTo("REEL")
        assertThat(intent.storyEffects).isNull()
        assertThat(intent.mediaCaptions).containsExactly(null)
        assertThat(intent.allowSoundExtraction).isNull()
    }

    @Test
    fun `a short voice note is a plain post`() {
        val intent = PublishIntent.audioRecording(
            "/v.m4a", "audio/mp4", 1000, null, false, null, "PUBLIC", null, null, null, null,
        )
        assertThat(intent.type).isEqualTo("POST")
        assertThat(intent.originalLanguage).isNull()
    }

    @Test
    fun `the mutation id is per send and never derived from content`() {
        val a = document()
        val b = document()
        assertThat(a.clientMutationId).isNotEqualTo(b.clientMutationId)
        assertThat(a.clientMutationId).isNotEmpty()
    }
}
