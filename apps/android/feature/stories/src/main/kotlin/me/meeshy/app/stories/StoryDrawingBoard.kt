package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StrokeSmoothing

/**
 * The pure, immutable freehand-drawing state of one slide — the committed [strokes],
 * the [redoStack] of undone strokes, and the currently [selectedStrokeId] for
 * per-stroke editing. Ports the iOS `StoryComposerViewModel+DrawingEditing` reducer
 * (undo / redo / clear / delete / select / recolour / resize / smooth) so the Compose
 * capture surface and the composer ViewModel stay glue: every decision lives here and
 * is unit-tested in one place.
 *
 * Invariant carried by every operation: `redoStack` is only ever populated by [undo];
 * any fresh user action ([commit], [delete]) invalidates it, exactly as iOS treats a
 * new stroke or a manual mutation as making "redo" caduc. A pure property tweak
 * ([recolorSelected] / [resizeSelected] / [smoothSelected]) is NOT a new stroke, so it
 * leaves the redo stack intact.
 */
data class StoryDrawingBoard(
    val strokes: List<StoryDrawingStroke> = emptyList(),
    val redoStack: List<StoryDrawingStroke> = emptyList(),
    val selectedStrokeId: String? = null,
) {
    /** `true` while at least one stroke can be undone. */
    val canUndo: Boolean get() = strokes.isNotEmpty()

    /** `true` while at least one undone stroke can be re-applied. */
    val canRedo: Boolean get() = redoStack.isNotEmpty()

    /** `true` while no stroke has been committed. */
    val isEmpty: Boolean get() = strokes.isEmpty()

    /**
     * Commits a freshly drawn stroke: appends it and invalidates the redo stack (a new
     * stroke makes "redo" caduc). Use instead of a raw append from the capture layer.
     */
    fun commit(stroke: StoryDrawingStroke): StoryDrawingBoard =
        copy(strokes = strokes + stroke, redoStack = emptyList())

    /**
     * Undoes the last stroke — moves it onto the redo stack. Lifts the selection if the
     * undone stroke was the selected one. No-op (returns `this`) when there is nothing
     * to undo.
     */
    fun undo(): StoryDrawingBoard {
        val removed = strokes.lastOrNull() ?: return this
        return copy(
            strokes = strokes.dropLast(1),
            redoStack = redoStack + removed,
            selectedStrokeId = selectedStrokeId.takeUnless { it == removed.id },
        )
    }

    /**
     * Re-applies the most recently undone stroke (LIFO). No-op when the redo stack is
     * empty. Selection is untouched — redo never re-selects.
     */
    fun redo(): StoryDrawingBoard {
        val restored = redoStack.lastOrNull() ?: return this
        return copy(strokes = strokes + restored, redoStack = redoStack.dropLast(1))
    }

    /** Clears every stroke and the redo stack, and lifts any selection. */
    fun clear(): StoryDrawingBoard =
        StoryDrawingBoard()

    /**
     * Removes a stroke by id and invalidates the redo stack (a manual deletion is a new
     * action). Lifts the selection if the deleted stroke was selected. A genuine no-op
     * when the id is absent — the board is returned unchanged, so deleting a
     * non-existent stroke never silently discards the redo history (a deliberate
     * improvement over iOS, which clears redo unconditionally).
     */
    fun delete(id: String): StoryDrawingBoard {
        if (strokes.none { it.id == id }) return this
        return copy(
            strokes = strokes.filterNot { it.id == id },
            redoStack = emptyList(),
            selectedStrokeId = selectedStrokeId.takeUnless { it == id },
        )
    }

    /**
     * Selects a stroke for per-stroke editing, or deselects when [id] is `null`. Inert
     * (keeps the current selection) when [id] names no existing stroke, matching iOS.
     */
    fun select(id: String?): StoryDrawingBoard {
        if (id != null && strokes.none { it.id == id }) return this
        return copy(selectedStrokeId = id)
    }

    /** Repaints the selected stroke. No-op when nothing is selected. */
    fun recolorSelected(colorHex: String): StoryDrawingBoard =
        mutateSelected { it.copy(colorHex = colorHex) }

    /** Resizes the selected stroke's width. No-op when nothing is selected. */
    fun resizeSelected(width: Double): StoryDrawingBoard =
        mutateSelected { it.copy(width = width) }

    /** Changes the selected stroke's smoothing. No-op when nothing is selected. */
    fun smoothSelected(smoothing: StrokeSmoothing): StoryDrawingBoard =
        mutateSelected { it.copy(smoothing = smoothing) }

    private fun mutateSelected(
        transform: (StoryDrawingStroke) -> StoryDrawingStroke,
    ): StoryDrawingBoard {
        val id = selectedStrokeId ?: return this
        if (strokes.none { it.id == id }) return this
        return copy(strokes = strokes.map { if (it.id == id) transform(it) else it })
    }

    /**
     * Resyncs this board to [strokes] — called after every deck-wide mutation on the
     * composer's selected slide. When [strokes] already equals this board's [strokes]
     * the mutation was driven **through this board** (commit / undo / redo / clear /
     * delete / a per-stroke edit), so it is returned untouched — its [redoStack] and
     * [selectedStrokeId] survive. Otherwise the slide's strokes changed **out from
     * under the board** (a slide switch, or a slide added/removed/duplicated) — a
     * fresh board seeded with [strokes] and an empty redo stack, since a redo history
     * that no longer describes what is on screen would restore the wrong thing.
     */
    fun resyncedTo(strokes: List<StoryDrawingStroke>): StoryDrawingBoard =
        if (this.strokes == strokes) this else StoryDrawingBoard(strokes = strokes)
}
