package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import org.junit.Test

class ReelStageTest {

    private fun reel(vararg media: Pair<String, String?>) = ReelBuilder.build(
        listOf(
            ApiPost(
                id = "r",
                type = "REEL",
                media = media.mapIndexed { i, (mime, thumb) ->
                    ApiPostMedia(id = "m$i", mimeType = mime, fileUrl = "https://cdn.test/$i", thumbnailUrl = thumb)
                },
            ),
        ),
        mediaBaseUrl = null,
    ).single()

    @Test
    fun `an audio-only reel without a cover plays its sound over the audio canvas, never a black video surface`() {
        val stage = reel("audio/mp4" to null).stage

        assertThat(stage.backdrop).isEqualTo(ReelBackdrop.AudioCanvas)
        assertThat(stage.showsVideoSurface).isFalse()
        assertThat(stage.playableUrl).isEqualTo("https://cdn.test/0")
    }

    @Test
    fun `an audio-only reel with a cover shows the cover`() {
        val stage = reel("audio/mp4" to "https://cdn.test/cover.jpg").stage

        assertThat(stage.backdrop).isEqualTo(ReelBackdrop.Picture("https://cdn.test/cover.jpg"))
        assertThat(stage.showsVideoSurface).isFalse()
    }

    @Test
    fun `an images-with-audio reel keeps its first image visible while the sound plays`() {
        val stage = reel("image/jpeg" to null, "audio/mpeg" to null).stage

        assertThat(stage.backdrop).isEqualTo(ReelBackdrop.Picture("https://cdn.test/0"))
        assertThat(stage.showsVideoSurface).isFalse()
        assertThat(stage.playableUrl).isEqualTo("https://cdn.test/1")
    }

    @Test
    fun `a video reel is drawn by its video surface alone`() {
        val stage = reel("video/mp4" to "https://cdn.test/poster.jpg").stage

        assertThat(stage.backdrop).isEqualTo(ReelBackdrop.None)
        assertThat(stage.showsVideoSurface).isTrue()
        assertThat(stage.playableUrl).isEqualTo("https://cdn.test/0")
    }

    @Test
    fun `an images-only reel has nothing to play`() {
        val stage = reel("image/jpeg" to null).stage

        assertThat(stage.backdrop).isEqualTo(ReelBackdrop.Picture("https://cdn.test/0"))
        assertThat(stage.playableUrl).isNull()
    }
}
