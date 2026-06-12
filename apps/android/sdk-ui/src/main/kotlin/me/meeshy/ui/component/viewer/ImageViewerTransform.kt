package me.meeshy.ui.component.viewer

/**
 * Pure zoom/pan math for the fullscreen image viewer — keeps the gesture
 * handling in [MeeshyImageViewer] declarative and testable.
 */
public object ImageViewerTransform {
    public const val MIN_SCALE: Float = 1f
    public const val MAX_SCALE: Float = 4f
    public const val DOUBLE_TAP_SCALE: Float = 2.5f

    public fun clampScale(scale: Float): Float = scale.coerceIn(MIN_SCALE, MAX_SCALE)

    /** Half the overflow of the scaled content — the symmetric pan limit. */
    public fun maxOffset(containerSize: Float, scale: Float): Float =
        ((containerSize * scale - containerSize) / 2f).coerceAtLeast(0f)

    public fun clampOffset(offset: Float, containerSize: Float, scale: Float): Float {
        val limit = maxOffset(containerSize, scale)
        return offset.coerceIn(-limit, limit)
    }

    /** Double-tap zooms to the preset from rest, and back to rest from anywhere else. */
    public fun doubleTapTarget(currentScale: Float): Float =
        if (currentScale > MIN_SCALE) MIN_SCALE else DOUBLE_TAP_SCALE
}
