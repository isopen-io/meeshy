package me.meeshy.ui.component.message

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The « @ » suggestion list above a composer (#14053), shared by every surface that writes a
 * mention — the universal composer's `topSlot` (comments, mood replies), the chat. It shows
 * what the [MentionAutocompleteState] serves, in its order (local contacts first, then the server's),
 * and a tap hands the person to [onSelect], which inserts the handle. Neutral input-assistance
 * chrome, like the keyboard's suggestion bar; rows are capped in height and scroll. Nothing is drawn
 * while no mention is in progress or nobody matches.
 */
@Composable
public fun MeeshyMentionSuggestions(
    mention: MentionAutocompleteState,
    onSelect: (MentionCandidate) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    shape: Shape = RoundedCornerShape(MeeshyRadius.md),
    avatarSize: Dp = 32.dp,
    rowPadding: PaddingValues = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
) {
    if (!mention.isActive || mention.suggestions.isEmpty()) return
    val title = stringResource(R.string.mention_suggestions_title)
    val action = stringResource(R.string.mention_suggestion_action)
    Surface(
        color = MeeshyTheme.tokens.backgroundSecondary,
        shape = shape,
        modifier = modifier
            .fillMaxWidth()
            .semantics { paneTitle = title },
    ) {
        LazyColumn(modifier = Modifier.heightIn(max = 200.dp)) {
            items(mention.suggestions, key = { it.id }) { candidate ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .clickable(onClickLabel = action, role = Role.Button) { onSelect(candidate) }
                        .padding(rowPadding),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    MeeshyAvatar(
                        name = candidate.displayName,
                        size = avatarSize,
                        containerColor = accentColor,
                        imageUrl = candidate.avatarURL,
                        presence = rememberPresence(candidate.id),
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
