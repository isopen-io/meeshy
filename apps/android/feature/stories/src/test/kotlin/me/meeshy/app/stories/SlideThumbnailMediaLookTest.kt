package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13841 — la vignette d'une diapo peint le filtre, l'effet et le cadre choisis sur ses médias, comme la scène : un look
 * posé change la vignette, et la vignette se repeint quand il change.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SlideThumbnailMediaLookTest {
    private val warm = StoryMediaLook(filterPreset = "warm")
    private val polaroid = StoryMediaLook(frameId = "classic:polaroid")
    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 Oct 2026", "10:42"), "24 Oct 2026")

    private fun photo(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, 1080, 1920, null, null)

    private fun state(looks: Map<String, StoryMediaLook>, background: String? = "bg", placed: List<String> = listOf("p")): StoryComposerUiState {
        val ids = listOfNotNull(background) + placed
        val slide = StorySlide(
            id = "s",
            mediaIds = ids,
            backgroundMediaId = background,
            placedMedia = placed.map { StoryPlacedMedia(it) },
            mediaLooks = looks,
        )
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = ids.map(::photo))
    }

    private fun StoryComposerUiState.spec(): SlideThumbnailSpec {
        val slide = deck.selectedSlide
        val background = thumbnailBackgroundOf(slide, null)
        return SlideThumbnailSpec.of(
            slide = slide,
            backgroundKey = background?.key,
            accentHex = null,
            widthPx = 74,
            heightPx = 132,
            placedMedia = thumbnailPlacedOf(slide, null),
            backgroundLook = background?.look,
        )
    }

    @Test
    fun `the background and each posed media carry the look the scene paints on them`() {
        val state = state(mapOf("bg" to warm, "p" to polaroid))

        assertThat(state.thumbnailBackgroundOf(state.deck.selectedSlide, null)?.look).isEqualTo(warm)
        assertThat(state.thumbnailPlacedOf(state.deck.selectedSlide, null).single().look).isEqualTo(polaroid)
    }

    @Test
    fun `a media without a look carries none`() {
        val state = state(emptyMap())

        assertThat(state.thumbnailBackgroundOf(state.deck.selectedSlide, null)?.look).isNull()
        assertThat(state.thumbnailPlacedOf(state.deck.selectedSlide, null).single().look).isNull()
    }

    @Test
    fun `choosing a filter on the background repaints the tile instead of serving the cached one`() {
        assertThat(state(mapOf("bg" to warm)).spec()).isNotEqualTo(state(emptyMap()).spec())
    }

    @Test
    fun `choosing a frame on a posed media repaints the tile instead of serving the cached one`() {
        assertThat(state(mapOf("p" to polaroid)).spec()).isNotEqualTo(state(emptyMap()).spec())
    }

    @Test
    fun `the tile paints the look on the decoded media, by the painter of the scene`() {
        val source = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.rgb(120, 120, 120)) }

        val painted = SlideThumbnailLook.painted(source, warm, author)

        assertThat(painted.width).isEqualTo(90)
        assertThat(painted.height).isEqualTo(160)
        assertThat(painted.getPixel(45, 80)).isNotEqualTo(source.getPixel(45, 80))
    }

    @Test
    fun `a media without a look is painted as decoded`() {
        val source = Bitmap.createBitmap(9, 16, Bitmap.Config.ARGB_8888)

        assertThat(SlideThumbnailLook.painted(source, null, author)).isSameInstanceAs(source)
    }
}
