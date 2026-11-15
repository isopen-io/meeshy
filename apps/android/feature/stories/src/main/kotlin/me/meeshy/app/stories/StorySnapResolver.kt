package me.meeshy.app.stories

import kotlin.math.abs

/**
 * The outcome of snapping a dragged element's normalised centre to the composer's
 * alignment guides plus a safe-zone check. [x]/[y] is the (possibly snapped) centre,
 * always clamped into the canvas `0f..1f`. A non-null [verticalGuide]/[horizontalGuide]
 * is the x/y position of the guide line the centre locked onto — it drives the
 * on-canvas guide overlay — and is `null` when that axis is dragging free.
 * [withinSafeZone] is `false` once the centre drifts into the edge margin, so the
 * canvas can warn the author their content may be clipped off-screen.
 *
 * The two axes snap **independently**: a centre can lock onto the vertical centre line
 * while its `y` slides freely, exactly like iOS's per-axis snapping.
 */
data class SnapResult(
    val x: Float,
    val y: Float,
    val verticalGuide: Float?,
    val horizontalGuide: Float?,
    val withinSafeZone: Boolean,
) {
    /** True while the centre is locked onto at least one guide line. */
    val isSnapped: Boolean get() = verticalGuide != null || horizontalGuide != null
}

/**
 * Pure, Compose-agnostic snapping math for the story composer canvas — the single
 * source of truth for "where does a dragged element settle, which guide lines light
 * up, and is it inside the safe zone". The canvas Composable converts drag pixels to
 * a normalised candidate centre and renders the returned guides/warning; all the real
 * rules (nearest-guide selection, the magnetic threshold, the edge margin) live here
 * so they are unit-tested in one place and the Composable stays glue. No Android, no
 * I/O, no mutation.
 *
 * Objects snap to the iOS magnetic targets `0.18 / 0.25 / 0.5 / 0.75 / 0.82` at `0.02`;
 * the background framing snaps to `0 / 0.5 / 1` at the wider `0.035` ([resolveBackground]),
 * all normalised positions in `0f..1f`. The old rule-of-thirds guides are gone.
 */
object StorySnapResolver {

    /** The iOS object snap targets (`StoryCanvasUIView.snapTargets`), shared by both axes. */
    val OBJECT_TARGETS: List<Float> = listOf(0.18f, 0.25f, 0.5f, 0.75f, 0.82f)

    /** Vertical guide lines (candidate `x` positions). */
    val VERTICAL_GUIDES: List<Float> = OBJECT_TARGETS

    /** Horizontal guide lines (candidate `y` positions). */
    val HORIZONTAL_GUIDES: List<Float> = OBJECT_TARGETS

    /** Background framing targets (`backgroundSnapTargets`): centred, or glued to an edge. */
    val BACKGROUND_TARGETS: List<Float> = listOf(0f, 0.5f, 1f)

    /** Background framing tolerance (`backgroundSnapTolerance`): wider, the bg pan is slowed. */
    const val BACKGROUND_SNAP_THRESHOLD: Float = 0.035f

    /**
     * Magnetic radius: a centre within this normalised distance of a guide snaps to it.
     * Small enough that deliberate placement away from a guide is never hijacked.
     */
    const val SNAP_THRESHOLD: Float = 0.02f

    /**
     * Edge margin: a centre nearer than this to any canvas edge is out of the safe
     * zone (content risks being clipped on a rounded/notched display).
     */
    const val SAFE_ZONE_INSET: Float = 0.06f

    /**
     * Resolves the dragged candidate centre ([x]/[y], typically `element + dragDelta`)
     * into its snapped position, the active guide lines, and the safe-zone verdict.
     * Each axis snaps to the nearest in-range guide within [threshold]; outside the
     * threshold (or with no guides) the axis stays at its clamped candidate value. A
     * non-finite candidate collapses to the canvas centre rather than poisoning the
     * element.
     */
    fun resolve(
        x: Float,
        y: Float,
        verticalGuides: List<Float> = VERTICAL_GUIDES,
        horizontalGuides: List<Float> = HORIZONTAL_GUIDES,
        threshold: Float = SNAP_THRESHOLD,
        safeZoneInset: Float = SAFE_ZONE_INSET,
    ): SnapResult {
        val (sx, vGuide) = snapAxis(x, verticalGuides, threshold)
        val (sy, hGuide) = snapAxis(y, horizontalGuides, threshold)
        return SnapResult(
            x = sx,
            y = sy,
            verticalGuide = vGuide,
            horizontalGuide = hGuide,
            withinSafeZone = withinSafeZone(sx, sy, safeZoneInset),
        )
    }

    /** Snaps a background framing offset (`x`/`y`) to the centre or an edge, per axis, within the wider tolerance. */
    fun resolveBackground(x: Float, y: Float): SnapResult = resolve(
        x = x,
        y = y,
        verticalGuides = BACKGROUND_TARGETS,
        horizontalGuides = BACKGROUND_TARGETS,
        threshold = BACKGROUND_SNAP_THRESHOLD,
        safeZoneInset = 0f,
    )

    private fun snapAxis(raw: Float, guides: List<Float>, threshold: Float): Pair<Float, Float?> {
        val clamped = clampCoord(raw)
        if (threshold <= 0f) return clamped to null
        val nearest = guides
            .filter { it in 0f..1f }
            .minByOrNull { abs(it - clamped) }
            ?: return clamped to null
        return if (abs(nearest - clamped) <= threshold) nearest to nearest else clamped to null
    }

    private fun withinSafeZone(x: Float, y: Float, inset: Float): Boolean {
        val lo = inset
        val hi = 1f - inset
        return x in lo..hi && y in lo..hi
    }

    private fun clampCoord(value: Float): Float =
        if (value.isFinite()) value.coerceIn(0f, 1f) else StoryTextElement.CENTER
}
