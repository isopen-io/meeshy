package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The mood-status composer — the Android port of iOS `StatusComposerView`. A
 * bottom sheet with an emoji mood grid, a visibility-pill row, a 122-char text
 * field with a live counter, and a publish action. Every decision (publish gate,
 * char cap, trimmed body, emoji toggle) lives in the pure [StatusComposerDraft];
 * this Composable holds one in `remember` and stays coverage-exempt glue.
 *
 * [onPublish] receives the values the ViewModel's `setStatus` expects — the picked
 * emoji, the trimmed body (`null` when blank), and the visibility wire string.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusComposerSheet(
    onPublish: (emoji: String, content: String?, visibility: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf(StatusComposerDraft()) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Header(
                canPublish = draft.canPublish,
                onClose = onDismiss,
                onPublish = {
                    val emoji = draft.selectedEmoji ?: return@Header
                    onPublish(emoji, draft.trimmedContent, draft.visibility.wire)
                },
            )

            Text(
                text = stringResource(R.string.status_composer_mood_question),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )

            EmojiGrid(
                selected = draft.selectedEmoji,
                onToggle = { emoji -> draft = draft.toggleEmoji(emoji) },
            )

            VisibilityRow(
                selected = draft.visibility,
                onSelect = { visibility -> draft = draft.withVisibility(visibility) },
            )

            TextInput(
                draft = draft,
                onTextChange = { value -> draft = draft.withText(value) },
            )
        }
    }
}

// MARK: - Header

@Composable
private fun Header(
    canPublish: Boolean,
    onClose: () -> Unit,
    onPublish: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onClose) {
            Text(
                text = stringResource(R.string.status_composer_close),
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = stringResource(R.string.status_composer_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        TextButton(onClick = onPublish, enabled = canPublish) {
            Text(
                text = stringResource(R.string.status_composer_publish),
                fontWeight = FontWeight.SemiBold,
                color = if (canPublish) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

// MARK: - Emoji grid

@Composable
private fun EmojiGrid(
    selected: String?,
    onToggle: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        StatusComposerDraft.MOOD_OPTIONS.chunked(EMOJI_COLUMNS).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                row.forEach { emoji ->
                    EmojiButton(
                        emoji = emoji,
                        selected = emoji == selected,
                        onClick = { onToggle(emoji) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(EMOJI_COLUMNS - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun EmojiButton(
    emoji: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Box(
        modifier = modifier
            .size(56.dp)
            .clip(shape)
            .background(if (selected) MeeshyPalette.Indigo500.copy(alpha = 0.15f) else MeeshyTheme.tokens.inputBackground)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBorder,
                shape = shape,
            )
            .clickable(onClick = onClick)
            .semantics { contentDescription = emoji },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, style = MaterialTheme.typography.headlineSmall)
    }
}

// MARK: - Visibility

@Composable
private fun VisibilityRow(
    selected: StatusVisibility,
    onSelect: (StatusVisibility) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        StatusVisibility.entries.forEach { visibility ->
            val active = visibility == selected
            Text(
                text = visibilityLabel(visibility),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = if (active) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBackground)
                    .clickable { onSelect(visibility) }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun visibilityLabel(visibility: StatusVisibility): String = stringResource(
    when (visibility) {
        StatusVisibility.PUBLIC -> R.string.status_composer_visibility_public
        StatusVisibility.COMMUNITY -> R.string.status_composer_visibility_community
        StatusVisibility.FRIENDS -> R.string.status_composer_visibility_friends
        StatusVisibility.PRIVATE -> R.string.status_composer_visibility_private
    },
)

// MARK: - Text input

@Composable
private fun TextInput(
    draft: StatusComposerDraft,
    onTextChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        OutlinedTextField(
            value = draft.text,
            onValueChange = onTextChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(R.string.status_composer_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        )
        if (draft.showCounter) {
            Text(
                text = stringResource(
                    R.string.status_composer_counter,
                    draft.text.length,
                    StatusComposerDraft.MAX_CHARS,
                ),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = if (draft.isNearLimit) MeeshyPalette.Error else MeeshyTheme.tokens.textMuted,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private const val EMOJI_COLUMNS = 5
