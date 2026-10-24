package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * "Seen and deleted" tombstone for a consumed view-once message — Android render of the
 * iOS `BubbleBurnedView`. A flame glyph plus a muted italic label sit in a warning-tinted
 * capsule, aligned to the sender's side (like the deleted tombstone) rather than centered.
 */
@Composable
internal fun BubbleBurnedView(isOutgoing: Boolean, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.bubble_burned)
    val a11y = stringResource(R.string.bubble_burned_a11y)
    val capsule = RoundedCornerShape(MeeshyRadius.pill)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = if (isOutgoing) Arrangement.End else Arrangement.Start,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier
                .clip(capsule)
                .background(MeeshyPalette.Warning.copy(alpha = 0.08f))
                .border(0.5.dp, MeeshyPalette.Warning.copy(alpha = 0.15f), capsule)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                .semantics(mergeDescendants = true) { contentDescription = a11y },
        ) {
            Icon(
                imageVector = Icons.Filled.LocalFireDepartment,
                contentDescription = null,
                tint = MeeshyPalette.Warning,
                modifier = Modifier.size(12.dp),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                fontStyle = FontStyle.Italic,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/**
 * Centered conversation notice rendered in place of a chat bubble — Android render of the
 * iOS `BubbleSystemNoticeView`. A muted label sits in a subtle capsule, CENTERED (no avatar,
 * no sender name, aligned to neither side): a system message is a milestone of the thread,
 * not a turn at talk. No leading glyph — the producer is unknown by construction. The label
 * carries the gateway's localized notice text via [BubbleContent.text] (already resolved
 * under the Prisme). A blank notice renders nothing rather than an empty pill.
 */
@Composable
internal fun BubbleSystemNoticeView(text: String, modifier: Modifier = Modifier) {
    if (text.isBlank()) return
    val capsule = RoundedCornerShape(MeeshyRadius.pill)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .clip(capsule)
                .background(MeeshyTheme.tokens.backgroundTertiary)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                .semantics(mergeDescendants = true) { contentDescription = text },
        )
    }
}
