package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.viewer.ImageViewerExit
import org.junit.Test

/** #13915 — ce qu'ouvre le toucher d'un média de commentaire, et ce que l'export en rend. */
class CommentMediaViewingTest {

    private fun photo(id: String, url: String? = "https://m/$id.jpg") =
        CommentMediaPreview(id = id, thumbnailUrl = url, isVideo = false, url = url, width = 1080, height = 1350)

    private fun video(id: String, url: String? = "https://m/$id.mp4") =
        CommentMediaPreview(id = id, thumbnailUrl = "https://m/$id.jpg", isVideo = true, url = url, durationMillis = 75_000)

    @Test
    fun `a photo opens the full screen over the photos of the comment, on the one touched`() {
        val media = listOf(photo("a"), video("v"), photo("b"))

        val opening = CommentMediaViewing.open(media, index = 2)

        assertThat(opening).isEqualTo(CommentMediaOpening.Images(listOf(photo("a"), photo("b")), startIndex = 1))
    }

    @Test
    fun `a video opens the video player on itself`() {
        val media = listOf(photo("a"), video("v"))

        assertThat(CommentMediaViewing.open(media, index = 1)).isEqualTo(CommentMediaOpening.Video(video("v")))
    }

    @Test
    fun `a piece without a file opens nothing`() {
        assertThat(CommentMediaViewing.open(listOf(photo("a", url = null)), index = 0)).isNull()
        assertThat(CommentMediaViewing.open(listOf(photo("a")), index = 3)).isNull()
    }

    @Test
    fun `a photo without its own file is skipped from the pages`() {
        val media = listOf(photo("a", url = null), photo("b"))

        assertThat(CommentMediaViewing.open(media, index = 1)).isEqualTo(CommentMediaOpening.Images(listOf(photo("b")), startIndex = 0))
    }

    @Test
    fun `a piece exports as a scene whose background is the piece itself`() {
        val item = CommentMediaViewing.exportItem(video("v"))

        assertThat(item.id).isEqualTo("comment-media-v")
        val background = item.media.single()
        assertThat(background.type).isEqualTo(FeedMediaType.VIDEO)
        assertThat(background.url).isEqualTo("https://m/v.mp4")
        assertThat(background.thumbnailUrl).isEqualTo("https://m/v.jpg")
        assertThat(background.duration).isEqualTo(75)
        assertThat(item.storyEffects).isNull()
        assertThat(CommentMediaViewing.exportItem(photo("a")).media.single().type).isEqualTo(FeedMediaType.IMAGE)
    }

    @Test
    fun `each exit of the viewer is one export mode`() {
        assertThat(ImageViewerExit.entries.map(CommentMediaViewing::mode))
            .containsExactly(StoryExportMode.SAVE, StoryExportMode.SHARE).inOrder()
    }
}
