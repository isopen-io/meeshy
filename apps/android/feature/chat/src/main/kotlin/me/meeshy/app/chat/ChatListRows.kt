package me.meeshy.app.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Renders one [ChatListItem] of the chat list: a day separator, the unread boundary, the
 * end-to-end-encryption notice or a message row. The `when` is exhaustive over the sealed
 * type, so a new kind of row cannot be added without being drawn here.
 */
@Composable
internal fun ChatListRow(
    item: ChatListItem,
    accentColor: Color,
    mentionDisplayNames: Map<String, String>?,
    highlightTerm: String?,
    replyThreads: ReplyThreads,
    linkPreviewStore: LinkPreviewStore,
    linkPreviewCache: LinkPreviewCache,
    actions: ChatMessageRowActions,
    audioPlayer: ChatAudioPlayer? = null,
    isGroup: Boolean = true,
    canWrite: Boolean = true,
) {
    when (item) {
        is ChatListItem.DayHeader -> DaySeparator(item.dayMillis)
        is ChatListItem.UnreadSeparator -> UnreadSeparatorRow(accentColor)
        is ChatListItem.EncryptionNotice -> EncryptionNoticeRow(accentColor)
        is ChatListItem.Message -> ChatMessageRow(
            bubble = item.bubble.inConversation(isGroup),
            accentColor = accentColor,
            mentionDisplayNames = mentionDisplayNames,
            highlightTerm = highlightTerm,
            replyCount = replyThreads.threadFor(item.bubble.messageId)?.count,
            linkPreviewStore = linkPreviewStore,
            linkPreviewCache = linkPreviewCache,
            actions = actions,
            audioPlayer = audioPlayer,
            canWrite = canWrite,
        )
    }
}

/**
 * The sender name above a series only identifies someone in a GROUP: in a one-to-one
 * conversation the peer is the conversation itself, so iOS never repeats it
 * (`showIdentityBar = !isDirect && …`). Returns the same instance when nothing changes, so
 * the bubble's equality — and the row's skipping — is preserved.
 */
internal fun BubbleContent.inConversation(isGroup: Boolean): BubbleContent =
    if (isGroup || !showSenderName) this else copy(showSenderName = false)

/** The « loading older history » spinner drawn above the oldest loaded message. */
@Composable
internal fun ChatLoadingOlderIndicator(accentColor: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            strokeWidth = 2.dp,
            color = accentColor,
        )
    }
}

/** The « tap to retry » line under an outgoing message whose send failed. */
@Composable
internal fun FailedSendRetryLine(onClick: () -> Unit) {
    Text(
        text = stringResource(R.string.chat_send_failed_retry),
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyPalette.Error,
        textAlign = TextAlign.End,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(
                horizontal = MeeshySpacing.lg,
                vertical = MeeshySpacing.xs,
            ),
    )
}

/**
 * The reply-count pill under a message that has quoted replies (parity with iOS's
 * reply-count affordance). Accent-tinted, aligned to the message's own side, and
 * tappable — tapping jumps to the earliest reply in the thread (no dead end). The
 * "which messages have a thread / how many / which reply anchors it" decision is the
 * pure [ReplyThreads] SSOT; this is only the render.
 */
@Composable
@OptIn(ExperimentalFoundationApi::class)
internal fun ReplyCountPill(
    count: Int,
    isOutgoing: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val openThreadLabel = stringResource(R.string.chat_reply_thread_open)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        contentAlignment = if (isOutgoing) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = onLongClick,
                    onLongClickLabel = openThreadLabel,
                )
                .background(accentColor.copy(alpha = 0.12f))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Reply,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = pluralStringResource(R.plurals.chat_reply_count, count, count),
                style = MaterialTheme.typography.labelMedium,
                color = accentColor,
            )
        }
    }
}
