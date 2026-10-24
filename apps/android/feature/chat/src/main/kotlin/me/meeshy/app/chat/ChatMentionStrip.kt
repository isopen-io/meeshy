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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Autocomplete panel floating above the composer while an `@mention` is in
 * progress. Neutral surface (input-assistance chrome, like the keyboard's suggestion
 * bar) — the accent tint stays reserved for message-content surfaces. Rows are
 * capped and scroll; tapping one inserts the handle via [onSelect].
 */
@Composable
internal fun MentionSuggestionStrip(
    mention: MentionAutocompleteState,
    accentColor: Color,
    onSelect: (me.meeshy.sdk.model.MentionCandidate) -> Unit,
) {
    if (!mention.isActive || mention.suggestions.isEmpty()) return
    Surface(
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier.fillMaxWidth(),
    ) {
        LazyColumn(modifier = Modifier.heightIn(max = 200.dp)) {
            items(mention.suggestions, key = { it.id }) { candidate ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(candidate) }
                        .semantics { role = Role.Button }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    MeeshyAvatar(
                        name = candidate.displayName,
                        size = 36.dp,
                        containerColor = accentColor,
                        imageUrl = candidate.avatarURL,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = candidate.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "@${candidate.username}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
