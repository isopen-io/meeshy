package me.meeshy.ui.component.viewer

/**
 * Pure neighbour-window math for the fullscreen image viewer's prefetch — decides
 * which sibling pages to warm around the one on screen so a swipe lands on an
 * already-decoded image. Port of the iOS gallery's ±2 look-ahead prefetch, kept
 * agnostic of *what* is being prefetched (it returns bare page indices; the
 * [MeeshyImageViewer] glue maps them to Coil requests).
 *
 * The window is nearest-first and forward-biased — a viewer swipes forward more
 * often, so the next page is warmed before the previous one at each radius step —
 * and never rolls past either end: an out-of-range neighbour is dropped, not
 * wrapped. The current page is never included (it is already on screen), and a
 * gallery with fewer than two pages, or a non-positive radius, yields nothing.
 */
public object ImageViewerPrefetch {

    /** iOS-parity look-ahead: two pages either side of the current one. */
    public const val DEFAULT_RADIUS: Int = 2

    public fun neighbors(
        currentIndex: Int,
        total: Int,
        radius: Int = DEFAULT_RADIUS,
    ): List<Int> {
        if (total <= 1 || radius <= 0) return emptyList()
        val current = currentIndex.coerceIn(0, total - 1)
        val last = total - 1
        return (1..radius).flatMap { step ->
            listOfNotNull(
                (current + step).takeIf { it <= last },
                (current - step).takeIf { it >= 0 },
            )
        }
    }
}
