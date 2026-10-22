package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerDrawingReducerTest {

    private val drag = listOf(StoryDrawingStrokePoint(10.0, 10.0), StoryDrawingStrokePoint(20.0, 30.0))

    @Test
    fun `entering drawing closes the band and clears every selection`() {
        val busy = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")
            .copy(band = ComposerBandState.Hidden.tapFab(BandCategory.entries.first()), elementMenuId = "t1")

        val after = StoryComposerDrawingReducer.entered(busy)

        assertThat(after.isDrawingActive).isTrue()
        assertThat(after.band).isEqualTo(ComposerBandState.Hidden)
        assertThat(after.selectedTextElementId).isNull()
        assertThat(after.elementMenuId).isNull()
    }

    @Test
    fun `exiting when not drawing keeps the same instance`() {
        val base = StoryComposerUiState()

        assertThat(StoryComposerDrawingReducer.exited(base)).isSameInstanceAs(base)
    }

    @Test
    fun `pen colour and width are recorded for the next stroke`() {
        val after = StoryComposerDrawingReducer.widthSelected(
            StoryComposerDrawingReducer.colorSelected(StoryComposerUiState(), "FF00FF"),
            12.0,
        )

        assertThat(after.drawColorHex).isEqualTo("FF00FF")
        assertThat(after.drawWidthDesign).isEqualTo(12.0)
    }

    @Test
    fun `a captured stroke is committed with the pen settings and mirrored on the slide`() {
        val pen = StoryComposerDrawingReducer.colorSelected(StoryComposerUiState(), "00FF00")

        val after = StoryComposerDrawingReducer.captured(pen, drag, id = "k1", createdAtEpochSeconds = 42.0)

        val stroke = after.deck.selectedSlide.strokes.single()
        assertThat(stroke.id).isEqualTo("k1")
        assertThat(stroke.colorHex).isEqualTo("00FF00")
        assertThat(stroke.createdAt).isEqualTo(42.0)
        assertThat(after.drawingBoard.canUndo).isTrue()
    }

    @Test
    fun `a tap with fewer than two points is dropped`() {
        val base = StoryComposerUiState()

        val after = StoryComposerDrawingReducer.captured(base, drag.take(1), "k1", 1.0)

        assertThat(after).isSameInstanceAs(base)
    }

    @Test
    fun `undo removes the last stroke from the slide`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)

        val after = StoryComposerDrawingReducer.undone(drawn)

        assertThat(after.deck.selectedSlide.strokes).isEmpty()
    }
}
