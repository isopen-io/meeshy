package me.meeshy.sdk.model.call

import kotlin.math.abs

/** The size of a glass, in pixels, as the layout measured it. */
data class CallGlassSize(val width: Float, val height: Float)

/** Where something sits inside the glass, in pixels, from the glass's bottom centre (the edge it grows from). */
data class CallGlassPoint(val x: Float, val y: Float)

/**
 * One frame of a morphing glass: the glass drawn at [scaleX] × [scaleY] of its laid-out size, anchored on its bottom
 * centre, at [alpha]; and under « Reduce animations » the shape it leaves, at its old size, fading out ([ghostAlpha]).
 */
data class CallGlassMorphFrame(
    val scaleX: Float,
    val scaleY: Float,
    val alpha: Float,
    val ghostScaleX: Float,
    val ghostScaleY: Float,
    val ghostAlpha: Float,
) {
    /** The size the glass shows at this frame, for a glass laid out at [laidOut]: where an interrupted morph restarts. */
    fun seen(laidOut: CallGlassSize): CallGlassSize = CallGlassSize(laidOut.width * scaleX, laidOut.height * scaleY)

    companion object {
        val Rest: CallGlassMorphFrame = CallGlassMorphFrame(1f, 1f, 1f, 1f, 1f, 0f)
    }
}

/**
 * Loi 17.2 — the morph of a glass whose layout already took its new size: it starts from its old size seen as a scale
 * of the new one ([fromScaleX], [fromScaleY]) and joins it. Under « Reduce animations » ([crossFades], loi 17.10) it
 * never scales: the old shape fades out while the new one fades in.
 */
data class CallGlassMorph(val fromScaleX: Float, val fromScaleY: Float, val crossFades: Boolean) {
    fun frame(progress: Float): CallGlassMorphFrame {
        val p = progress.coerceIn(0f, 1f)
        if (p >= 1f) return CallGlassMorphFrame.Rest
        if (crossFades) return CallGlassMorphFrame(1f, 1f, p, fromScaleX, fromScaleY, 1f - p)
        val x = fromScaleX + (1f - fromScaleX) * p
        val y = fromScaleY + (1f - fromScaleY) * p
        return CallGlassMorphFrame(x, y, 1f, x, y, 0f)
    }
}

/**
 * How the pill's glass unfolds and tightens (laws 11 and 17). The layout takes its final shape at once — width
 * (440 → 560 dp, L3.3) and height alike —, and the glass travels from what it was by a transformation only (loi 17.2,
 * web `morphKeyframes`, same vectors); what the layout moved inside it glides back the same way ([followShift]).
 * « Reduce animations » replaces both by a short fade (loi 17.10): no scale, no slide.
 */
object CallPillMotion {
    const val UNFOLD_MILLIS: Int = 250
    const val REDUCED_MILLIS: Int = 200

    /** Under this gap, a difference is a rounding of the measure, not a movement (web `EPSILON_PX`). */
    const val MORPH_EPSILON_PX: Float = 0.5f

    fun millis(reduceMotion: Boolean): Int = if (reduceMotion) REDUCED_MILLIS else UNFOLD_MILLIS

    fun scalesOnUnfold(reduceMotion: Boolean): Boolean = !reduceMotion

    fun morph(from: CallGlassSize, to: CallGlassSize, reduceMotion: Boolean): CallGlassMorph? {
        if (from.width <= 0f || from.height <= 0f || to.width <= 0f || to.height <= 0f) return null
        if (abs(from.width - to.width) < MORPH_EPSILON_PX && abs(from.height - to.height) < MORPH_EPSILON_PX) return null
        return CallGlassMorph(from.width / to.width, from.height / to.height, crossFades = reduceMotion)
    }

    /** What sat at [from] and the layout put at [to] is drawn shifted by the gap, then joins its place. */
    fun followShift(from: CallGlassPoint, to: CallGlassPoint, reduceMotion: Boolean): CallGlassPoint? {
        if (reduceMotion) return null
        if (abs(from.x - to.x) < MORPH_EPSILON_PX && abs(from.y - to.y) < MORPH_EPSILON_PX) return null
        return CallGlassPoint(from.x - to.x, from.y - to.y)
    }
}
