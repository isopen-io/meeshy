package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The message list engine: the bottom-anchored `LazyColumn` (`reverseLayout = true`, fed the
 * newest-first [renderedItems]) with the floating day pill and the scroll-to-bottom control
 * laid over it. Rows are supplied by [itemContent]; items are keyed by [ChatListItem.key], so
 * scroll position and animations survive inserts exactly as before the split.
 */
@Composable
internal fun ChatMessageList(
    listState: LazyListState,
    renderedItems: List<ChatListItem>,
    accentColor: Color,
    isLoadingOlder: Boolean,
    pinnedDayMillis: Long?,
    scrollAffordance: ScrollAffordanceState,
    typingParticipants: List<TypingParticipant>,
    isOffline: Boolean,
    onScrollToBottom: () -> Unit,
    modifier: Modifier = Modifier,
    /** La hauteur de l'en-tête flottant posé au-dessus du fil : les bulles passent dessous. */
    topInset: Dp = 0.dp,
    /** La réserve basse sous laquelle flotte la barre de composition : les bulles passent dessous. */
    bottomInset: Dp = 0.dp,
    itemContent: @Composable (ChatListItem) -> Unit,
) {
    Box(modifier = modifier) {
        LazyColumn(
            state = listState,
            reverseLayout = true,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = MeeshySpacing.sm + topInset, bottom = MeeshySpacing.sm + bottomInset),
        ) {
            // Under `reverseLayout`, the HIGHEST Compose item index renders
            // at the visual TOP — so the "loading older history" spinner
            // goes AFTER `items(renderedItems)` (not before, as it did
            // pre-flip) to land above the oldest currently-loaded message.
            items(renderedItems, key = { it.key }) { item ->
                itemContent(item)
            }
            if (isLoadingOlder) {
                item(key = "loading-older") {
                    ChatLoadingOlderIndicator(accentColor)
                }
            }
        }
        pinnedDayMillis?.let { millis ->
            PinnedDayHeaderPill(
                dayMillis = millis,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = MeeshySpacing.sm + topInset),
            )
        }
        ScrollToBottomControl(
            affordance = scrollAffordance,
            typingParticipants = typingParticipants,
            isOffline = isOffline,
            accentColor = accentColor,
            onClick = onScrollToBottom,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(start = MeeshySpacing.lg, top = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = MeeshySpacing.lg + bottomInset),
        )
    }
}
