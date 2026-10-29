package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryPlacedMediaFidelityTest {

    private fun uploaded(id: String, width: Int?, height: Int?) = UploadedMedia(
        id = id, url = "https://x/$id.jpg", mimeType = "image/jpeg", fileSize = 1L,
        width = width, height = height, durationMs = null, thumbnailUrl = null,
    )

    private fun stateWith(slide: StorySlide, attachments: List<UploadedMedia> = emptyList(), pending: List<PendingMediaUpload> = emptyList()) =
        StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = attachments, pendingUploads = pending)

    @Test
    fun `a placed media is framed on the composer at the ratio the readers will paint`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("p", "q"), placedMedia = listOf(StoryPlacedMedia("p"), StoryPlacedMedia("q")))
        val state = stateWith(
            slide,
            attachments = listOf(uploaded("p", 1080, 1920)),
            pending = listOf(PendingMediaUpload("q", MediaUploadItem(ByteArray(1), "q.jpg", "image/jpeg"))),
        )

        val frames = state.placedMediaFrames()

        assertThat(frames.first { it.key == "p" }.aspectRatio).isWithin(1e-9).of(0.5625)
        assertThat(frames.first { it.key == "q" }.aspectRatio).isNull()
    }

    @Test
    fun `a placed media publishes its measured ratio so no reader has to guess it`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p")))

        val objects = StoryPublishPlacedMedia.resolve(slide, stateWith(slide, attachments = listOf(uploaded("p", 2000, 1000))))

        assertThat(objects.single().aspectRatio).isWithin(1e-9).of(2.0)
    }

    @Test
    fun `a placed media without known dimensions publishes no ratio rather than a fake square`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("p"), placedMedia = listOf(StoryPlacedMedia("p")))

        val objects = StoryPublishPlacedMedia.resolve(slide, stateWith(slide, attachments = listOf(uploaded("p", null, null))))

        assertThat(objects.single().aspectRatio).isNull()
    }

    @Test
    fun `designating a placed media as the background takes it off the scene`() {
        val deck = StorySlideDeck(
            listOf(StorySlide(id = "s", mediaIds = listOf("p", "q"), placedMedia = listOf(StoryPlacedMedia("p"), StoryPlacedMedia("q")))),
            "s",
        )

        val designated = deck.toggleSelectedBackgroundMedia("p")

        assertThat(designated.selectedSlide.backgroundMediaId).isEqualTo("p")
        assertThat(designated.selectedSlide.placedMedia.map { it.mediaId }).containsExactly("q")
        assertThat(designated.toggleSelectedBackgroundMedia("p").selectedSlide.placedMedia.map { it.mediaId }).containsExactly("q")
    }
}
