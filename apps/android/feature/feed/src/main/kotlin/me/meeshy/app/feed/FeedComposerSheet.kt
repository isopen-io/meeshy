package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The text-only feed-post composer — the "texte seul" first sub-slice of
 * feature-parity §F "Create post" (port of the text-input surface of iOS
 * `FeedView.composerOverlay`: `composerText` + `postVisibility`). A bottom
 * sheet with a visibility-pill row and a multi-line text field — the same
 * `ModalBottomSheet` shape [StatusComposerSheet] already established for a
 * feed composer on Android, reused rather than reinvented.
 *
 * **Deliberate, documented scope cut vs. iOS** (routine's own "texte seul
 * d'abord" framing): no photo/camera/file/location/audio attachments, no
 * emoji picker, no per-post language override — iOS's `composerOverlay` toolbar
 * of 6 glyphes. Each is a real, separately-scoped follow-up once this first
 * slice proves the create-post wiring end to end.
 *
 * Every decision (publish gate, trimmed body, visibility) lives in the pure
 * [FeedComposerDraft]; this Composable holds one in `remember` and stays
 * coverage-exempt glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedComposerSheet(
    onPublish: (FeedPostPublishRequest) -> Unit,
    onDismiss: () -> Unit,
    initialDraft: FeedComposerDraft = FeedComposerDraft(),
) {
    var draft by remember { mutableStateOf(initialDraft) }

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
                onPublish = { draft.publishRequest()?.let(onPublish) },
            )

            VisibilityRow(
                selected = draft.visibility,
                onSelect = { visibility -> draft = draft.withVisibility(visibility) },
            )

            OutlinedTextField(
                value = draft.text,
                onValueChange = { value -> draft = draft.withText(value) },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(stringResource(R.string.feed_composer_placeholder)) },
                minLines = 4,
            )
        }
    }
}

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
                text = stringResource(R.string.feed_composer_cancel),
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = stringResource(R.string.feed_composer_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        TextButton(onClick = onPublish, enabled = canPublish) {
            Text(
                text = stringResource(R.string.feed_composer_publish),
                fontWeight = FontWeight.SemiBold,
                color = if (canPublish) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@Composable
private fun VisibilityRow(
    selected: FeedPostVisibility,
    onSelect: (FeedPostVisibility) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        FeedPostVisibility.entries.forEach { visibility ->
            val active = visibility == selected
            Text(
                text = visibilityLabel(visibility),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = if (active) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary,
                modifier = Modifier
                    .background(
                        if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBackground,
                        RoundedCornerShape(MeeshyRadius.pill),
                    )
                    .border(
                        width = 1.dp,
                        color = if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBorder,
                        shape = RoundedCornerShape(MeeshyRadius.pill),
                    )
                    .clickable { onSelect(visibility) }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun visibilityLabel(visibility: FeedPostVisibility): String = stringResource(
    when (visibility) {
        FeedPostVisibility.PUBLIC -> R.string.feed_composer_visibility_public
        FeedPostVisibility.FRIENDS -> R.string.feed_composer_visibility_friends
        FeedPostVisibility.PRIVATE -> R.string.feed_composer_visibility_private
    },
)
