package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The highest visible row index, or `0` when nothing has laid out yet.
 * Combined with `LazyListState.firstVisibleItemIndex` (the lowest visible
 * index), this is the raw Compose-native pair [ChatScrollGeometry.bottomEdgeIndex]
 * / [ChatScrollGeometry.topEdgeIndex] translate into the chat's semantic
 * bottom/old-end edges — which raw index means which edge flips with
 * `reverseLayout`, so callers never read this directly for that purpose.
 * Thin Compose glue over [LazyListState]'s layout info; the actual edge
 * arithmetic is the pure, tested [ChatScrollGeometry].
 */
internal fun LazyListState.lastVisibleItemIndex(): Int =
    layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0

/**
 * The scroll-to-bottom affordance: a badged FAB that surfaces when the reader has
 * scrolled away, with a live count and a compact preview of the newest unread message
 * (iOS `ConversationScrollControlsView`). Tapping either the pill or the button jumps
 * to the latest and clears the badge. Pure decisions (visibility, count, preview) live
 * in [ScrollAffordance]; this is only the render.
 */
@Composable
internal fun ScrollToBottomControl(
    affordance: ScrollAffordanceState,
    typingParticipants: List<TypingParticipant>,
    isOffline: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val content = ScrollControlContent.of(affordance, typingParticipants, isOffline)
    androidx.compose.animation.AnimatedVisibility(
        visible = content != ScrollControlContent.Hidden,
        modifier = modifier,
    ) {
        Column(horizontalAlignment = Alignment.End) {
            when (content) {
                is ScrollControlContent.Typing ->
                    TypingPill(label = content.label, accentColor = accentColor, onClick = onClick)
                is ScrollControlContent.Unread ->
                    content.preview?.let { preview ->
                        UnreadPreviewPill(preview = preview, accentColor = accentColor, onClick = onClick)
                    }
                is ScrollControlContent.Offline -> OfflinePill(onClick = onClick)
                else -> Unit
            }
            val badgeCount = (content as? ScrollControlContent.Unread)?.count ?: 0
            BadgedBox(
                badge = {
                    if (badgeCount > 0) {
                        Badge(containerColor = accentColor, contentColor = MeeshyPalette.White) {
                            Text(unreadBadgeLabel(badgeCount))
                        }
                    }
                },
            ) {
                SmallFloatingActionButton(
                    onClick = onClick,
                    containerColor = accentColor,
                    contentColor = MeeshyPalette.White,
                ) {
                    Icon(
                        imageVector = Icons.Filled.ArrowDownward,
                        contentDescription = stringResource(R.string.chat_scroll_to_bottom),
                    )
                }
            }
        }
    }
}
