package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

/**
 * #13663 — une scène au repos n'a plus de lecteur : la projection porte l'AFFICHE de chaque vidéo (la vignette que le serveur
 * sert, le ThumbHash à défaut), pour que le fond et les vidéos posées gardent une image au lieu de s'effacer.
 */
class StorySlideProjectorPosterTest {

    private fun video(id: String, thumbnailUrl: String? = null, thumbHash: String? = null) = FeedMedia(
        id = id,
        type = FeedMediaType.VIDEO,
        url = "https://cdn.meeshy.me/$id.mp4",
        thumbnailUrl = thumbnailUrl,
        thumbHash = thumbHash,
    )

    private fun project(item: StoryItem) = StorySlideProjector(null).project(item, "6366F1", NoContentPreferences)

    @Test
    fun `un fond video herite porte la vignette du serveur comme affiche`() {
        val slide = project(StoryItem(id = "s", media = listOf(video("m1", thumbnailUrl = "https://cdn.meeshy.me/m1.jpg"))))

        assertThat(slide.backgroundVideoUrl).isEqualTo("https://cdn.meeshy.me/m1.mp4")
        assertThat(slide.backgroundPosterUrl).isEqualTo("https://cdn.meeshy.me/m1.jpg")
    }

    @Test
    fun `un fond video sans vignette retombe sur le ThumbHash de la video`() {
        val slide = project(StoryItem(id = "s", media = listOf(video("m1", thumbHash = "VIDEO_HASH"))))

        assertThat(slide.backgroundPosterUrl).isNull()
        assertThat(slide.backgroundThumbHash).isEqualTo("VIDEO_HASH")
    }

    @Test
    fun `le ThumbHash de la scene prime sur celui de la video`() {
        val item = StoryItem(
            id = "s",
            media = listOf(video("m1", thumbHash = "VIDEO_HASH")),
            storyEffects = StoryEffects(thumbHash = "SLIDE_HASH"),
        )

        assertThat(project(item).backgroundThumbHash).isEqualTo("SLIDE_HASH")
    }

    @Test
    fun `un fond video moderne lit l affiche de la piece qu il designe, pas d une autre`() {
        val item = StoryItem(
            id = "s",
            media = listOf(
                video("autre", thumbnailUrl = "https://cdn.meeshy.me/autre.jpg"),
                video("fond", thumbnailUrl = "https://cdn.meeshy.me/fond.jpg"),
            ),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(id = "o1", postMediaId = "fond", mediaType = "video", isBackground = true),
                ),
            ),
        )

        assertThat(project(item).backgroundPosterUrl).isEqualTo("https://cdn.meeshy.me/fond.jpg")
    }

    @Test
    fun `une video posee porte l affiche de sa piece`() {
        val item = StoryItem(
            id = "s",
            media = listOf(video("v1", thumbnailUrl = "https://cdn.meeshy.me/v1.jpg", thumbHash = "POSED_HASH")),
            storyEffects = StoryEffects(
                mediaObjects = listOf(StoryMediaObject(id = "o1", postMediaId = "v1", mediaType = "video")),
            ),
        )

        val posed = project(item).foregroundMedia.single()

        assertThat(posed.posterUrl).isEqualTo("https://cdn.meeshy.me/v1.jpg")
        assertThat(posed.thumbHash).isEqualTo("POSED_HASH")
    }

    @Test
    fun `un fond image n a pas d affiche video`() {
        val image = FeedMedia(id = "i", type = FeedMediaType.IMAGE, url = "https://cdn.meeshy.me/i.jpg", thumbnailUrl = "https://cdn.meeshy.me/i-t.jpg")

        assertThat(project(StoryItem(id = "s", media = listOf(image))).backgroundPosterUrl).isNull()
    }
}
