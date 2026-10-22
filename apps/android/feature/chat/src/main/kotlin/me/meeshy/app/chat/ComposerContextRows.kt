package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** « En réponse à … » row above the composer field. Pure projection of its parameters. */
@Composable
internal fun ComposerReplyRow(label: String, accentColor: Color, onCancel: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Reply,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = stringResource(R.string.chat_replying_to, label),
            style = MaterialTheme.typography.labelMedium,
            color = accentColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(start = MeeshySpacing.xs),
        )
        IconButton(onClick = onCancel) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.chat_cancel_reply),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** « Modification » row shown while an own message is being edited. */
@Composable
internal fun ComposerEditRow(accentColor: Color, onCancel: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Edit,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = stringResource(R.string.chat_editing_label),
            style = MaterialTheme.typography.labelMedium,
            color = accentColor,
            modifier = Modifier
                .weight(1f)
                .padding(start = MeeshySpacing.xs),
        )
        IconButton(onClick = onCancel) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.chat_cancel_edit),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/**
 * Preview chip for a large paste captured into a clipboard-content attachment —
 * the thin, coverage-exempt Compose glue over the pure [ClipboardContent] (parité
 * iOS `clipboardContentPreview`: doc glyph, title, truncated body, char count, and
 * an accent-tinted remove button).
 */
@Composable
internal fun ClipboardContentPreview(
    clip: ClipboardContent,
    accentColor: Color,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Description,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(20.dp),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.chat_clipboard_title),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = clip.truncatedPreview,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(R.string.chat_clipboard_char_count, clip.charCount),
                style = MaterialTheme.typography.labelSmall,
                color = accentColor,
            )
        }
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.chat_clipboard_remove),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

