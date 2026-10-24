package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The reaction chips under a bubble: one pill per emoji with its count, highlighted when the
 * reader is among the reactors. Chips are only clickable when the host passes a callback.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ReactionStrip(
    reactions: List<ReactionEntry>,
    onReactionClick: ((String) -> Unit)?,
    onReactionLongPress: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        reactions.forEach { entry ->
            ReactionChip(
                entry = entry,
                onClick = onReactionClick?.let { { it(entry.emoji) } },
                onLongClick = onReactionLongPress,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReactionChip(entry: ReactionEntry, onClick: (() -> Unit)?, onLongClick: (() -> Unit)? = null) {
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
            .let { base ->
                if (onClick == null && onLongClick == null) {
                    base
                } else {
                    base.combinedClickable(
                        onClick = onClick ?: {},
                        onLongClick = onLongClick,
                    ).semantics { role = Role.Button }
                }
            }
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
            style = MaterialTheme.typography.labelSmall,
            color = if (entry.includesMe) MeeshyPalette.Indigo400 else MeeshyTheme.tokens.textPrimary,
            fontWeight = if (entry.includesMe) FontWeight.SemiBold else null,
        )
    }
}
