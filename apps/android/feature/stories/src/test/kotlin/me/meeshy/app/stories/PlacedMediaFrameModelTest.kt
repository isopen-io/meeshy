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

/**
 * #13636 — une vidéo posée sans vignette ne laisse pas un calque vide ; #13863 — elle montre l'image du début de sa fenêtre,
 * extraite de la vidéo, et la vignette des Médias comme le fond font de même (recette S8 : carte grise, tuile vide).
 */
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
    fun `a video the server gave no thumbnail is painted with an image extracted from the video, never decoded as an image`() {
        val frames = stateWith(slide, attachments = listOf(uploaded("v", "video/mp4", null), uploaded("p", "image/jpeg", null)))
            .placedMediaFrames(mediaBaseUrl = null)

        assertThat(frames.first { it.key == "v" }.model).isEqualTo(ComposerVideoFrame("https://x/v", atMs = 0))
        assertThat(frames.first { it.key == "p" }.model).isEqualTo("https://x/p")
    }

    @Test
    fun `a cut placed video shows the first image of its window`() {
        val cut = StorySlide(id = "s", mediaIds = listOf("v"), placedMedia = listOf(StoryPlacedMedia("v", sourceStart = 2.5, sourceEnd = 6.0)))
        val video = uploaded("v", "video/mp4", null).copy(durationMs = 8_000)

        val frame = stateWith(cut, attachments = listOf(video)).placedMediaFrames(mediaBaseUrl = null).single()

        assertThat(frame.model).isEqualTo(ComposerVideoFrame("https://x/v", atMs = 2_500))
    }

    @Test
    fun `a video waiting on the device shows the first image of its file`() {
        val file = java.io.File("/data/user/0/me.meeshy.app.debug/cache/q.mp4")
        val pending = listOf(PendingMediaUpload("q", MediaUploadItem(me.meeshy.sdk.media.MediaUploadSource.OnDisk(file), "q.mp4", "video/mp4", 8_000)))

        val frame = stateWith(slide, pending = pending).placedMediaFrames(mediaBaseUrl = null).single()

        assertThat(frame.model).isEqualTo(ComposerVideoFrame("file://${file.path}", atMs = 0))
    }

    @Test
    fun `the media tile and the scene background of a video without thumbnail show an image of the video`() {
        val background = StorySlide(id = "s", mediaIds = listOf("v"))
        val state = stateWith(background, attachments = listOf(uploaded("v", "video/mp4", null)))

        assertThat(ComposerPicture.of(state.attachments.single(), apiBaseUrl = null)).isEqualTo(ComposerVideoFrame("https://x/v"))
        assertThat(state.selectedSlideBackdropModel(mediaBaseUrl = null)).isEqualTo(ComposerVideoFrame("https://x/v"))
    }

    @Test
    fun `a video with its thumbnail paints that thumbnail`() {
        val frames = stateWith(slide, attachments = listOf(uploaded("v", "video/mp4", "https://x/v.jpg"))).placedMediaFrames(mediaBaseUrl = null)

        assertThat(frames.single().model).isEqualTo("https://x/v.jpg")
    }

    @Test
    fun `a video kept in memory has no file to extract an image from`() {
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
