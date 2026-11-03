package me.meeshy.app.feed

import me.meeshy.ui.component.chrome.CollapsibleHeaderMotion
import me.meeshy.ui.component.chrome.ScrollMotionVisibility

/**
 * L'état replié de l'en-tête « Meeshy Feed » (iOS `FeedView` + `CollapsibleHeader`), une projection pure de
 * la géométrie du défilement : le titre cède la place à la bande de stories compacte à mesure que [progress]
 * monte, et les actions Reels / À proximité se masquent pendant le défilement actif.
 */
internal data class FeedHeaderCollapseState(
    val progress: Float,
    val actionsVisible: Boolean,
) {
    /** Le titre n'est plus lisible une fois la bande compacte arrivée. */
    val isCollapsed: Boolean get() = progress >= COLLAPSED_AT

    companion object {
        const val COLLAPSED_AT: Float = 1f

        fun of(
            firstVisibleItemIndex: Int,
            firstVisibleItemScrollOffsetPx: Int,
            thresholdPx: Int,
            isScrollInProgress: Boolean,
            quietMillis: Long,
        ): FeedHeaderCollapseState = FeedHeaderCollapseState(
            progress = CollapsibleHeaderMotion.collapseProgress(
                firstVisibleItemIndex = firstVisibleItemIndex,
                firstVisibleItemScrollOffsetPx = firstVisibleItemScrollOffsetPx,
                thresholdPx = thresholdPx,
            ),
            actionsVisible = ScrollMotionVisibility.isVisible(isScrollInProgress, quietMillis),
        )
    }
}
