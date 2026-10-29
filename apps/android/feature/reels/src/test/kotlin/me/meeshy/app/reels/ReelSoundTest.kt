package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.stories.StorySlideView
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import org.junit.Test

class ReelSoundTest {

    private fun reel(vararg mimes: String) = ReelBuilder.build(
        listOf(
            ApiPost(
                id = "r",
                type = "REEL",
                media = mimes.mapIndexed { i, m -> ApiPostMedia(id = "m$i", mimeType = m, fileUrl = "https://cdn.test/$i") },
            ),
        ),
        mediaBaseUrl = null,
    ).single()

    private fun withScene(base: ReelPresentation, scene: StorySlideView) = base.copy(scene = scene)

    private fun slide(foregroundAudio: String? = null, backgroundVideo: String? = null) =
        StorySlideView(
            id = "s", text = "", isTranslated = false, imageUrl = null, accentHex = "1A1A2E",
            foregroundAudioUrl = foregroundAudio, backgroundVideoUrl = backgroundVideo,
        )

    @Test
    fun `a video reel shows the mute button only once its audio track is found`() {
        val video = reel("video/mp4")

        assertThat(ReelSound.showsMuteButton(video, probedAudioTrack = null)).isFalse()
        assertThat(ReelSound.showsMuteButton(video, probedAudioTrack = false)).isFalse()
        assertThat(ReelSound.showsMuteButton(video, probedAudioTrack = true)).isTrue()
    }

    @Test
    fun `an audio reel always shows the mute button, a photo reel never does`() {
        assertThat(ReelSound.showsMuteButton(reel("audio/mp4"), null)).isTrue()
        assertThat(ReelSound.showsMuteButton(reel("image/jpeg", "audio/mp4"), null)).isTrue()
        assertThat(ReelSound.showsMuteButton(reel("image/jpeg"), null)).isFalse()
    }

    @Test
    fun `a scene reel shows the mute button when its scene carries sound, whatever the raw video says`() {
        val base = reel("video/mp4")

        assertThat(ReelSound.showsMuteButton(withScene(base, slide(foregroundAudio = "u")), null)).isTrue()
        assertThat(ReelSound.showsMuteButton(withScene(base, slide()), probedAudioTrack = true)).isFalse()
    }

    @Test
    fun `a scene whose only sound could be its background video waits for that video's audio track`() {
        val scene = withScene(reel("video/mp4"), slide(backgroundVideo = "u"))

        assertThat(ReelSound.showsMuteButton(scene, probedAudioTrack = null)).isFalse()
        assertThat(ReelSound.showsMuteButton(scene, probedAudioTrack = false)).isFalse()
        assertThat(ReelSound.showsMuteButton(scene, probedAudioTrack = true)).isTrue()
        assertThat(ReelSound.showsMuteButton(withScene(reel("video/mp4"), slide(foregroundAudio = "a", backgroundVideo = "u")), false)).isTrue()
    }

    @Test
    fun `the preload window is the shown page and both neighbours, only in the foreground`() {
        assertThat((0..5).filter { ReelPreload.loads(it, currentPage = 3, isForeground = true) }).containsExactly(2, 3, 4)
        assertThat(ReelPreload.loads(3, 3, isForeground = false)).isFalse()
        assertThat(ReelPreload.loads(0, 0, isForeground = true)).isTrue()
        assertThat(ReelPreload.loads(-1, 0, isForeground = true)).isTrue()
    }
}
