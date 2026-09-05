package me.meeshy.ui.component.chrome

/**
 * Generic scroll-quieting visibility rule — not specific to [CollapsibleHeader]: any
 * host that wants to hide chrome while the user is actively scrolling and reveal it
 * again once the list has settled can reuse this. Hidden the entire time scrolling is
 * in progress, then visible again once the list has been still for
 * [STILLNESS_THRESHOLD_MS]. The caller applies the [FADE_DURATION_MS] cross-fade
 * itself (e.g. via `animateFloatAsState`) — this object only decides the boolean.
 */
object ScrollMotionVisibility {
    const val STILLNESS_THRESHOLD_MS = 160L
    const val FADE_DURATION_MS = 220

    /**
     * [quietMillis] is the time elapsed since the list last stopped scrolling, as
     * measured by the host (`0` for as long as it is still scrolling).
     */
    fun isVisible(isScrolling: Boolean, quietMillis: Long): Boolean =
        !isScrolling && quietMillis >= STILLNESS_THRESHOLD_MS
}
