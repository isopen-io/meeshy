package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class SceneMediaLayerRulesTest {
    private fun media(
        url: String? = null,
        postMediaId: String = "pm",
        mediaType: String = "image",
        crop: StoryMediaCrop? = null,
        sourceStart: Double? = null,
        sourceEnd: Double? = null,
        volume: Float = 1f,
    ) = StoryMediaObject(
        id = "m", postMediaId = postMediaId, mediaURL = url, mediaType = mediaType,
        crop = crop, sourceStart = sourceStart, sourceEnd = sourceEnd, volume = volume,
    )

    @Test
    fun `le bitmap en memoire prime sur l adresse`() {
        val source = SceneMediaLayerRules.imageSource(media(url = "https://x/a.jpg"), resolvedUrl = "https://x/a.jpg", hasMemoryBitmap = true)
        assertThat(source).isEqualTo(SceneMediaLayerRules.ImageSource.MemoryBitmap)
    }

    @Test
    fun `sans bitmap l adresse sert et sans adresse rien ne se peint`() {
        assertThat(SceneMediaLayerRules.imageSource(media(), "https://x/a.jpg", false))
            .isEqualTo(SceneMediaLayerRules.ImageSource.Remote("https://x/a.jpg"))
        assertThat(SceneMediaLayerRules.imageSource(media(), null, false)).isEqualTo(SceneMediaLayerRules.ImageSource.None)
    }

    @Test
    fun `un file du lecteur absent de cet appareil retombe sur l adresse du serveur`() {
        val url = SceneMediaLayerRules.playableUrl(
            serverUrl = "https://cdn/x.jpg", mediaUrl = "file:///author/x.jpg", isReader = true, fileExists = { false },
        )
        assertThat(url).isEqualTo("https://cdn/x.jpg")
    }

    @Test
    fun `un file absent sans adresse serveur n est pas lisible chez le lecteur`() {
        val url = SceneMediaLayerRules.playableUrl(null, "file:///author/x.jpg", isReader = true, fileExists = { false })
        assertThat(url).isNull()
    }

    @Test
    fun `un file present ou le composeur le gardent tel quel`() {
        assertThat(SceneMediaLayerRules.playableUrl(null, "file:///a.jpg", isReader = true, fileExists = { true })).isEqualTo("file:///a.jpg")
        assertThat(SceneMediaLayerRules.playableUrl(null, "file:///a.jpg", isReader = false, fileExists = { false })).isEqualTo("file:///a.jpg")
    }

    @Test
    fun `l adresse resolue par le serveur prime sur le file`() {
        val url = SceneMediaLayerRules.playableUrl("https://cdn/x.jpg", "file:///a.jpg", isReader = false, fileExists = { true })
        assertThat(url).isEqualTo("https://cdn/x.jpg")
    }

    @Test
    fun `le rognage plein ou absent remplit le cadre et un rognage est borne`() {
        assertThat(SceneMediaLayerRules.crop(media())).isNull()
        assertThat(SceneMediaLayerRules.crop(media(crop = StoryMediaCrop.FULL))).isNull()
        val crop = SceneMediaLayerRules.crop(media(crop = StoryMediaCrop(0.9, 0.0, 0.5, 1.0)))
        assertThat(crop!!.width).isWithin(1e-9).of(0.1)
    }

    @Test
    fun `la fenetre de source n existe que pour une video`() {
        assertThat(SceneMediaLayerRules.sourceWindow(media(mediaType = "image", sourceStart = 1.0, sourceEnd = 2.0))).isNull()
        val window = SceneMediaLayerRules.sourceWindow(media(mediaType = "video", sourceStart = 3.0, sourceEnd = 8.0))
        assertThat(window!!.startMs).isEqualTo(3000L)
        assertThat(window.endMs).isEqualTo(8000L)
        assertThat(SceneMediaLayerRules.sourceWindow(media(mediaType = "video"))).isNull()
    }

    @Test
    fun `le volume d auteur s applique et le mute global ou son verrou le coupent`() {
        assertThat(SceneMediaLayerRules.playbackVolume(media(volume = 0.4f), globalMuted = false, muteLocked = false)).isEqualTo(0.4f)
        assertThat(SceneMediaLayerRules.playbackVolume(media(volume = 0.4f), globalMuted = true, muteLocked = false)).isEqualTo(0f)
        assertThat(SceneMediaLayerRules.playbackVolume(media(volume = 0.4f), globalMuted = false, muteLocked = true)).isEqualTo(0f)
    }

    @Test
    fun `le volume d auteur est borne au gain maximal`() {
        assertThat(SceneMediaLayerRules.playbackVolume(media(volume = 9f), false, false)).isEqualTo(StoryVolume.MAX_GAIN)
        assertThat(SceneMediaLayerRules.playbackVolume(media(volume = Float.NaN), false, false)).isEqualTo(0f)
    }

    @Test
    fun `les gif et apng sont reconnus comme animes`() {
        assertThat(SceneMediaLayerRules.isAnimated("https://x/a.gif?x=1")).isTrue()
        assertThat(SceneMediaLayerRules.isAnimated("https://x/a.APNG")).isTrue()
        assertThat(SceneMediaLayerRules.isAnimated("https://x/a.png")).isFalse()
        assertThat(SceneMediaLayerRules.isAnimated(null)).isFalse()
    }

    @Test
    fun `une image est decodee sans depasser 1080 et sans le rognage hors cadre`() {
        assertThat(SceneMediaLayerRules.decodeEdge(frameWidthPx = 300, crop = StoryMediaCrop(0.0, 0.0, 0.5, 1.0))).isEqualTo(600)
        assertThat(SceneMediaLayerRules.decodeEdge(frameWidthPx = 2000, crop = null)).isEqualTo(SceneMediaLoader.MAX_DECODE_EDGE)
    }
}
