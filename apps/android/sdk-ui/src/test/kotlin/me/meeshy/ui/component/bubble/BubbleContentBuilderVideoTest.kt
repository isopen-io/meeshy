package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.VideoDisplayAspectCache
import org.junit.Test

class BubbleContentBuilderVideoTest {

    private object Reader : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun build(vararg attachments: ApiMessageAttachment) = BubbleContentBuilder.build(
        ApiMessage(id = "m", conversationId = "c", senderId = "o", content = "", attachments = attachments.toList()),
        currentUserId = "me",
        preferences = Reader,
    )

    private fun video(url: String = "https://x/v.mp4", extra: ApiMessageAttachment.() -> ApiMessageAttachment = { this }) =
        ApiMessageAttachment(id = "v", mimeType = "video/mp4", fileUrl = url, thumbnailUrl = "https://x/t.jpg", width = 1080, height = 1920, duration = 12_000, fileSize = 3_000_000).extra()

    @Test
    fun `une video donne un BubbleVideo avec miniature, duree, dimensions et poids`() {
        val v = build(video()).videos.single()
        assertThat(v.thumbnailUrl).isEqualTo("https://x/t.jpg")
        assertThat(v.durationSeconds).isEqualTo(12)
        assertThat(v.metadataRatio).isWithin(1e-9).of(1080.0 / 1920)
        assertThat(v.sizeBytes).isEqualTo(3_000_000)
        assertThat(v.isOnDevice).isFalse()
    }

    @Test
    fun `une video envoyee depuis l'appareil est reconnue locale`() {
        assertThat(build(video(url = "file:///data/v.mp4")).videos.single().isOnDevice).isTrue()
    }

    @Test
    fun `la consommation servie accompagne la video`() {
        val served = MeeshyMediaConsumption(lastWatchPositionMs = 6_000)
        val v = build(video { copy(currentUserConsumption = served) }).videos.single()
        assertThat(v.servedConsumption).isEqualTo(served)
    }

    @Test
    fun `le ratio de la bulle vient du cache d'abord puis de la metadonnee`() {
        val cache = VideoDisplayAspectCache()
        val v = build(video()).videos.single()
        assertThat(bubbleVideoRatio(v, cache)).isWithin(1e-9).of(9.0 / 16)
        cache.store(v.url!!, 4.0 / 3)
        assertThat(bubbleVideoRatio(v, cache)).isWithin(1e-9).of(4.0 / 3)
        assertThat(bubbleVideoRatio(BubbleVideo(attachmentId = "x"), cache)).isWithin(1e-9).of(16.0 / 9)
    }

    @Test
    fun `une video n'est plus rendue comme un fichier a ouvrir`() {
        val content = build(video())
        assertThat(content.videos).hasSize(1)
        assertThat(content.videoCount).isEqualTo(1)
    }
}
