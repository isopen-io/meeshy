package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13636 — une vidéo posée sans vignette ne laisse pas un calque vide : le plateau y peint un cadre de vidéo. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlacedMediaFrameModelTest {

    @get:Rule
    val compose = createComposeRule()

    private fun uploaded(id: String, mime: String, thumbnailUrl: String?) = UploadedMedia(
        id = id, url = "https://x/$id", mimeType = mime, fileSize = 1L, width = 100, height = 100, durationMs = null, thumbnailUrl = thumbnailUrl,
    )

    private fun stateWith(slide: StorySlide, attachments: List<UploadedMedia> = emptyList(), pending: List<PendingMediaUpload> = emptyList()) =
        StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = attachments, pendingUploads = pending)

    private val slide = StorySlide(
        id = "s", mediaIds = listOf("v", "p", "q"),
        placedMedia = listOf(StoryPlacedMedia("v"), StoryPlacedMedia("p"), StoryPlacedMedia("q")),
    )

    @Test
    fun `a video the server gave no thumbnail has no image to decode`() {
        val frames = stateWith(slide, attachments = listOf(uploaded("v", "video/mp4", null), uploaded("p", "image/jpeg", null)))
            .placedMediaFrames(mediaBaseUrl = null)

        assertThat(frames.first { it.key == "v" }.model).isNull()
        assertThat(frames.first { it.key == "p" }.model).isEqualTo("https://x/p")
    }

    @Test
    fun `a video with its thumbnail paints that thumbnail`() {
        val frames = stateWith(slide, attachments = listOf(uploaded("v", "video/mp4", "https://x/v.jpg"))).placedMediaFrames(mediaBaseUrl = null)

        assertThat(frames.single().model).isEqualTo("https://x/v.jpg")
    }

    @Test
    fun `a video waiting on the device has no image to decode either`() {
        val pending = listOf(PendingMediaUpload("q", MediaUploadItem(ByteArray(4), "q.mp4", "video/mp4")))

        val frame = stateWith(slide, pending = pending).placedMediaFrames(mediaBaseUrl = null).single()

        assertThat(frame.model).isNull()
        assertThat(frame.isVideo).isTrue()
    }

    @Test
    fun `a video without an image to decode is drawn as a video frame, never as an empty layer`() {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier) {
                    PlacedMediaLayer(
                        frame = PlacedMediaFrame(StoryPlacedMedia("v"), model = null, isVideo = true),
                        canvasWidthPx = 300f,
                        canvasHeightPx = 400f,
                        gestures = PlacedMediaGestures({ _, _, _ -> }, {}, { _, _, _ -> }),
                    )
                }
            }
        }

        compose.onNodeWithTag("placed-media-placeholder").assertExists()
    }
}
