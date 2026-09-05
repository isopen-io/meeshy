package me.meeshy.app.conversations

/** The list's first-visible-item position — enough to derive scroll direction. */
data class ConversationScrollPosition(val index: Int, val offset: Int)

/**
 * The bottom search pill hides while the list scrolls down (making way for
 * content) and returns on scroll-up or at rest — guarded so an active search
 * query keeps it on screen regardless of which way the list moves, so a search
 * in progress never loses its input field.
 */
object ConversationSearchBarVisibility {

    /**
     * The scroll direction between [previous] and [current], or `null` when the
     * delta is smaller than [thresholdPx] in both directions — the caller then
     * keeps whatever direction it already had rather than flip on noise (a slow
     * drag advancing sub-pixel per frame, or two samples of an unmoved list
     * taken across unrelated recompositions). The caller is expected to only
     * feed this a [current] sampled when the list's own scroll position
     * actually changed (e.g. via `snapshotFlow`), never on every recomposition —
     * otherwise an unrelated state update (presence, typing, a draft) would
     * compare the same position to itself and momentarily report "not
     * scrolling down", flashing the bar back on screen mid-gesture.
     */
    fun scrollDirectionDown(
        previous: ConversationScrollPosition,
        current: ConversationScrollPosition,
        thresholdPx: Int,
    ): Boolean? {
        val deltaPx = if (current.index == previous.index) {
            current.offset - previous.offset
        } else {
            (current.index - previous.index) * thresholdPx
        }
        return when {
            deltaPx >= thresholdPx -> true
            deltaPx <= -thresholdPx -> false
            else -> null
        }
    }

    fun isVisible(isSearchActive: Boolean, isScrollingDown: Boolean): Boolean =
        isSearchActive || !isScrollingDown
}
