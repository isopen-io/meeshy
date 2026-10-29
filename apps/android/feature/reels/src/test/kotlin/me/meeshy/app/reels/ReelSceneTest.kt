package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.stories.NoContentPreferences
import me.meeshy.app.stories.StorySlideProjector
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.story.toStoryItem
import org.junit.Test

class ReelSceneTest {

    private val media = listOf(
        ApiPostMedia(id = "v", mimeType = "video/mp4", fileUrl = "https://cdn.test/v.mp4", thumbnailUrl = "https://cdn.test/v.jpg"),
        ApiPostMedia(id = "a", mimeType = "audio/mp4", fileUrl = "https://cdn.test/a.m4a"),
        ApiPostMedia(id = "i", mimeType = "image/jpeg", fileUrl = "https://cdn.test/i.jpg"),
    )

    private val composed = StoryEffects(
        mediaObjects = listOf(
            StoryMediaObject(id = "bg", postMediaId = "v", mediaType = "video", isBackground = true),
            StoryMediaObject(id = "fg", postMediaId = "i", mediaType = "image", x = 0.3, y = 0.6),
        ),
        textObjects = listOf(StoryTextObject(id = "t", text = "Salut")),
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s", postMediaId = "a", isBackground = true)),
    )

    private fun post(effects: StoryEffects?, media: List<ApiPostMedia> = this.media) =
        ApiPost(id = "r", type = "REEL", media = media, storyEffects = effects)

    private fun reel(effects: StoryEffects?) = ReelBuilder.build(listOf(post(effects)), mediaBaseUrl = null).single()

    @Test
    fun `a composed reel carries the scene the story viewer would play for the same payload`() {
        val reel = reel(composed)

        val expected = StorySlideProjector(null).project(post(composed).toStoryItem(), reel.scene!!.accentHex, NoContentPreferences)
        assertThat(reel.scene).isEqualTo(expected)
        assertThat(reel.scene!!.foregroundMedia.map { it.id }).containsExactly("fg")
        assertThat(reel.scene!!.textObjects).hasSize(1)
        assertThat(reel.scene!!.backgroundVideoUrl).isEqualTo("https://cdn.test/v.mp4")
        assertThat(reel.scene!!.backgroundAudioUrl).isEqualTo("https://cdn.test/a.m4a")
    }

    @Test
    fun `a composed reel never plays its raw video beside its scene`() {
        val reel = reel(composed)

        assertThat(reel.videoUrl).isNull()
        assertThat(reel.stage.playableUrl).isNull()
        assertThat(reel.stage.showsVideoSurface).isFalse()
        assertThat(reel.stage.backdrop).isEqualTo(ReelBackdrop.None)
    }

    @Test
    fun `a plain video reel has no scene and still plays its video`() {
        val reel = reel(null)

        assertThat(reel.scene).isNull()
        assertThat(reel.stage.playableUrl).isEqualTo("https://cdn.test/v.mp4")
        assertThat(reel.stage.showsVideoSurface).isTrue()
    }

    @Test
    fun `a background colour alone is not a scene`() {
        assertThat(ReelScene.isScene(StoryEffects(background = "FF0000"))).isFalse()
        assertThat(ReelScene.isScene(null)).isFalse()
    }

    @Test
    fun `a scene made only of text survives a post whose files are all unplayable`() {
        val effects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "Seul")))
        val reels = ReelBuilder.build(listOf(post(effects, media = emptyList())), mediaBaseUrl = null)

        assertThat(reels.single().scene!!.textObjects).hasSize(1)
    }
}
