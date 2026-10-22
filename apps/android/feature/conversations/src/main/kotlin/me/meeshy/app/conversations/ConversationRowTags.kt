package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Conversation-row tag chips with a width-based "+N" overflow badge — parity iOS
 * `ThemedConversationRow.tagsRow`. The fit decision is the pure [ConversationTagRow];
 * this Composable only supplies the real available width (via [BoxWithConstraints],
 * an improvement over iOS's hardcoded 200pt estimate) and paints the chips. Each
 * chip's colour is the deterministic [DynamicColorGenerator.colorForName] so the same
 * tag name reads the same colour everywhere.
 */
@Composable
internal fun ConversationTagsRow(tags: List<String>) {
    if (tags.isEmpty()) return
    BoxWithConstraints {
        val fit = ConversationTagRow.fit(tags, maxWidth.value.toDouble())
        Row(
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            fit.visible.forEach { tag -> ConversationTagChip(tag) }
            if (fit.remaining > 0) {
                Text(
                    text = stringResource(R.string.conversations_row_tags_overflow, fit.remaining),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.10f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun ConversationTagChip(tag: String) {
    val color = hexColor(DynamicColorGenerator.colorForName(tag))
    Text(
        text = tag,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    )
}
