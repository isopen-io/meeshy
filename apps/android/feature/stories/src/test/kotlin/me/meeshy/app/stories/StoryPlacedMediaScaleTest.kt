package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/** Un média posé grandit sans plafond et rapetisse jusqu'à 5 pixels de la scène de référence sur son plus petit côté (#14298). */
@RunWith(JUnit4::class)
class StoryPlacedMediaScaleTest {

    private fun photo(id: String, width: Int, height: Int) =
        UploadedMedia(id = id, url = "/u/$id.jpg", mimeType = "image/jpeg", fileSize = 1, width = width, height = height, durationMs = null, thumbnailUrl = null)

    private fun withPlaced(placed: StoryPlacedMedia, vararg media: UploadedMedia): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf(placed.mediaId), placedMedia = listOf(placed))
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = media.toList())
    }

    private fun StoryComposerUiState.scale() = deck.selectedSlide.placedMedia.single().scale

    @Test
    fun `un media pose s agrandit au dela de l ancien plafond de 4`() {
        val state = withPlaced(StoryPlacedMedia("a", scale = 3f), photo("a", 1000, 2000))

        val grown = StoryComposerPlacedMediaReducer.transformed(state, "a", 10f, 0f)
        val again = StoryComposerPlacedMediaReducer.transformed(grown, "a", 10f, 0f)

        assertThat(again.scale()).isWithin(1e-3f).of(300f)
    }

    @Test
    fun `un portrait se reduit jusqu a ce que sa largeur vaille 5 pixels de la scene de reference`() {
        val state = withPlaced(StoryPlacedMedia("a"), photo("a", 1000, 2000))
        val narrow = ForegroundMediaFrame.baseDesignSize(0.5).width

        val shrunk = StoryComposerPlacedMediaReducer.transformed(state, "a", 0.00001f, 0f)

        assertThat(shrunk.scale()).isWithin(1e-6f).of((5.0 / narrow).toFloat())
    }

    @Test
    fun `un media recadre prend le plancher de son cadre recadre`() {
        val crop = StoryMediaCrop(x = 0.0, y = 0.0, width = 1.0, height = 0.1)
        val state = withPlaced(StoryPlacedMedia("a", crop = crop), photo("a", 1000, 2000))
        val ratio = StoryMediaCrop.effectiveRatio(0.5, crop)
        val side = ForegroundMediaFrame.baseDesignSize(ratio).let { minOf(it.width, it.height) }

        val shrunk = StoryComposerPlacedMediaReducer.transformed(state, "a", 0.00001f, 0f)

        assertThat(shrunk.scale()).isWithin(1e-6f).of((5.0 / side).toFloat())
    }

    @Test
    fun `un media pas encore televerse se reduit comme le carre qu il peint`() {
        val state = withPlaced(StoryPlacedMedia("a"))

        val shrunk = StoryComposerPlacedMediaReducer.transformed(state, "a", 0.00001f, 0f)

        assertThat(shrunk.scale()).isWithin(1e-6f).of((5.0 / 540.0).toFloat())
    }

    @Test
    fun `un facteur degenere laisse l echelle du media ou elle est`() {
        val state = withPlaced(StoryPlacedMedia("a", scale = 2f), photo("a", 1000, 2000))

        assertThat(StoryComposerPlacedMediaReducer.transformed(state, "a", 0f, 0f).scale()).isEqualTo(2f)
        assertThat(StoryComposerPlacedMediaReducer.transformed(state, "a", Float.NaN, 0f).scale()).isEqualTo(2f)
    }

    @Test
    fun `une echelle ecrite hors des anciennes bornes survit a la normalisation`() {
        assertThat(StoryPlacedMedia("a", scale = 40f).normalised().scale).isEqualTo(40f)
        assertThat(StoryPlacedMedia("a", scale = 0.01f).normalised().scale).isEqualTo(0.01f)
        assertThat(StoryPlacedMedia("a", scale = Float.NaN).normalised().scale).isEqualTo(1f)
    }
}
