package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun MessageBubble(
    content: BubbleContent,
    modifier: Modifier = Modifier,
    outgoingColor: Color = MeeshyPalette.Indigo500,
    onLongPress: (() -> Unit)? = null,
    onReactionClick: ((String) -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = if (content.isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        val onColor = if (content.isOutgoing) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary
        val bubbleBackground = if (content.isOutgoing) outgoingColor else MeeshyTheme.tokens.backgroundTertiary
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(RoundedCornerShape(MeeshyRadius.xl))
                .background(bubbleBackground)
                .let { base ->
                    if (onLongPress == null) base
                    else base.combinedClickable(onClick = {}, onLongClick = onLongPress)
                }
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        ) {
            if (content.showSenderName && content.senderName != null) {
                Text(
                    text = content.senderName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = onColor,
                )
            }

            if (content.replyToText != null || content.replyToDeleted) {
                ReplyPreview(
                    senderName = content.replyToSenderName,
                    previewText = content.replyToText ?: stringResource(R.string.bubble_message_deleted),
                    accentColor = onColor,
                    modifier = Modifier.padding(bottom = MeeshySpacing.xs),
                )
            }

            if (content.isDeleted) {
                Text(
                    text = stringResource(R.string.bubble_message_deleted),
                    style = MaterialTheme.typography.bodyMedium,
                    fontStyle = FontStyle.Italic,
                    color = onColor.copy(alpha = 0.6f),
                )
            } else {
                Text(
                    text = content.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = onColor,
                )
            }

            if (content.reactions.isNotEmpty()) {
                ReactionStrip(
                    reactions = content.reactions,
                    onReactionClick = onReactionClick,
                    modifier = Modifier.padding(top = MeeshySpacing.xs),
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MeeshySpacing.xs),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
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

                if (content.isOutgoing) {
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
private fun ReplyPreview(
    senderName: String?,
    previewText: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(accentColor.copy(alpha = 0.12f))
            .padding(vertical = MeeshySpacing.xs),
    ) {
        Box(
            modifier = Modifier
                .width(2.dp)
                .fillMaxHeight()
                .background(accentColor),
        )
        Column(
            modifier = Modifier.padding(
                start = MeeshySpacing.xs,
                end = MeeshySpacing.sm,
            ),
        ) {
            if (senderName != null) {
                Text(
                    text = senderName,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                )
            }
            Text(
                text = previewText,
                style = MaterialTheme.typography.bodySmall,
                color = accentColor.copy(alpha = 0.8f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReactionStrip(
    reactions: List<ReactionEntry>,
    onReactionClick: ((String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        reactions.forEach { entry ->
            ReactionChip(entry = entry, onClick = onReactionClick?.let { { it(entry.emoji) } })
        }
    }
}

@Composable
private fun ReactionChip(entry: ReactionEntry, onClick: (() -> Unit)?) {
    val background =
        if (entry.includesMe) MeeshyPalette.Indigo500.copy(alpha = 0.22f)
        else MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.6f)
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(background)
            .let { base ->
                if (entry.includesMe) {
                    base.border(1.dp, MeeshyPalette.Indigo400, RoundedCornerShape(MeeshyRadius.pill))
                } else {
                    base
                }
            }
            .let { base -> if (onClick == null) base else base.clickable(onClick = onClick) }
            .padding(horizontal = MeeshySpacing.xs, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = entry.emoji,
            fontSize = 12.sp,
        )
        Text(
            text = entry.count.toString(),
            fontSize = 12.sp,
            color = if (entry.includesMe) MeeshyPalette.Indigo400 else MeeshyTheme.tokens.textPrimary,
            fontWeight = if (entry.includesMe) FontWeight.SemiBold else null,
        )
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
