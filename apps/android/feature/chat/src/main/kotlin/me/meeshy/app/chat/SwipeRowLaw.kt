package me.meeshy.app.chat

import kotlin.math.abs
import kotlin.math.min

/**
 * The horizontal direction that REPLIES on a row (iOS `BubbleSwipeResistance.replyDirection`).
 * Bubbles keep the historic convention: the side that points back at the sender — a received
 * bubble replies on a rightward drag, my own on a leftward one — and FORWARD lives on the
 * opposite side. [sign] turns a translation into a *directed* distance where a positive value
 * means « toward reply » and a negative one « toward forward ».
 */
enum class ReplyDirection(val sign: Float) {
    FromIncoming(1f),
    FromOwn(-1f),
}

/** What a released swipe does. */
enum class SwipeRowAction { Reply, Forward }

/**
 * How firmly a drag must be horizontal before the row moves (iOS `SwipeResistance`). A bubble
 * carrying a scrubbable audio or video is [Resistant] so the swipe never fights the seek bar.
 */
enum class SwipeResistance(val minimumDistance: Float, val dominanceRatio: Float) {
    Normal(minimumDistance = 22f, dominanceRatio = 3f),
    Resistant(minimumDistance = 48f, dominanceRatio = 4f),
}

/**
 * The sides the message's law offers to the swipe (iOS `MessageRowOffer`, #12626): a refused side
 * still follows the finger far enough to read the timestamp, never to the threshold.
 */
data class SwipeRowSides(val canReply: Boolean, val canForward: Boolean) {
    /** No side offered: the gesture is not mounted at all. */
    val armsAnySide: Boolean get() = canReply || canForward
}

/**
 * Live state of a swipe on one row: the signed reading-direction [offset] (dp) to render, and
 * [isArmed] while the offset sits past the commit threshold (the haptic edge).
 */
data class SwipeRowState(
    val offset: Float = 0f,
    val isArmed: Boolean = false,
)

/** One drag step: the next [state] and [armedHaptic], true only on the crossing INTO the threshold. */
data class SwipeRowDrag(
    val state: SwipeRowState,
    val armedHaptic: Boolean,
)

/** The edge of the row where the stamp / action glyph is revealed (layout-direction aware). */
enum class SwipeIndicatorEdge { Start, End }

/**
 * Pure SSOT of the two-way row swipe, a port of iOS `BubbleSwipeContainer` +
 * `BubbleSwipeResistance` + `MessageRowOffer` (all distances in dp, iOS points):
 *
 * - engagement: a drag moves the row only once it is clearly horizontal — `|dx| > ratio·|dy|`
 *   and `|dx| > minimumDistance` (22 dp / 3:1, or 48 dp / 4:1 for a resistant bubble);
 * - track: 1:1 up to [ACTION_ZONE], then rubber-banded by [RUBBER_BAND_FACTOR], symmetric;
 * - a side the law refuses is capped at [STAMP_REACH] (threshold − 1): stamp only, no glyph,
 *   no haptic, no commit;
 * - a light haptic once per crossing of [COMMIT_DISTANCE]; on release the directed offset picks
 *   Reply (toward reply) or Forward (the other way), if that side is offered.
 */
object SwipeRowLaw {
    const val ACTION_ZONE = 72f
    const val RUBBER_BAND_FACTOR = 0.15f
    const val COMMIT_DISTANCE = 66f
    const val STAMP_REACH = COMMIT_DISTANCE - 1f

    /** The indicator stays hidden until the row has moved this far… */
    const val INDICATOR_APPEAR = 8f

    /** …and reaches full opacity at this distance. */
    const val INDICATOR_FULL_OPACITY = 24f

    /** True when the drag `(dx, dy)` is a frank horizontal swipe for [resistance]. */
    fun shouldEngage(dx: Float, dy: Float, resistance: SwipeResistance): Boolean {
        val absH = abs(dx)
        if (absH <= abs(dy) * resistance.dominanceRatio) return false
        return absH > resistance.minimumDistance
    }

