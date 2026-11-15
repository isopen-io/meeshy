package me.meeshy.app.chat

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.ui.component.message.MeeshyMentionSuggestions
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Autocomplete panel floating above the conversation composer while an `@mention` is in
 * progress — the shared [MeeshyMentionSuggestions] list (#14053), edge to edge above the bar,
 * tinted by the conversation accent. Tapping a row inserts the handle via [onSelect].
 */
@Composable
internal fun MentionSuggestionStrip(
    mention: MentionAutocompleteState,
    accentColor: Color,
    onSelect: (MentionCandidate) -> Unit,
) {
    MeeshyMentionSuggestions(
        mention = mention,
        onSelect = onSelect,
        accentColor = accentColor,
        shape = RectangleShape,
        avatarSize = 36.dp,
        rowPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    )
}
