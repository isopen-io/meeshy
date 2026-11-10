package me.meeshy.sdk.model.call

import kotlin.math.min

/**
 * The side of the screen where the rail of a family sits. « My image » opens the march, « the call » closes it:
 * in right-to-left reading the rails turn round with the rest of the screen. Mirrors iOS `CallRailSide`.
 */
enum class CallRailSide { Leading, Trailing }

val CallActionFamily.railSide: CallRailSide
    get() = when (this) {
        CallActionFamily.MyImage -> CallRailSide.Leading
        else -> CallRailSide.Trailing
    }

/**
 * #17327 — where the actions that the « (…) » unfolds are put. Mirrors iOS `CallControlsDisposition`.
 * - [Rails]: on a duo, one vertical rail per family on the edges of the screen; the pill does not grow.
 * - [Rows]: on a group, two labelled rows INSIDE the pill. No rail is laid over the grid: it would hide tiles.
 *
 * The disposition is a function of the number of participants, never a state: going from two to three during a call
 * changes the shape, not the state of the « (…) » ([CallScreenLayer]).
 */
enum class CallControlsDisposition {
    Rails,
    Rows,
    ;

    /** The rails on screen: the ones the open « (…) » brings out. Record and React open INSIDE the pill: the rails give way. */
    fun railRows(set: CallActionSet, layer: CallScreenLayer): List<CallActionFamilyRow> =
        if (this == Rails && layer.showsFamilyRows) set.familyRows else emptyList()

    /** The labelled rows that the open « (…) » unfolds in the pill. */
    fun pillRows(set: CallActionSet, layer: CallScreenLayer): List<CallActionFamilyRow> =
        if (this == Rows && layer.showsFamilyRows) set.familyRows else emptyList()

    /** The pill grows for an option it holds, and on a group for its rows. On a duo the « (…) » alone does not. */
    fun unfoldsPill(layer: CallScreenLayer): Boolean =
        layer.pillPanel != null || (this == Rows && layer.showsFamilyRows)

    companion object {
        const val MAX_PARTICIPANTS_ON_RAILS: Int = 2

        /** [showsGroupGrid]: the group grid is on screen (#9085: it replaces the 1:1 screen as soon as the mesh holds a member). */
        fun resolve(participantCount: Int, showsGroupGrid: Boolean = false): CallControlsDisposition =
            if (showsGroupGrid || participantCount > MAX_PARTICIPANTS_ON_RAILS) Rows else Rails
    }
}

/**
 * #17327 — the geometry of the rails: 48 dp buttons in a glass capsule, [EDGE_INSET_DP] from the edge (safe area on top
 * of it), centered vertically. Mirrors iOS `CallRailsLayout` with Android's 48 dp target.
 */
object CallRailsLayout {
    const val BUTTON_SIDE_DP: Float = 48f
    const val BUTTON_SPACING_DP: Float = 8f
    const val PADDING_DP: Float = 8f
    const val EDGE_INSET_DP: Float = 8f
    const val PILL_MAX_WIDTH_DP: Float = 440f
    const val PILL_SIDE_PADDING_DP: Float = 20f
    const val PILL_HEIGHT_DP: Float = 68f
    const val PILL_GAP_DP: Float = 8f
    const val RAIL_WIDTH_DP: Float = BUTTON_SIDE_DP + 2 * PADDING_DP

    /**
     * What the rails leave free at the foot of the screen: nothing when the pill fits BETWEEN them (landscape, tablet) —
     * they center on the whole height —, the height of the pill when it takes their column (portrait).
     */
    fun bottomClearance(containerWidthDp: Float, safeHorizontalDp: Float): Float {
        val pillWidth = min(PILL_MAX_WIDTH_DP, containerWidthDp - 2 * PILL_SIDE_PADDING_DP)
        val between = containerWidthDp - 2 * (safeHorizontalDp + EDGE_INSET_DP + RAIL_WIDTH_DP)
        return if (between >= pillWidth) 0f else PILL_HEIGHT_DP + PILL_GAP_DP
    }

    /**
     * The translation of a rail OFF the screen: toward its own edge (« my image » opens the march, « the call » closes
     * it), turned round in right-to-left reading. Negative = toward the left.
     */
    fun slideOffset(side: CallRailSide, isRightToLeft: Boolean, safeHorizontalDp: Float): Float {
        val travel = RAIL_WIDTH_DP + EDGE_INSET_DP + safeHorizontalDp
        val towardsLeft = (side == CallRailSide.Leading) != isRightToLeft
        return if (towardsLeft) -travel else travel
    }
}
