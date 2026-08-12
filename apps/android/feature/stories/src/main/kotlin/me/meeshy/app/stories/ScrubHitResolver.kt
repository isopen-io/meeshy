package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import kotlin.math.abs

/** What lifting the finger at the end of a scrub gesture resolves to. */
sealed interface ScrubRelease {
    /** Released over an emoji tile — send this reaction. */
    data class React(val emoji: String) : ScrubRelease

    /** Released over the trailing "+" tile — open the full picker. */
    data object Expand : ScrubRelease

    /** Released outside every tile — the bar stays open in "posed" mode. */
    data object KeepOpen : ScrubRelease
}

/**
 * Pure hit-testing for the scrubbable bars (reactions, languages) of the
 * story viewer. Tiles report their bounds in root coordinates; the finger
 * position is matched exactly first, then within a vertical tolerance band
 * so a small drift above/below the bar never loses the hover. As a last
 * resort, a position that falls in the horizontal gap between two tiles
 * (4dp gap in this bar) but still inside the bar's overall footprint and a
 * tile's vertical tolerance band resolves to the nearest tile by center X —
 * without this, a drag crossing a gap flickered hover -> nil -> hover
 * (double haptics, tile springing back) and a release in the gap swallowed
 * the selection. Points outside the bar's footprint still resolve to no hit.
 * Kept pure (pattern [StorySwipeResolver]) so the decision is fully testable.
 */
object ScrubHitResolver {

    fun hoveredIndex(
        tileBounds: Map<Int, Rect>,
        position: Offset,
        verticalTolerance: Float,
    ): Int? {
        if (tileBounds.isEmpty()) return null
        tileBounds.entries.firstOrNull { it.value.contains(position) }?.let { return it.key }
        tileBounds.entries
            .filter { (_, rect) ->
                position.x >= rect.left && position.x < rect.right &&
                    position.y >= rect.top - verticalTolerance &&
                    position.y < rect.bottom + verticalTolerance
            }
            .minByOrNull { (_, rect) -> abs(position.y - rect.center.y) }
            ?.key
            ?.let { return it }

        val footprintLeft = tileBounds.values.minOf { it.left }
        val footprintRight = tileBounds.values.maxOf { it.right }
        if (position.x < footprintLeft || position.x >= footprintRight) return null

        return tileBounds.entries
            .filter { (_, rect) ->
                position.y >= rect.top - verticalTolerance &&
                    position.y < rect.bottom + verticalTolerance
            }
            .minByOrNull { (_, rect) -> abs(position.x - rect.center.x) }
            ?.key
    }

    /** The trailing "+" tile carries index `emojis.size` (one past the last emoji). */
    fun release(hoveredIndex: Int?, emojis: List<String>): ScrubRelease = when {
        hoveredIndex == null -> ScrubRelease.KeepOpen
        hoveredIndex == emojis.size -> ScrubRelease.Expand
        hoveredIndex in emojis.indices -> ScrubRelease.React(emojis[hoveredIndex])
        else -> ScrubRelease.KeepOpen
    }
}
