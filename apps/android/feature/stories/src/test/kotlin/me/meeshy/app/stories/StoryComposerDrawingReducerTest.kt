package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.sdk.model.scene.StrokePoint
import me.meeshy.sdk.model.composer.ComposerBandState
import me.meeshy.sdk.model.composer.StoryToolMode
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerDrawingReducerTest {

    private val drag = listOf(StoryDrawingStrokePoint(10.0, 10.0), StoryDrawingStrokePoint(20.0, 30.0))

    @Test
    fun `entering drawing closes the band and clears every selection`() {
        val busy = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")
            .copy(band = ComposerBandState.Hidden.tapTool(StoryToolMode.TEXT), elementMenuId = "t1")

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
    fun `a tap commits a single point disc and no capture at all commits nothing`() {
        val base = StoryComposerUiState()

        val tapped = StoryComposerDrawingReducer.captured(base, drag.take(1), "k1", 1.0)

        assertThat(tapped.deck.selectedSlide.strokes.single().points).hasSize(1)
        assertThat(StoryComposerDrawingReducer.captured(base, emptyList(), "k2", 1.0)).isSameInstanceAs(base)
    }

    @Test
    fun `a captured stroke carries the brush, the smoothing and capture version 1`() {
        val brush = StoryComposerDrawingReducer.smoothingSelected(
            StoryComposerDrawingReducer.brushSelected(StoryComposerUiState(), StrokeTool.MARKER),
            StrokeSmoothing.LINE,
        )

        val stroke = StoryComposerDrawingReducer.captured(brush, drag, "k1", 1.0).deck.selectedSlide.strokes.single()

        assertThat(stroke.tool).isEqualTo(StrokeTool.MARKER)
        assertThat(stroke.smoothing).isEqualTo(StrokeSmoothing.LINE)
        assertThat(stroke.captureVersion).isEqualTo(1)
    }

    @Test
    fun `the eraser brush never commits a stroke`() {
        val eraser = StoryComposerDrawingReducer.brushSelected(StoryComposerUiState(), StrokeTool.ERASER)

        assertThat(StoryComposerDrawingReducer.captured(eraser, drag, "k1", 1.0)).isSameInstanceAs(eraser)
    }

    @Test
    fun `erasing removes the grazed stroke and a miss changes nothing`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)

        val missed = StoryComposerDrawingReducer.erased(drawn, listOf(StrokePoint(900.0, 1800.0)))
        val erased = StoryComposerDrawingReducer.erased(drawn, listOf(StrokePoint(15.0, 20.0)))

        assertThat(missed).isSameInstanceAs(drawn)
        assertThat(erased.deck.selectedSlide.strokes).isEmpty()
    }

    @Test
    fun `redo brings back the undone stroke and a new stroke empties the redo stack`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)
        val undone = StoryComposerDrawingReducer.undone(drawn)

        assertThat(StoryComposerDrawingReducer.redone(undone).deck.selectedSlide.strokes.map { it.id }).containsExactly("k1")
        val fresh = StoryComposerDrawingReducer.captured(undone, drag, "k2", 2.0)
        assertThat(fresh.drawingBoard.canRedo).isFalse()
    }

    @Test
    fun `with a stroke selected colour, width and smoothing edit THE STROKE not the brush`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)
        val selected = StoryComposerDrawingReducer.strokeToolToggled(drawn, "k1", DrawingEditTool.COLOR)

        val edited = StoryComposerDrawingReducer.smoothingSelected(
            StoryComposerDrawingReducer.widthSelected(StoryComposerDrawingReducer.colorSelected(selected, "FF2E63"), 22.0),
            StrokeSmoothing.LINE,
        )

        val stroke = edited.deck.selectedSlide.strokes.single()
        assertThat(stroke.colorHex).isEqualTo("FF2E63")
        assertThat(stroke.width).isEqualTo(22.0)
        assertThat(stroke.smoothing).isEqualTo(StrokeSmoothing.LINE)
        assertThat(edited.drawColorHex).isEqualTo(StoryDrawingPalette.DEFAULT_COLOR)
        assertThat(edited.drawWidthDesign).isEqualTo(StoryDrawingPalette.DEFAULT_WIDTH)
    }

    @Test
    fun `picking a brush leaves stroke editing and a width is clamped to 1 to 30`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)
        val selected = StoryComposerDrawingReducer.strokeToolToggled(drawn, "k1", DrawingEditTool.THICKNESS)

        val branched = StoryComposerDrawingReducer.widthSelected(StoryComposerDrawingReducer.brushSelected(selected, StrokeTool.PEN), 80.0)

        assertThat(branched.drawingBoard.selectedStrokeId).isNull()
        assertThat(branched.drawWidthDesign).isEqualTo(30.0)
    }

    @Test
    fun `tapping a stroke tool twice folds the panel and deleting a stroke removes it`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)
        val open = StoryComposerDrawingReducer.strokeToolToggled(drawn, "k1", DrawingEditTool.SMOOTHING)
        val folded = StoryComposerDrawingReducer.strokeToolToggled(open, "k1", DrawingEditTool.SMOOTHING)

        assertThat(open.drawingExpandedTool).isEqualTo(DrawingEditTool.SMOOTHING)
        assertThat(folded.drawingExpandedTool).isNull()
        assertThat(StoryComposerDrawingReducer.strokeDeleted(folded, "k1").deck.selectedSlide.strokes).isEmpty()
    }

    @Test
    fun `finishing frees the tool and lifts the stroke selection and panel`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerDrawingReducer.entered(StoryComposerUiState()), drag, "k1", 1.0)
        val editing = StoryComposerDrawingReducer.strokeToolToggled(drawn, "k1", DrawingEditTool.COLOR)

        val done = StoryComposerDrawingReducer.exited(editing)

        assertThat(done.isDrawingActive).isFalse()
        assertThat(done.drawingBoard.selectedStrokeId).isNull()
        assertThat(done.drawingExpandedTool).isNull()
    }

    @Test
    fun `undo removes the last stroke from the slide`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)

        val after = StoryComposerDrawingReducer.undone(drawn)

        assertThat(after.deck.selectedSlide.strokes).isEmpty()
    }

    @Test
    fun `a bubble opens the brush panel, a second tap folds it, and it leaves stroke editing`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)
        val editing = StoryComposerDrawingReducer.strokeToolToggled(drawn, "k1", DrawingEditTool.COLOR)

        val opened = StoryComposerDrawingReducer.toolToggled(editing, DrawingEditTool.THICKNESS)
        val folded = StoryComposerDrawingReducer.toolToggled(opened, DrawingEditTool.THICKNESS)

        assertThat(opened.drawingBoard.selectedStrokeId).isNull()
        assertThat(opened.drawingExpandedTool).isEqualTo(DrawingEditTool.THICKNESS)
        assertThat(folded.drawingExpandedTool).isNull()
    }

    @Test
    fun `drawing a new stroke while one is selected leaves stroke editing`() {
        val drawn = StoryComposerDrawingReducer.captured(StoryComposerUiState(), drag, "k1", 1.0)
        val editing = StoryComposerDrawingReducer.strokeToolToggled(drawn, "k1", DrawingEditTool.COLOR)

        val next = StoryComposerDrawingReducer.captured(editing, drag, "k2", 2.0)

        assertThat(next.drawingBoard.selectedStrokeId).isNull()
        assertThat(next.deck.selectedSlide.strokes.map { it.id }).containsExactly("k1", "k2").inOrder()
    }
}
