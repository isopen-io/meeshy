package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * #13867 — la vignette d'une diapo reproduit la scène : ses médias posés compris, dans l'ordre de la scène (un texte caché
 * sous une image l'est aussi dans la vignette), et une diapo vide montre le fond par défaut de la scène, jamais du noir.
 */
class SlideThumbnailSceneTest {

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, 400, 300, null, null)

    private fun spec(state: StoryComposerUiState): SlideThumbnailSpec {
        val slide = state.deck.selectedSlide
        return SlideThumbnailSpec.of(
            slide, backgroundKey = null, accentHex = "#6366F1", widthPx = 74, heightPx = 132,
            placedMedia = state.thumbnailPlacedOf(slide, null),
        )
    }

    private val withPhoto = StoryComposerUiState(
        deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("photo"))), "s"),
        attachments = listOf(uploaded("photo")),
    )

    @Test
    fun `an empty slide paints the scene's default floor, not black`() {
        val blank = spec(StoryComposerUiState())

        assertThat(blank.fill).isInstanceOf(StorySceneFill.AuthorGradient::class.java)
        assertThat(SlideThumbnailRenderer.passes(blank)).containsExactly(SlideThumbnailPass.Fill)
    }

    @Test
    fun `a posed media is in the tile, at its place in the scene's order`() {
        val posed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val hidden = StoryComposerTextReducer.typed(StoryComposerTextReducer.added(posed, "t"), "Salut")
        val covered = StoryComposerSelectionReducer.mediaSelected(hidden, "photo")

        val layers = spec(covered).layers

        assertThat(layers.map { it::class }).containsExactly(SlideThumbnailSpec.Text::class, SlideThumbnailSpec.Media::class).inOrder()
        assertThat((layers.last() as SlideThumbnailSpec.Media).key).isEqualTo(ComposerMediaAddress.preview(uploaded("photo"), null))
    }

    @Test
    fun `the tile paints its floor, its background, its objects in order, then the drawing on top`() {
        val posed = StoryComposerPlacedMediaReducer.placed(withPhoto, "photo")
        val written = StoryComposerTextReducer.typed(StoryComposerTextReducer.added(posed, "t"), "Salut")
        val drawn = written.copy(
            deck = written.deck.setSelectedStrokes(listOf(me.meeshy.sdk.model.StoryDrawingStroke(id = "d", points = emptyList(), colorHex = "FFFFFF", width = 4.0))),
        )

        val passes = SlideThumbnailRenderer.passes(spec(drawn))

        assertThat(passes.first()).isEqualTo(SlideThumbnailPass.Fill)
        assertThat(passes.last()).isEqualTo(SlideThumbnailPass.Strokes)
        assertThat(passes.filterIsInstance<SlideThumbnailPass.Layer>().map { it.layer::class })
            .containsExactly(SlideThumbnailSpec.Media::class, SlideThumbnailSpec.Text::class).inOrder()
    }
}
