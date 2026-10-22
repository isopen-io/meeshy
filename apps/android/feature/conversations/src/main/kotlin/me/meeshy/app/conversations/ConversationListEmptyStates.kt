package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun SkeletonList() {
    Column(modifier = Modifier.fillMaxSize()) {
        repeat(8) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MeeshySkeletonBox(modifier = Modifier.size(48.dp), shape = CircleShape)
                MeeshySkeletonBox(
                    modifier = Modifier
                        .padding(start = MeeshySpacing.md)
                        .size(width = 160.dp, height = 14.dp),
                )
            }
        }
    }
}

/**
 * The iconified empty-state card (parity §B): glyph in a tinted disc + title +
 * subtitle + optional retry CTA, laid on a [MeeshyGlassSurface]. The copy/icon
 * choice is the pure [EmptyStateVisual]; this glue only renders it. The error
 * glyph tints red, the others accent-indigo, keeping the palette coherent.
 */
@Composable
internal fun EmptyStateCard(visual: EmptyStateVisual, onRetry: () -> Unit) {
    val accent = if (visual.glyph == EmptyStateGlyph.Error) MeeshyPalette.Error else MeeshyPalette.Indigo500
    Box(
        modifier = Modifier.fillMaxSize().padding(MeeshySpacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg)) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(accent.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = visual.glyph.icon(),
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(28.dp),
                    )
                }
                Text(
                    text = stringResource(visual.title.resId()),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = MeeshySpacing.lg),
                )
                visual.subtitle?.let { subtitle ->
                    Text(
                        text = when (subtitle) {
                            is EmptyStateSubtitle.Resource -> stringResource(subtitle.copy.resId())
                            is EmptyStateSubtitle.Literal -> subtitle.text
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = MeeshySpacing.sm),
                    )
                }
                visual.cta?.let { cta ->
                    Button(onClick = onRetry, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
                        Text(stringResource(cta.resId()))
                    }
                }
            }
        }
    }
}

private fun EmptyStateGlyph.icon() = when (this) {
    EmptyStateGlyph.Error -> Icons.Filled.CloudOff
    EmptyStateGlyph.NoResults -> Icons.Filled.SearchOff
    EmptyStateGlyph.NoConversations -> Icons.AutoMirrored.Filled.Chat
}

private fun EmptyStateCopy.resId(): Int = when (this) {
    EmptyStateCopy.ErrorTitle -> R.string.conversations_error_title
    EmptyStateCopy.ErrorSubtitle -> R.string.conversations_error_subtitle
    EmptyStateCopy.Retry -> R.string.conversations_retry
    EmptyStateCopy.FilteredTitle -> R.string.conversations_no_results
    EmptyStateCopy.FilteredSubtitle -> R.string.conversations_no_results_subtitle
    EmptyStateCopy.ColdTitle -> R.string.conversations_empty
    EmptyStateCopy.ColdSubtitle -> R.string.conversations_empty_subtitle
}
