package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.formattedCoordinates
import me.meeshy.ui.component.LanguagePickerDialog
import me.meeshy.ui.component.LanguagePickerOption
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The compact language-flag pill, shown under the header — port of iOS's
 * `ComposerLanguageFlag` button (collapsed state shows ONLY the flag; the language
 * name only appears inside the picker list, matching iOS's own 2026-07-30 directive).
 * Its accessible value carries the language's native name, via the already-tested
 * [LanguageStepSelection.selectedLanguageName], so a screen reader announces the
 * chosen language even though the glyph alone doesn't.
 */
@Composable
internal fun ComposerLanguagePill(
    code: String,
    onClick: () -> Unit,
) {
    val displayName = LanguageStepSelection.selectedLanguageName(code)
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, CircleShape)
            .clickable(onClickLabel = displayName, onClick = onClick)
            .semantics { contentDescription = displayName },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = ComposerLanguage.flag(code), style = MaterialTheme.typography.titleMedium)
    }
}

/**
 * The per-post language picker — a search-filtered list over [LanguageStepSelection.
 * pickerLanguages]/[LanguageStepSelection.filter], the same pure catalogue/filter core
 * the registration wizard's language step already uses (no re-implementation). Mirrors
 * the shape of `SettingsScreen`'s own `RegionalLanguageDialog` (a plain [AlertDialog],
 * not a nested [ModalBottomSheet] — two stacked modal sheets is an established anti-
 * pattern this codebase avoids) rather than porting iOS's dedicated full-screen
 * `AudioLanguagePickerView`.
 */
@Composable
internal fun ComposerLanguagePickerDialog(
    currentCode: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val languages = remember(query) { LanguageStepSelection.filter(query) }
    LanguagePickerDialog(
        titleText = stringResource(R.string.feed_composer_language_title),
        options = languages.map { info ->
            LanguagePickerOption(
                code = info.code,
                label = "${info.flag}  ${info.nativeName}",
                isSelected = info.code.equals(currentCode, ignoreCase = true),
            )
        },
        onSelect = { code -> code?.let(onSelect) },
        onDismiss = onDismiss,
        dismissButtonLabel = stringResource(R.string.feed_composer_cancel),
        searchQuery = query,
        onSearchQueryChange = { query = it },
        searchPlaceholder = stringResource(R.string.feed_composer_language_search),
    )
}

/**
 * The attached-location chip — shown between the text field and
 * [MediaAttachmentsRow] whenever [FeedComposerDraft.location] is non-null. Same
 * pill-with-close-affordance visual language as [ReelTypeToggle], displaying the
 * raw coordinates (this sub-slice attaches no name/address — see
 * [FeedComposerSheet]'s class doc comment) via the already-tested
 * [me.meeshy.sdk.model.formattedCoordinates].
 */
@Composable
internal fun LocationAttachmentChip(
    place: SharedPlace,
    onRemove: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.pill))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = MeeshyIcons.LocationFilled,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = place.formattedCoordinates(),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        IconButton(
            onClick = onRemove,
            modifier = Modifier.size(20.dp),
        ) {
            Icon(
                imageVector = MeeshyIcons.Close,
                contentDescription = stringResource(R.string.feed_composer_remove_location),
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

@Composable
internal fun FeedComposerHeader(
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
internal fun FeedVisibilityRow(
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
                text = feedVisibilityLabel(visibility),
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
internal fun feedVisibilityLabel(visibility: FeedPostVisibility): String = stringResource(
    when (visibility) {
        FeedPostVisibility.PUBLIC -> R.string.feed_composer_visibility_public
        FeedPostVisibility.FRIENDS -> R.string.feed_composer_visibility_friends
        FeedPostVisibility.PRIVATE -> R.string.feed_composer_visibility_private
    },
)

/**
 * The Réel⇄Post override chip — port of iOS `FeedView.composerOverlay`'s toggle
 * (`composerForcePlainPost.toggle()`, shown only when
 * `ReelComposition.qualifiesAsReel`). The caller only renders this Composable
 * when [FeedComposerDraft.qualifiesAsReel] is already true, mirroring iOS's own
 * `if ReelComposition.qualifiesAsReel(...)` gate around the identical button —
 * so this Composable itself stays a pure display of [forcePlainPost], with no
 * qualification logic of its own to duplicate/drift from [ReelComposition].
 */
@Composable
internal fun ReelTypeToggle(
    forcePlainPost: Boolean,
    onToggle: () -> Unit,
) {
    val hint = stringResource(R.string.feed_composer_type_hint)
    val tint = if (forcePlainPost) MeeshyTheme.tokens.textMuted else MeeshyPalette.Indigo300
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(onClickLabel = hint, onClick = onToggle)
            .padding(vertical = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = if (forcePlainPost) MeeshyIcons.Document else MeeshyIcons.PlayCircleFilled,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = stringResource(
                if (forcePlainPost) R.string.feed_composer_type_post else R.string.feed_composer_type_reel,
            ),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = tint,
        )
    }
}
