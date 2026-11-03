package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.audio.BackgroundAudioAnnouncement
import org.junit.Test

/**
 * La projection d'une publication en scène jouable (fond, pistes, ThumbHash, repli hérité) est UNE fonction pure :
 * le lecteur de stories la lit sans la porter (lot story-viewer-decomposition-and-nav-graph).
 */
class StorySlideProjectorTest {

    private fun project(item: StoryItem) = StorySlideProjector(null).project(item, "6366F1", NoContentPreferences)

    private fun media(id: String, type: FeedMediaType, thumbHash: String? = null) = FeedMedia(
        id = id,
        type = type,
        url = "https://cdn.meeshy.me/$id",
        thumbHash = thumbHash,
    )

    @Test
    fun `un fond video ne remplit jamais l url d image`() {
        val slide = project(StoryItem(id = "s", media = listOf(media("v1", FeedMediaType.VIDEO))))

        assertThat(slide.backgroundVideoUrl).isEqualTo("https://cdn.meeshy.me/v1")
        assertThat(slide.imageUrl).isNull()
    }

    @Test
    fun `un fond image remplit l url d image et pas celle de la video`() {
        val slide = project(StoryItem(id = "s", media = listOf(media("i1", FeedMediaType.IMAGE))))

        assertThat(slide.imageUrl).isEqualTo("https://cdn.meeshy.me/i1")
        assertThat(slide.backgroundVideoUrl).isNull()
    }

    @Test
    fun `la piste d arriere-plan et celle de premier plan viennent de leur objet sonore`() {
        val item = StoryItem(
            id = "s",
            media = listOf(media("a1", FeedMediaType.AUDIO), media("a2", FeedMediaType.AUDIO)),
            storyEffects = StoryEffects(
                audioPlayerObjects = listOf(
                    StoryAudioPlayerObject(id = "o1", postMediaId = "a1", isBackground = true),
                    StoryAudioPlayerObject(id = "o2", postMediaId = "a2", isBackground = false),
                ),
            ),
        )

        val slide = project(item)

        assertThat(slide.backgroundAudioUrl).isEqualTo("https://cdn.meeshy.me/a1")
        assertThat(slide.foregroundAudioUrl).isEqualTo("https://cdn.meeshy.me/a2")
    }

    @Test
    fun `le repli herite de l arriere-plan est l audio de la story, jamais le premier plan`() {
        val slide = project(StoryItem(id = "s", audioUrl = "https://cdn.meeshy.me/voice.m4a"))

        assertThat(slide.backgroundAudioUrl).isEqualTo("https://cdn.meeshy.me/voice.m4a")
        assertThat(slide.foregroundAudioUrl).isNull()
    }

    @Test
    fun `le ThumbHash de la scene est conserve tel quel`() {
        val item = StoryItem(
            id = "s",
            media = listOf(media("i1", FeedMediaType.IMAGE, thumbHash = "IMAGE_HASH")),
            storyEffects = StoryEffects(thumbHash = "SLIDE_HASH"),
        )

        assertThat(project(item).backgroundThumbHash).isEqualTo("SLIDE_HASH")
    }

    @Test
    fun `un objet fond video moderne designe sa piece`() {
        val item = StoryItem(
            id = "s",
            media = listOf(media("fond", FeedMediaType.VIDEO)),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(id = "o1", postMediaId = "fond", mediaType = "video", isBackground = true),
                ),
            ),
        )

        assertThat(project(item).backgroundVideoUrl).isEqualTo("https://cdn.meeshy.me/fond")
    }

    @Test
    fun `un fond image recadre au carre depuis une photo portrait remplit la scene sans etre etire`() {
        val portrait = media("fond", FeedMediaType.IMAGE).copy(width = 900, height = 1600)
        val carre = StoryMediaCrop(x = 0.0, y = 0.21875, width = 1.0, height = 0.5625)
        val item = StoryItem(
            id = "s",
            media = listOf(portrait),
            storyEffects = StoryEffects(
                mediaObjects = listOf(StoryMediaObject(id = "o1", postMediaId = "fond", isBackground = true, crop = carre)),
            ),
        )

        val transform = project(item).backgroundTransform

        assertThat(transform.scaleX).isEqualTo(transform.scaleY)
        assertThat(transform.scaleX.toDouble()).isWithin(1e-4).of(16.0 / 9.0)
    }

    @Test
    fun `la slide annonce son son d arriere-plan`() {
        val item = StoryItem(
            id = "s",
            storyEffects = StoryEffects(audioPlayerObjects = listOf(StoryAudioPlayerObject("a", isBackground = true, soundId = "x", name = "Pulse"))),
        )

        assertThat(project(item).backgroundAudio).isEqualTo(BackgroundAudioAnnouncement.Credit("Pulse", null, null, null))
        assertThat(project(StoryItem(id = "s")).backgroundAudio).isEqualTo(BackgroundAudioAnnouncement.None)
    }
}
