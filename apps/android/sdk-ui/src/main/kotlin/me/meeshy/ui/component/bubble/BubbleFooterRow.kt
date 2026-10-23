package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The meta row at the foot of a bubble: on the leading side the ephemeral countdown,
 * the starred bookmark, the translated glyph and the "edited" mark; on the trailing side
 * the clock (`HH:mm`, every bubble — iOS `BubbleFooter.metaTrailing`) followed by the
 * delivery check of an outgoing message.
 */
@Composable
internal fun BubbleFooterRow(content: BubbleContent, onColor: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xs),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            if (!content.isDeleted) {
                EphemeralCountdownBadge(expiresAtIso = content.expiresAtIso)
            }
            if (content.isStarred && !content.isDeleted) {
                Icon(
                    imageVector = Icons.Filled.Bookmark,
                    contentDescription = stringResource(R.string.bubble_starred),
                    tint = onColor.copy(alpha = 0.7f),
                    modifier = Modifier
                        .size(14.dp)
                        .padding(end = MeeshySpacing.xs),
                )
            }
            if (content.isTranslated) {
                Icon(
                    imageVector = Icons.Filled.Translate,
                    contentDescription = stringResource(R.string.bubble_translated),
                    tint = onColor.copy(alpha = 0.7f),
                    modifier = Modifier.size(14.dp),
                )
            }
            if (content.isEdited) {
                Text(
                    text = stringResource(R.string.bubble_edited),
                    style = MaterialTheme.typography.labelSmall,
                    color = onColor.copy(alpha = 0.7f),
                    modifier = Modifier.padding(start = MeeshySpacing.xs),
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            val clock = remember(content.createdAtIso) { bubbleClockLabel(content.createdAtIso) }
            if (clock != null) {
                Text(
                    text = clock,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Medium,
                    color = onColor.copy(alpha = 0.7f),
                )
            }
            if (content.isOutgoing) {
                // The online in-flight clock is debounced: a send that
                // round-trips under 200ms never flashes it (parity iOS
                // `SendingClockGlyph`). The offline hourglass and every
                // settled tier render immediately.
                if (content.deliveryStatus == DeliveryStatus.Pending) {
                    if (rememberSendingGlyphRevealed(content.createdAtIso)) {
                        DeliveryStatusIcon(
                            status = content.deliveryStatus,
                            onColor = onColor,
                        )
                    }
                } else {
                    DeliveryStatusIcon(
                        status = content.deliveryStatus,
                        onColor = onColor,
                    )
                }
            }
        }
    }
}

@Composable
private fun DeliveryStatusIcon(
    status: DeliveryStatus,
    onColor: Color,
) {
    when (status) {
        DeliveryStatus.Pending -> Icon(
            imageVector = Icons.Filled.Schedule,
            contentDescription = stringResource(R.string.bubble_status_pending),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.QueuedOffline -> Icon(
            imageVector = Icons.Filled.HourglassEmpty,
            contentDescription = stringResource(R.string.bubble_status_queued),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Sent -> Icon(
            imageVector = Icons.Filled.Done,
            contentDescription = stringResource(R.string.bubble_status_sent),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Delivered -> Icon(
            imageVector = Icons.Filled.DoneAll,
            contentDescription = stringResource(R.string.bubble_status_delivered),
            tint = onColor.copy(alpha = 0.5f),
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Read -> Icon(
            imageVector = Icons.Filled.DoneAll,
            contentDescription = stringResource(R.string.bubble_status_read),
            tint = MeeshyTheme.tokens.info,
            modifier = Modifier.size(16.dp),
        )
        DeliveryStatus.Failed -> Icon(
            imageVector = Icons.Filled.ErrorOutline,
            contentDescription = stringResource(R.string.bubble_status_failed),
            tint = MeeshyPalette.Error,
            modifier = Modifier.size(16.dp),
        )
    }
}
