package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14182 — une vidéo POSÉE sur une scène se peint dans la vignette de sa diapo par la même image que la scène : la première
 * de sa fenêtre coupée, qu'elle soit envoyée sans vignette servie ou encore en attente d'envoi.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SlideThumbnailPlacedVideoTest {

    private fun video(thumbnailUrl: String? = null) =
        UploadedMedia("v", "https://cdn/v.mp4", "video/mp4", 10L, 1080, 1920, 10_000L, thumbnailUrl)

    private fun posed(media: UploadedMedia, placed: StoryPlacedMedia = StoryPlacedMedia("v")) = StoryComposerUiState(
        deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf(media.id), placedMedia = listOf(placed))), "s"),
        attachments = listOf(media),
    )

    private fun StoryComposerUiState.tile() = thumbnailPlacedOf(deck.selectedSlide, null).single()

    @Test
    fun `an uploaded video posed without a served thumbnail loads by its first picture`() {
        assertThat(posed(video()).tile().model).isEqualTo(ComposerVideoFrame("https://cdn/v.mp4"))
    }

    @Test
    fun `a trimmed posed video shows the first picture of its window, the one the scene shows`() {
        val state = posed(video(), StoryPlacedMedia("v", sourceStart = 2.0, sourceEnd = 6.0))

        assertThat(state.tile().model).isEqualTo(ComposerVideoFrame("https://cdn/v.mp4", atMs = 2_000))
        assertThat(state.tile().model).isEqualTo(state.placedMediaFrames(null).single().model)
    }

    @Test
    fun `a pending posed video loads by the first picture of its file`() {
        val file = File.createTempFile("clip", ".mp4")
        val item = MediaUploadItem(MediaUploadSource.OnDisk(file), "clip.mp4", "video/mp4")
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p")))), "s"),
            pendingUploads = listOf(PendingMediaUpload("p", item)),
        )

        assertThat(state.tile().model).isInstanceOf(ComposerVideoFrame::class.java)
    }

    @Test
    fun `a posed video with a served thumbnail still loads by that thumbnail`() {
        assertThat(posed(video(thumbnailUrl = "https://cdn/v.jpg")).tile().model).isEqualTo("https://cdn/v.jpg")
    }

    @Test
    fun `two windows of the same posed video are two tiles, not one cached picture`() {
        val first = posed(video(), StoryPlacedMedia("v", sourceStart = 1.0, sourceEnd = 5.0)).tile().key
        val second = posed(video(), StoryPlacedMedia("v", sourceStart = 3.0, sourceEnd = 7.0)).tile().key

        assertThat(first).isNotEqualTo(second)
    }
}
