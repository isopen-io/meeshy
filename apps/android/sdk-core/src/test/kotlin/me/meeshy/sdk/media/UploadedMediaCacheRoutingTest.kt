package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Test

class UploadedMediaCacheRoutingTest {

    private fun adopt(cache: UploadedMediaCache, category: MediaCacheCategory) =
        cache.adopt(category, "https://cdn.meeshy.me/sent", 2L) { byteArrayOf(7, 8).inputStream() }

    @Test
    fun `chaque categorie entre au cache qui la porte, et a lui seul`() {
        val images = RecordingUploadedMediaCache()
        val media = RecordingUploadedMediaCache()
        val routed = UploadedMediaCache.byCategory(
            mapOf(
                MediaCacheCategory.IMAGES to images,
                MediaCacheCategory.AUDIO to media,
                MediaCacheCategory.VIDEO to media,
            ),
        )

        assertThat(adopt(routed, MediaCacheCategory.IMAGES)).isTrue()
        assertThat(adopt(routed, MediaCacheCategory.VIDEO)).isTrue()

        assertThat(images.adoptions.map { it.category }).containsExactly(MediaCacheCategory.IMAGES)
        assertThat(media.adoptions.map { it.category }).containsExactly(MediaCacheCategory.VIDEO)
    }

    @Test
    fun `une categorie sans cache n adopte rien`() {
        val media = RecordingUploadedMediaCache()
        val routed = UploadedMediaCache.byCategory(mapOf(MediaCacheCategory.AUDIO to media))

        assertThat(adopt(routed, MediaCacheCategory.THUMBNAILS)).isFalse()
        assertThat(media.adoptions).isEmpty()
    }
}
