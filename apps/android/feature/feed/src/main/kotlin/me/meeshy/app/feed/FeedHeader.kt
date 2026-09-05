package me.meeshy.app.feed

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderActionButton
import me.meeshy.ui.component.chrome.CollapsibleHeaderDefaults
import me.meeshy.ui.component.chrome.CollapsibleHeaderMotion
import me.meeshy.ui.component.chrome.ScrollMotionVisibility

/**
 * The Feed's collapsible top bar — a gradient "Meeshy Feed" title that shrinks as the
 * list scrolls, plus the Reels/Nearby actions ([feedHeaderActions]) which fade out
 * while actively scrolling. Owns the [listState] → [CollapsibleHeader] wiring so
 * [CollapsibleHeader] itself never needs to know about [LazyListState] — the same
 * pattern a future Chats header will replicate against its own list.
 */
@Composable
internal fun FeedHeader(
    listState: LazyListState,
    onOpenReels: () -> Unit,
    onOpenNearby: () -> Unit,
) {
    val density = LocalDensity.current
    val thresholdPx = remember(density) {
        with(density) { CollapsibleHeaderDefaults.CollapseThreshold.roundToPx() }
    }
    val progress = CollapsibleHeaderMotion.collapseProgress(
        firstVisibleItemIndex = listState.firstVisibleItemIndex,
        firstVisibleItemScrollOffsetPx = listState.firstVisibleItemScrollOffset,
        thresholdPx = thresholdPx,
    )
    var quietMillis by remember { mutableLongStateOf(ScrollMotionVisibility.STILLNESS_THRESHOLD_MS) }
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            quietMillis = 0L
        } else {
            val start = System.currentTimeMillis()
            while (isActive && quietMillis < ScrollMotionVisibility.STILLNESS_THRESHOLD_MS) {
                quietMillis = System.currentTimeMillis() - start
                delay(16)
            }
        }
    }
    val actionsVisible = ScrollMotionVisibility.isVisible(listState.isScrollInProgress, quietMillis)

    CollapsibleHeader(
        title = stringResource(R.string.feed_title),
        scrollProgress = progress,
        actionsVisible = actionsVisible,
    ) {
        feedHeaderActions().forEach { action ->
            when (action) {
                FeedHeaderAction.REELS -> CollapsibleHeaderActionButton(
                    icon = Icons.Filled.PlayCircle,
                    contentDescription = stringResource(R.string.feed_header_reels),
                    onClick = onOpenReels,
                    enabled = actionsVisible,
                )
                FeedHeaderAction.NEARBY -> CollapsibleHeaderActionButton(
                    icon = Icons.Filled.NearMe,
                    contentDescription = stringResource(R.string.feed_header_nearby),
                    onClick = onOpenNearby,
                    enabled = actionsVisible,
                )
            }
        }
    }
}
