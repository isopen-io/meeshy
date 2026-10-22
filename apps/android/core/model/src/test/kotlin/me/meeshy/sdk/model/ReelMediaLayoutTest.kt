package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelMediaLayoutTest {
    private fun media(id: String, type: FeedMediaType) = FeedMedia(id = id, type = type)
    private val video = media("v", FeedMediaType.VIDEO)
    private val image1 = media("i1", FeedMediaType.IMAGE)
    private val image2 = media("i2", FeedMediaType.IMAGE)
    private val audio = media("a", FeedMediaType.AUDIO)
    private val document = media("d", FeedMediaType.DOCUMENT)

    @Test
    fun `sans media jouable le layout est vide`() {
        assertThat(ReelMediaLayout.resolve(emptyList())).isEqualTo(ReelMediaLayout.Empty)
        assertThat(ReelMediaLayout.resolve(listOf(document))).isEqualTo(ReelMediaLayout.Empty)
    }

    @Test
    fun `la video l emporte sur tout`() {
        assertThat(ReelMediaLayout.resolve(listOf(image1, audio, video))).isEqualTo(ReelMediaLayout.Video(video))
    }

    @Test
    fun `des images seules font un carrousel dans l ordre`() {
        assertThat(ReelMediaLayout.resolve(listOf(image1, document, image2)))
            .isEqualTo(ReelMediaLayout.Images(listOf(image1, image2)))
    }

    @Test
    fun `de l audio seul est la surface audio`() {
        assertThat(ReelMediaLayout.resolve(listOf(audio))).isEqualTo(ReelMediaLayout.AudioOnly(listOf(audio)))
    }

    @Test
    fun `images et audio se composent`() {
        assertThat(ReelMediaLayout.resolve(listOf(audio, image1)))
            .isEqualTo(ReelMediaLayout.ImagesWithAudio(listOf(image1), listOf(audio)))
    }

    @Test
    fun `le media d affichage prefere video puis audio puis image`() {
        assertThat(ReelMediaLayout.primaryDisplayMedia(listOf(image1, audio, video))).isEqualTo(video)
        assertThat(ReelMediaLayout.primaryDisplayMedia(listOf(image1, audio))).isEqualTo(audio)
        assertThat(ReelMediaLayout.primaryDisplayMedia(listOf(document, image1))).isEqualTo(image1)
        assertThat(ReelMediaLayout.primaryDisplayMedia(listOf(document))).isNull()
    }

    @Test
    fun `un repartage nu affiche les medias du reel republie`() {
        assertThat(ReelMediaLayout.displayMedia(emptyList(), listOf(video))).containsExactly(video)
        assertThat(ReelMediaLayout.displayMedia(listOf(image1), listOf(video))).containsExactly(image1)
    }
}
