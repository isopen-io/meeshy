package me.meeshy.sdk.model.call

enum class CallVerticalEdge { Top, Bottom }

/**
 * G1.11 · G2.8 — the first touch STOWS the chrome toward its edges and the second brings it back by the opposite way
 * (law 17): nothing appears or vanishes at once. Only the transform and the opacity move; « Reduce animations » replaces
 * the movement by a short fade, with no displacement. Mirrors iOS `CallChromeStow`.
 */
object CallChromeStow {
    const val REDUCED_FADE_MILLIS: Int = 150

    fun leavesByItsEdge(isVisible: Boolean, reduceMotion: Boolean): Boolean = !isVisible && !reduceMotion

    fun fadeMillis(reduceMotion: Boolean): Int =
        if (reduceMotion) REDUCED_FADE_MILLIS else CallChromeVisibility.FADE_DURATION_MILLIS.toInt()

    /**
     * The translation of a stowed element toward ITS edge: its whole MEASURED height plus its margin to that edge, so an
     * unfolded pill (rows, journal) leaves the screen as entirely as the bare one. A height not measured yet counts for
     * nothing.
     */
    fun travel(toward: CallVerticalEdge, extent: Float, margin: Float): Float {
        val distance = (if (extent.isFinite()) extent.coerceAtLeast(0f) else 0f) + margin
        return if (toward == CallVerticalEdge.Top) -distance else distance
    }
}
