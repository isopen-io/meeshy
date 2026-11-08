package me.meeshy.app.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.res.stringResource
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.reading.focal.ScrollActivityEvent
import me.meeshy.sdk.model.reading.focal.ScrollTimePillLaw
import me.meeshy.ui.format.bubbleClockLabel

/** La pilule jour·heure ET la révélation des rangées plates : une loi, deux supports. */
@Stable
internal class ScrollTimePillDriver(
    val pill: ScrollTimePillState,
    val reveal: FocalTimestampRevealState,
)

private data class ScrollSample(val userScrolling: Boolean, val index: Int, val offset: Int)

/**
 * Alimente la loi partagée à chaque image d'un défilement du DOIGT (millisecondes), puis un `Tick`
 * à l'échéance des 900 ms. [readingLinePx] est le haut du fil sous l'en-tête flottant.
 */
@Composable
internal fun rememberScrollTimePillDriver(
    listState: LazyListState,
    renderedItems: List<ChatListItem>,
    chrome: ChatChromeState,
    readingLinePx: Float,
): ScrollTimePillDriver {
    val driver = remember { ScrollTimePillDriver(ScrollTimePillState(), FocalTimestampRevealState()) }
    val items by rememberUpdatedState(renderedItems)
    val today = stringResource(R.string.chat_date_today)
    val yesterday = stringResource(R.string.chat_date_yesterday)
    val dayBefore = stringResource(R.string.chat_date_day_before_yesterday)
    SideEffect { driver.pill.isHeaderExpanded = chrome.isHeaderExpanded }
    LaunchedEffect(listState, driver) {
        var lastScrolledMs = 0L
        snapshotFlow { ScrollSample(chrome.isUserScrolling, listState.firstVisibleItemIndex, listState.firstVisibleItemScrollOffset) }
            .collectLatest { sample ->
                if (sample.userScrolling) {
                    val now = System.currentTimeMillis()
                    lastScrolledMs = now
                    val label = hoveredLabel(listState, items, readingLinePx, today, yesterday, dayBefore)
                    driver.pill.note(ScrollActivityEvent.Scrolled(now.toDouble()), label)
                    driver.reveal.note(ScrollActivityEvent.Scrolled(now.toDouble()))
                }
                val remaining = ScrollTimePillLaw.LINGER_MS.toLong() - (System.currentTimeMillis() - lastScrolledMs)
                delay(remaining.coerceAtLeast(0L) + 1L)
                val tickAt = System.currentTimeMillis().toDouble()
                driver.pill.note(ScrollActivityEvent.Tick(tickAt))
                driver.reveal.note(ScrollActivityEvent.Tick(tickAt))
            }
    }
    return driver
}

/** Le libellé « jour · heure » du message survolé (rangées lues sous la ligne de lecture), ou null. */
private fun hoveredLabel(
    listState: LazyListState,
    items: List<ChatListItem>,
    readingLinePx: Float,
    today: String,
    yesterday: String,
    dayBefore: String,
): String? {
    val info = listState.layoutInfo
    val height = info.viewportSize.height.toFloat()
    val before = info.beforeContentPadding.toFloat()
    val visible = info.visibleItemsInfo.filter { it.index < items.size }
    val rows = visible.map { item ->
        val bottom = height - before - item.offset
        ScrollTimePillLabel.Row(isMessage = items[item.index] is ChatListItem.Message, minY = bottom - item.size, maxY = bottom)
    }
    val hovered = ScrollTimePillLabel.hoveredRow(rows, readingLinePx, height) ?: return null
    val bubble = (items[visible[hovered].index] as ChatListItem.Message).bubble
    val millis = isoToEpochMillisOrNull(bubble.createdAtIso) ?: return null
    val time = bubbleClockLabel(bubble.createdAtIso) ?: return null
    return ScrollTimePillLabel.of(millis, time, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), today, yesterday, dayBefore)
}
