package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.link.LinkMetadata
import me.meeshy.sdk.link.LinkPreviewParser
import me.meeshy.sdk.link.LinkPreviewState
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Renders a message's link preview below its bubble — the thin, coverage-exempt Compose glue
 * over the pure [LinkPreviewState] machine (`:sdk-core`). Every decision (is there a link, which
 * URL, which arm) lives in the state machine; this composable only paints one exhaustive arm and
 * forwards the tap.
 *
 * Today the wiring resolves to [LinkPreviewState.BareLink] (the graceful "raw link" fallback iOS
 * shows when OpenGraph is absent) so a link message immediately gains an accent, tappable chip.
 * The [LinkPreviewState.Loading] / [LinkPreviewState.Card] arms are the rich-OpenGraph path a
 * follow-up slice lights up by swapping the fetch outcome — the view is already their renderer.
 */
@Composable
internal fun LinkPreviewCard(
    state: LinkPreviewState,
    isOutgoing: Boolean,
    accentColor: Color,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (state is LinkPreviewState.None) return

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        contentAlignment = if (isOutgoing) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        when (state) {
            is LinkPreviewState.None -> Unit
            is LinkPreviewState.Loading -> LinkChip(
                accentColor = accentColor,
                host = LinkPreviewParser.hostOf(state.url) ?: state.url,
                subtitle = state.url,
                dim = true,
                onClick = { onOpenUrl(state.url) },
            )
            is LinkPreviewState.BareLink -> LinkChip(
                accentColor = accentColor,
                host = LinkPreviewParser.hostOf(state.url) ?: state.url,
                subtitle = state.url,
                dim = false,
                onClick = { onOpenUrl(state.url) },
            )
            is LinkPreviewState.Card -> RichLinkCard(
                metadata = state.metadata,
                accentColor = accentColor,
                onClick = { onOpenUrl(state.metadata.id) },
            )
        }
    }
}

@Composable
private fun LinkChip(
    accentColor: Color,
    host: String,
    subtitle: String,
    dim: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val alpha = if (dim) 0.5f else 1f
    val openLabel = stringResource(R.string.chat_link_open)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .widthIn(max = 280.dp)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(accentColor.copy(alpha = 0.10f * alpha))
            .clickable(onClickLabel = openLabel, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = Icons.Filled.Link,
            contentDescription = null,
            tint = accentColor.copy(alpha = alpha),
            modifier = Modifier.size(16.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = host,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = accentColor.copy(alpha = alpha),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun RichLinkCard(
    metadata: LinkMetadata,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val openLabel = stringResource(R.string.chat_link_open)
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .widthIn(max = 280.dp)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(accentColor.copy(alpha = 0.10f))
            .clickable(onClickLabel = openLabel, onClick = onClick)
            .padding(MeeshySpacing.md),
    ) {
        (metadata.siteName ?: metadata.host)?.let { site ->
            Text(
                text = site.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = accentColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        metadata.title?.let { title ->
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        metadata.description?.let { description ->
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
