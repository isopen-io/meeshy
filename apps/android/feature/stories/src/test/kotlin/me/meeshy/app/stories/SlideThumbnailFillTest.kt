package me.meeshy.app.stories

import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13843 — la vignette d'une diapo suit son fond réel : un fond dégradé se peint en dégradé (jamais en noir), et une vidéo
 * en fond se charge par son image, jamais par son adresse que le chargeur d'images ne sait pas décoder.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SlideThumbnailFillTest {

    private fun tile(slide: StorySlide) = SlideThumbnailSpec.of(slide, backgroundKey = null, accentHex = "#6366F1", widthPx = 74, heightPx = 132)

    private fun channels(pixel: Int) = Triple(Color.red(pixel), Color.green(pixel), Color.blue(pixel))

    @Test
    fun `a gradient background paints its two colours, not black`() {
        val spec = tile(StorySlide(id = "s", background = StoryBackgroundValue.Gradient("FF2E63", "08D9D6")))

        val bitmap = SlideThumbnailRenderer.render(spec, background = null)

        val (r0, g0, b0) = channels(bitmap.getPixel(1, 1))
        val (r1, g1, b1) = channels(bitmap.getPixel(72, 130))
        assertThat(r0).isGreaterThan(200)
        assertThat(b0).isLessThan(140)
        assertThat(g1).isGreaterThan(170)
        assertThat(b1).isGreaterThan(170)
        assertThat(r1).isLessThan(60)
        assertThat(g0 + r0 + b0).isGreaterThan(0)
    }

    @Test
    fun `a slide with no declared background paints the author gradient, not black`() {
        val bitmap = SlideThumbnailRenderer.render(tile(StorySlide(id = "s")), background = null)

        val (r, g, b) = channels(bitmap.getPixel(37, 2))
        assertThat(r + g + b).isGreaterThan(150)
    }

    @Test
    fun `an uploaded video in the background loads by its picture, not by its address`() {
        val video = UploadedMedia("v", "https://cdn/v.mp4", "video/mp4", 10L, 1080, 1920, 3_000L, null)
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("v"), backgroundMediaId = "v")), "s"),
            attachments = listOf(video),
        )

        val background = state.thumbnailBackgroundOf(state.deck.selectedSlide, null)

        assertThat(background?.model).isEqualTo(ComposerVideoFrame("https://cdn/v.mp4"))
    }

    @Test
    fun `a pending video in the background loads by its first picture`() {
        val file = File.createTempFile("clip", ".mp4")
        val item = MediaUploadItem(MediaUploadSource.OnDisk(file), "clip.mp4", "video/mp4")
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("p"), backgroundMediaId = "p")), "s"),
            pendingUploads = listOf(PendingMediaUpload("p", item)),
        )

        val background = state.thumbnailBackgroundOf(state.deck.selectedSlide, null)

        assertThat(background?.model).isInstanceOf(ComposerVideoFrame::class.java)
    }

    @Test
    fun `a photo in the background still loads by its own address`() {
        val photo = UploadedMedia("p", "https://cdn/p.jpg", "image/jpeg", 10L, 400, 300, null, null)
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("p"), backgroundMediaId = "p")), "s"),
            attachments = listOf(photo),
        )

        assertThat(state.thumbnailBackgroundOf(state.deck.selectedSlide, null)?.model).isEqualTo("https://cdn/p.jpg")
    }
}
