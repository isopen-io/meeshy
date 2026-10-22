package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min

/** Vertical margins of the trailing rail inside the free zone. */
data class ComposerRailBand(val top: Float, val bottom: Float)

/** A rectangle in a shared coordinate space; [isNull] mirrors CGRect.isNull. */
data class ComposerRect(val minY: Float, val maxY: Float, val isNull: Boolean = false) {
    val height: Float get() = maxY - minY
}

/** Rail geometry in dp — port of iOS `ComposerRailGeometry` (44 dp hit target floor). */
object ComposerRailGeometry {
    const val RAIL_WIDTH = 44f
    const val OUTER_MARGIN = 10f
    const val GUTTER = 8f
    const val FLOATING_ENTRY_SPACING = 2f
    const val FLOATING_COLUMN_PADDING = 8f
    const val LEGACY_INSET = 14f
    const val FLOATING_INSET = OUTER_MARGIN
    const val ROOMY_MARGIN = 24f
    const val ROOMY_PANEL_WIDTH = 320f
    const val ENTRY_SPACING = 10f
    const val NARROWEST_SUPPORTED_SCREEN_WIDTH = 360f

    const val FLOATING_BOTTOM_INSET = GUTTER + RAIL_WIDTH
    const val LANE = OUTER_MARGIN + RAIL_WIDTH + GUTTER
    const val ROOMY_PANEL_TRAILING = ROOMY_MARGIN + RAIL_WIDTH + GUTTER

    fun historyReserve(undo: Boolean, redo: Boolean): Float =
        listOf(undo, redo).count { it } * (RAIL_WIDTH + FLOATING_ENTRY_SPACING)

    fun edgeMargin(roomy: Boolean): Float = if (roomy) ROOMY_MARGIN else OUTER_MARGIN

    fun descriptionInset(roomy: Boolean, cardLeading: Float): Float =
        if (!roomy || !cardLeading.isFinite()) LANE else max(LANE, cardLeading)

    fun sceneInset(railsShown: Boolean): Float = if (railsShown) FLOATING_INSET else LEGACY_INSET

    /** Never negative: a width under both insets would otherwise feed a nonsense size to the fit. */
    fun sceneWidth(usableWidth: Float, railsShown: Boolean): Float =
        max(0f, usableWidth - 2 * sceneInset(railsShown))

    fun rowWidth(entries: Int, spacing: Float = ENTRY_SPACING): Float =
        if (entries <= 0) 0f else entries * RAIL_WIDTH + (entries - 1) * spacing

    fun rowOverflow(entries: Int, available: Float): Float = max(0f, rowWidth(entries) - available)

    fun availableRowWidth(screenWidth: Float): Float = max(0f, screenWidth - 2 * OUTER_MARGIN)

    fun columnHeight(entries: Int, withSpring: Boolean = false): Float =
        if (entries <= 0) 0f
        else entries * RAIL_WIDTH + (entries - 1 + if (withSpring) 2 else 0) * FLOATING_ENTRY_SPACING

    fun trailingRailBand(freeZone: ComposerRect, card: ComposerRect, columnHeight: Float): ComposerRailBand {
        val rest = ComposerRailBand(top = GUTTER, bottom = FLOATING_BOTTOM_INSET)
        if (freeZone.isNull || card.isNull || freeZone.height <= 0f || card.height <= 0f) return rest
        val top = max(rest.top, card.minY - freeZone.minY)
        if (freeZone.height - top - rest.bottom < RAIL_WIDTH) return rest
        val floor = min(rest.bottom, max(GUTTER, freeZone.maxY - card.maxY))
        val required = freeZone.height - top - columnHeight
        return ComposerRailBand(top, min(rest.bottom, max(floor, required)))
    }
}
