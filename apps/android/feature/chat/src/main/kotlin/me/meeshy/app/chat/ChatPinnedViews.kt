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
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PinnedBannerStrip(
    banner: PinnedBanner,
    accentColor: Color,
    onClick: () -> Unit,
    onOpenList: () -> Unit,
) {
    val sender = banner.senderName
        ?: if (banner.isOutgoing) stringResource(R.string.chat_pinned_you) else null
    Surface(
        onClick = onClick,
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(
                start = MeeshySpacing.md,
                end = MeeshySpacing.sm,
                top = MeeshySpacing.sm,
                bottom = MeeshySpacing.sm,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.PushPin,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(18.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (banner.count > 1) {
                        stringResource(R.string.chat_pinned_count, banner.count)
                    } else {
                        stringResource(R.string.chat_pinned_title)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = pinnedSnippetLabel(banner.snippet, sender),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (banner.count > 1) {
                IconButton(onClick = onOpenList) {
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = stringResource(R.string.chat_pinned_sheet_title),
                        tint = accentColor,
                    )
                }
            }
        }
    }
}

@Composable
internal fun PinnedMessagesSheet(
    pins: List<PinnedMessageRow>,
    accentColor: Color,
    onTap: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_pinned_sheet_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
            itemsIndexed(pins, key = { _, row -> row.messageId }) { index, row ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                        color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                    )
                }
                val sender = row.senderName
                    ?: if (row.isOutgoing) stringResource(R.string.chat_pinned_you) else null
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onTap(row.messageId) }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    Icon(
                        imageVector = Icons.Filled.PushPin,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp),
                    )
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
                            text = pinnedSnippetLabel(row.snippet, sender = null),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MeeshyTheme.tokens.textPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun pinnedSnippetLabel(snippet: PinnedSnippet, sender: String?): String {
    val body = when (snippet) {
        is PinnedSnippet.Text -> snippet.value
        PinnedSnippet.Image -> stringResource(R.string.chat_unread_photo)
        PinnedSnippet.File -> stringResource(R.string.chat_unread_attachment)
        PinnedSnippet.Empty -> stringResource(R.string.chat_pinned_message)
    }
    return if (sender != null) "$sender: $body" else body
}
