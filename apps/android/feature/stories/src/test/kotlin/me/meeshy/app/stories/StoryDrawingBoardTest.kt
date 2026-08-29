package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure freehand-drawing board — the committed-strokes
 * state with undo / redo / clear and per-stroke editing (the named §Stories
 * parity gap "pen/marker/eraser, colour, width, undo/redo/clear"). Ports the iOS
 * `StoryComposerViewModel+DrawingEditing` reducer to an immutable value type so
 * the future Compose capture surface + composer ViewModel stay glue. No Android,
 * no I/O, no clock.
 */
@RunWith(JUnit4::class)
class StoryDrawingBoardTest {

    private fun stroke(id: String, color: String = "FF0000", width: Double = 8.0) =
        StoryDrawingStroke(
            id = id,
            points = listOf(StoryDrawingStrokePoint(0.0, 0.0), StoryDrawingStrokePoint(10.0, 10.0)),
            colorHex = color,
            width = width,
        )

    private fun boardOf(vararg ids: String): StoryDrawingBoard =
        ids.fold(StoryDrawingBoard()) { board, id -> board.commit(stroke(id)) }

    // MARK: model defaults

    @Test
    fun `stroke defaults to pen, raw smoothing, legacy capture version`() {
        val s = StoryDrawingStroke(id = "a", colorHex = "00FF00", width = 4.0)
        assertThat(s.tool).isEqualTo(StrokeTool.PEN)
        assertThat(s.smoothing).isEqualTo(StrokeSmoothing.RAW)
        assertThat(s.captureVersion).isEqualTo(0)
        assertThat(s.points).isEmpty()
    }

    @Test
    fun `point defaults to full pressure`() {
        assertThat(StoryDrawingStrokePoint(1.0, 2.0).pressure).isEqualTo(1.0)
    }

    @Test
    fun `tool and smoothing carry the exact gateway wire strings`() {
        assertThat(StrokeTool.entries.map { it.wire })
            .containsExactly("pen", "marker", "eraser").inOrder()
        assertThat(StrokeSmoothing.entries.map { it.wire })
            .containsExactly("raw", "curve", "line").inOrder()
    }

    @Test
    fun `fresh board is empty with nothing to undo, redo or clear`() {
        val board = StoryDrawingBoard()
        assertThat(board.strokes).isEmpty()
        assertThat(board.isEmpty).isTrue()
        assertThat(board.canUndo).isFalse()
        assertThat(board.canRedo).isFalse()
        assertThat(board.selectedStrokeId).isNull()
    }

    // MARK: commit

