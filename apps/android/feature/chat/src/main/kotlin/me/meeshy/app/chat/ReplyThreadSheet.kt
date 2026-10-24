package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun ReplyThreadSheet(
    overlay: ReplyThreadOverlayModel,
    accentColor: Color,
    onReplyTap: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_reply_thread_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        ReplyThreadRowContent(
            row = overlay.parent,
            accentColor = accentColor,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        HorizontalDivider(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
        )
        Text(
            text = pluralStringResource(
                R.plurals.chat_reply_count,
                overlay.replyCount,
                overlay.replyCount,
            ),
            style = MaterialTheme.typography.labelMedium,
            color = accentColor,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
            itemsIndexed(overlay.replies, key = { _, row -> row.messageId }) { index, row ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                        color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                    )
                }
                ReplyThreadRowContent(
                    row = row,
                    accentColor = accentColor,
                    leadingIcon = Icons.AutoMirrored.Filled.Reply,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onReplyTap(row.messageId) }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                )
            }
        }
    }
}

@Composable
private fun ReplyThreadRowContent(
    row: ReplyThreadRow,
    accentColor: Color,
    modifier: Modifier = Modifier,
    leadingIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    val sender = row.senderName
        ?: if (row.isOutgoing) stringResource(R.string.chat_pinned_you) else null
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (leadingIcon != null) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(16.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            if (sender != null) {
                Text(
                    text = sender,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = replyThreadRowLabel(row),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun replyThreadRowLabel(row: ReplyThreadRow): String = when {
    row.isDeleted -> stringResource(R.string.chat_reply_thread_deleted)
    row.snippet is PinnedSnippet.Text -> (row.snippet as PinnedSnippet.Text).value
    row.snippet == PinnedSnippet.Image -> stringResource(R.string.chat_unread_photo)
    row.snippet == PinnedSnippet.File -> stringResource(R.string.chat_unread_attachment)
    else -> stringResource(R.string.chat_unread_new_message)
}
