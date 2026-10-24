package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * One generic file attachment: a paperclip, the file name (or a generic label) and its size.
 * A null [onClick] (no url yet, or no host callback) leaves the row non-interactive.
 */
@Composable
internal fun BubbleFileRow(
    file: BubbleFile,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val openLabel = stringResource(R.string.bubble_file_open)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = openLabel
                }
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = MeeshyIcons.AttachFile,
            contentDescription = null,
            tint = onColor.copy(alpha = 0.8f),
            modifier = Modifier.size(16.dp),
        )
        Column {
            Text(
                text = file.name ?: stringResource(R.string.bubble_attachment_file_fallback),
                style = MaterialTheme.typography.bodySmall,
                color = onColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val size = file.sizeBytes?.let { formatFileSize(it) }
            if (size != null) {
                Text(
                    text = size,
                    style = MaterialTheme.typography.labelSmall,
                    color = onColor.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@Composable
@ReadOnlyComposable
internal fun formatFileSize(bytes: Int): String = when {
    bytes >= 1_048_576 ->
        stringResource(R.string.bubble_file_size_mb, "%.1f".format(bytes / 1_048_576f))
    bytes >= 1_024 ->
        stringResource(R.string.bubble_file_size_kb, "%.0f".format(bytes / 1_024f))
    else -> stringResource(R.string.bubble_file_size_bytes, bytes.toString())
}