    @Test
    fun `commit appends the stroke in draw order and enables undo`() {
        val board = boardOf("a", "b")
        assertThat(board.strokes.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(board.canUndo).isTrue()
        assertThat(board.isEmpty).isFalse()
    }

    @Test
    fun `commit invalidates the redo stack — a new stroke makes redo caduc`() {
        val board = boardOf("a", "b").undo() // redo now holds "b"
        assertThat(board.canRedo).isTrue()

        val after = board.commit(stroke("c"))
        assertThat(after.canRedo).isFalse()
        assertThat(after.strokes.map { it.id }).containsExactly("a", "c").inOrder()
    }

    // MARK: undo

    @Test
    fun `undo moves the last stroke onto the redo stack`() {
        val board = boardOf("a", "b").undo()
        assertThat(board.strokes.map { it.id }).containsExactly("a").inOrder()
        assertThat(board.canRedo).isTrue()
    }

    @Test
    fun `undo on an empty board is a no-op`() {
        val board = StoryDrawingBoard()
        assertThat(board.undo()).isEqualTo(board)
    }

    @Test
    fun `undo of the selected stroke lifts the selection`() {
        val board = boardOf("a", "b").select("b").undo()
        assertThat(board.selectedStrokeId).isNull()
    }

    @Test
    fun `undo of a non-selected stroke keeps the selection`() {
        val board = boardOf("a", "b").select("a").undo()
        assertThat(board.selectedStrokeId).isEqualTo("a")
    }

    // MARK: redo

    @Test
    fun `redo re-appends the last undone stroke`() {
        val board = boardOf("a", "b").undo().redo()
        assertThat(board.strokes.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(board.canRedo).isFalse()
    }

    @Test
    fun `redo on an empty redo stack is a no-op`() {
        val board = boardOf("a")
        assertThat(board.redo()).isEqualTo(board)
    }

    @Test
    fun `undo then redo round-trips to the same strokes`() {
        val start = boardOf("a", "b", "c")
        val roundTripped = start.undo().redo()
        assertThat(roundTripped.strokes).isEqualTo(start.strokes)
    }

    @Test
    fun `multiple undo then multiple redo restores draw order — redo is LIFO`() {
        val board = boardOf("a", "b", "c").undo().undo() // strokes: [a], redo top-of-stack: b
        assertThat(board.strokes.map { it.id }).containsExactly("a").inOrder()

        val restored = board.redo().redo()
        assertThat(restored.strokes.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    // MARK: clear

    @Test
    fun `clear empties strokes and the redo stack and lifts the selection`() {
        val board = boardOf("a", "b").select("a").undo().clear()
        assertThat(board.strokes).isEmpty()
        assertThat(board.canRedo).isFalse()
        assertThat(board.canUndo).isFalse()
        assertThat(board.selectedStrokeId).isNull()
        assertThat(board.isEmpty).isTrue()
    }

    // MARK: delete

    @Test
    fun `delete removes the matching stroke and invalidates redo`() {
        val board = boardOf("a", "b", "c").undo() // redo holds "c"
        val after = board.delete("a")
        assertThat(after.strokes.map { it.id }).containsExactly("b").inOrder()
        assertThat(after.canRedo).isFalse()
    }

    @Test
    fun `delete of the selected stroke lifts the selection`() {
        val board = boardOf("a", "b").select("b").delete("b")
        assertThat(board.selectedStrokeId).isNull()
        assertThat(board.strokes.map { it.id }).containsExactly("a").inOrder()
    }

    @Test
    fun `delete of a non-selected stroke keeps the selection`() {
        val board = boardOf("a", "b").select("a").delete("b")
        assertThat(board.selectedStrokeId).isEqualTo("a")
    }

    @Test
    fun `delete of an unknown id is a no-op — redo survives, board unchanged`() {
        val board = boardOf("a", "b").undo() // redo holds "b"
        val after = board.delete("zzz")
        assertThat(after).isEqualTo(board)
        assertThat(after.canRedo).isTrue()
    }

    // MARK: selection

    @Test
    fun `select marks an existing stroke`() {
        assertThat(boardOf("a", "b").select("b").selectedStrokeId).isEqualTo("b")
    }

    @Test
    fun `select null deselects`() {
        assertThat(boardOf("a").select("a").select(null).selectedStrokeId).isNull()
    }

    @Test
    fun `select of an unknown id is inert — keeps the current selection`() {
        val board = boardOf("a", "b").select("a").select("zzz")
        assertThat(board.selectedStrokeId).isEqualTo("a")
    }

    // MARK: per-stroke editing

    @Test
    fun `recolorSelected repaints only the selected stroke, order and points intact`() {
        val board = boardOf("a", "b").select("b").recolorSelected("112233")
        assertThat(board.strokes.first { it.id == "b" }.colorHex).isEqualTo("112233")
        assertThat(board.strokes.first { it.id == "a" }.colorHex).isEqualTo("FF0000")
        assertThat(board.strokes.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(board.strokes.first { it.id == "b" }.points).hasSize(2)
    }

    @Test
    fun `resizeSelected changes only the selected width`() {
        val board = boardOf("a", "b").select("a").resizeSelected(24.0)
        assertThat(board.strokes.first { it.id == "a" }.width).isEqualTo(24.0)
        assertThat(board.strokes.first { it.id == "b" }.width).isEqualTo(8.0)
    }

    @Test
    fun `smoothSelected changes only the selected smoothing`() {
        val board = boardOf("a", "b").select("b").smoothSelected(StrokeSmoothing.CURVE)
        assertThat(board.strokes.first { it.id == "b" }.smoothing).isEqualTo(StrokeSmoothing.CURVE)
        assertThat(board.strokes.first { it.id == "a" }.smoothing).isEqualTo(StrokeSmoothing.RAW)
    }

    @Test
    fun `per-stroke edits are inert when nothing is selected`() {
        val board = boardOf("a", "b")
        assertThat(board.recolorSelected("000000")).isEqualTo(board)
        assertThat(board.resizeSelected(99.0)).isEqualTo(board)
        assertThat(board.smoothSelected(StrokeSmoothing.LINE)).isEqualTo(board)
    }

    @Test
    fun `per-stroke edits leave the redo stack untouched — a property tweak is not a new stroke`() {
        val board = boardOf("a", "b").undo().select("a") // redo holds "b"
        val after = board.recolorSelected("445566")
        assertThat(after.canRedo).isTrue()
    }
}
