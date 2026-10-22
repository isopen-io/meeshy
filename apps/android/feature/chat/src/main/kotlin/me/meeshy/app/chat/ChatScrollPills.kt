package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun UnreadPreviewPill(
    preview: UnreadPreview,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(MeeshyRadius.pill),
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier
            .padding(bottom = MeeshySpacing.sm)
            .widthIn(max = 220.dp),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            unreadPreviewIcon(preview.kind)?.let { icon ->
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(16.dp),
                )
            }
            Column {
                preview.senderName?.let { name ->
                    Text(
                        text = name,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = accentColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = unreadPreviewLabel(preview),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TypingPill(label: TypingLabel, accentColor: Color, onClick: () -> Unit) {
    val text = typingLabelText(label) ?: return
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(MeeshyRadius.pill),
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier
            .padding(bottom = MeeshySpacing.sm)
            .widthIn(max = 220.dp),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.Filled.Edit,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = accentColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * Port of iOS `ConversationScrollControlsView`'s `isOffline` branch — a neutral (not
 * accent-tinted) pill, since the offline state signals connectivity, not conversation
 * identity. Mirrors [TypingPill]'s structure.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OfflinePill(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(MeeshyRadius.pill),
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier
            .padding(bottom = MeeshySpacing.sm)
            .widthIn(max = 220.dp),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.Filled.WifiOff,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = stringResource(R.string.chat_offline),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun unreadPreviewIcon(kind: UnreadPreviewKind): ImageVector? = when (kind) {
    UnreadPreviewKind.Image -> Icons.Filled.Image
    UnreadPreviewKind.File -> Icons.Filled.AttachFile
    UnreadPreviewKind.Text -> null
}

@Composable
private fun unreadPreviewLabel(preview: UnreadPreview): String = when {
    preview.text.isNotBlank() -> preview.text
    preview.kind == UnreadPreviewKind.Image -> stringResource(R.string.chat_unread_photo)
    preview.kind == UnreadPreviewKind.File -> stringResource(R.string.chat_unread_attachment)
    else -> stringResource(R.string.chat_unread_new_message)
}

internal fun unreadBadgeLabel(count: Int): String = if (count > 99) "99+" else count.toString()