    /** The track: identical inside the action zone, rubber-banded past it. Symmetric in sign. */
    fun trackedOffset(translation: Float): Float {
        val absH = abs(translation)
        if (absH <= ACTION_ZONE) return translation
        val sign = if (translation > 0f) 1f else -1f
        return sign * (ACTION_ZONE + (absH - ACTION_ZONE) * RUBBER_BAND_FACTOR)
    }

    /** The offset the row takes for a raw [translation]: a refused side stops under the threshold. */
    fun offset(translation: Float, direction: ReplyDirection, sides: SwipeRowSides): Float {
        val tracked = trackedOffset(translation)
        val directed = tracked * direction.sign
        val offered = if (directed > 0f) sides.canReply else sides.canForward
        if (offered || abs(tracked) <= STAMP_REACH) return tracked
        return if (tracked < 0f) -STAMP_REACH else STAMP_REACH
    }

    /** True once the (absolute) offset has reached the commit distance. */
    fun crossesThreshold(offset: Float): Boolean = abs(offset) >= COMMIT_DISTANCE

    /** Reduce one cumulative [translation] into the next state; the haptic fires once per crossing. */
    fun onDrag(
        previous: SwipeRowState,
        translation: Float,
        direction: ReplyDirection,
        sides: SwipeRowSides,
    ): SwipeRowDrag {
        val offset = offset(translation, direction, sides)
        val armed = crossesThreshold(offset)
        return SwipeRowDrag(
            state = SwipeRowState(offset = offset, isArmed = armed),
            armedHaptic = armed && !previous.isArmed,
        )
    }

    /** The action a release at [offset] commits, or null (short of the threshold, or side refused). */
    fun committed(offset: Float, direction: ReplyDirection, sides: SwipeRowSides): SwipeRowAction? {
        val directed = offset * direction.sign
        if (sides.canReply && directed >= COMMIT_DISTANCE) return SwipeRowAction.Reply
        if (sides.canForward && -directed >= COMMIT_DISTANCE) return SwipeRowAction.Forward
        return null
    }

    /** Which action the current [offset] points to (the glyph shown past the threshold), or null at rest. */
    fun sideOf(offset: Float, direction: ReplyDirection): SwipeRowAction? = when {
        offset * direction.sign > 0f -> SwipeRowAction.Reply
        offset * direction.sign < 0f -> SwipeRowAction.Forward
        else -> null
    }

    /**
     * The edge the row FREES while it slides: a drag toward the end reveals the start edge, and
     * the other way round — so the forward glyph of a received bubble is never hidden under it.
     */
    fun indicatorEdge(offset: Float): SwipeIndicatorEdge =
        if (offset < 0f) SwipeIndicatorEdge.End else SwipeIndicatorEdge.Start

    /** Opacity of the stamp / glyph: hidden under [INDICATOR_APPEAR], full at [INDICATOR_FULL_OPACITY]. */
    fun indicatorAlpha(offset: Float): Float {
        val absOffset = abs(offset)
        if (absOffset <= INDICATOR_APPEAR) return 0f
        return min(1f, absOffset / INDICATOR_FULL_OPACITY)
    }

    /** True when the stamp gives way to the action glyph: past the threshold on an offered side. */
    fun showsActionGlyph(offset: Float, direction: ReplyDirection, sides: SwipeRowSides): Boolean {
        if (!crossesThreshold(offset)) return false
        return when (sideOf(offset, direction)) {
            SwipeRowAction.Reply -> sides.canReply
            SwipeRowAction.Forward -> sides.canForward
            null -> false
        }
    }
}

/** The reply direction for a bubble, from whether it is the reader's own message. */
internal fun replyDirection(isOutgoing: Boolean): ReplyDirection =
    if (isOutgoing) ReplyDirection.FromOwn else ReplyDirection.FromIncoming

/** True when the current layout reads right-to-left (Arabic): swipe deltas are then mirrored. */
@androidx.compose.runtime.Composable
internal fun rememberIsRtl(): Boolean =
    androidx.compose.ui.platform.LocalLayoutDirection.current == androidx.compose.ui.unit.LayoutDirection.Rtl

/** A raw on-screen horizontal [value] expressed in reading direction (identity in LTR); an involution. */
internal fun swipeReadingDelta(value: Float, isRtl: Boolean): Float =
    me.meeshy.sdk.model.accessibility.ReadingDirection.readingDelta(value, isRtl)
