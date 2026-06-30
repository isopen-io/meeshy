package me.meeshy.app.stories

/** Which side of the edited element the floating style toolbar ends up on. */
enum class ToolbarSide { ABOVE, BELOW }

/**
 * Where to place the floating style toolbar: its top edge in canvas pixels plus the
 * side it landed on relative to the element. The Composable offsets the toolbar by
 * [topPx] within the canvas.
 */
data class ToolbarPlacement(val topPx: Float, val side: ToolbarSide)

/**
 * Pure placement math for the floating text-style toolbar shown while an on-canvas
 * text element is being edited (parity with iOS's in-place style bubble, surpassing
 * its fixed bottom bar). The toolbar should sit just clear of the element and stay
 * fully inside the canvas.
 *
 * The canvas itself is the keyboard-aware region: when the soft keyboard opens the
 * composer shifts via `imePadding`, so the measured [canvasHeightPx] already excludes
 * the keyboard. The resolver therefore only has to keep the toolbar inside that band —
 * BELOW the element when the toolbar fits beneath it, otherwise ABOVE, clamped so it
 * is never pushed off the top or past the bottom. Total + deterministic — no Compose,
 * no I/O — so the placement decision lives in one unit-tested place.
 */
object StoryToolbarPlacement {
    fun resolve(
        elementCenterYpx: Float,
        elementHalfHeightPx: Float,
        toolbarHeightPx: Float,
        canvasHeightPx: Float,
        gapPx: Float = 0f,
    ): ToolbarPlacement {
        val belowTop = elementCenterYpx + elementHalfHeightPx + gapPx
        if (belowTop + toolbarHeightPx <= canvasHeightPx) {
            return ToolbarPlacement(topPx = belowTop, side = ToolbarSide.BELOW)
        }
        val aboveTop = elementCenterYpx - elementHalfHeightPx - gapPx - toolbarHeightPx
        val clampMax = (canvasHeightPx - toolbarHeightPx).coerceAtLeast(0f)
        return ToolbarPlacement(topPx = aboveTop.coerceIn(0f, clampMax), side = ToolbarSide.ABOVE)
    }
}
