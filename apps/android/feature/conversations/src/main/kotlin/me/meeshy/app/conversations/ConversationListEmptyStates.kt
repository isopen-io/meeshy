package me.meeshy.app.conversations

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun SkeletonList() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        repeat(ConversationSkeletonMetrics.ROW_COUNT) { index -> ConversationSkeletonRow(index) }
    }
}

/**
 * Renders the branch [content] with an opacity transition between branches (iOS
 * `.transition(.opacity)`); the populated list is supplied by the caller.
 */
@Composable
internal fun ConversationListStateHost(
    content: ConversationListContent,
    onRetry: () -> Unit,
    onNewConversation: () -> Unit,
    populated: @Composable () -> Unit,
) {
    Crossfade(targetState = content, label = "conversation-list-branch") { branch ->
        when (branch) {
            ConversationListContent.Skeleton -> SkeletonList()
            ConversationListContent.Populated -> populated()
            else -> EmptyStateVisual.of(branch)?.let { visual ->
                EmptyStateCard(visual = visual, onRetry = onRetry, onNewConversation = onNewConversation)
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
internal fun EmptyStateCard(
    visual: EmptyStateVisual,
    onRetry: () -> Unit,
    onNewConversation: () -> Unit = {},
) {
    val accent = if (visual.glyph == EmptyStateGlyph.Error) MeeshyPalette.Error else MeeshyPalette.Indigo500
    Box(
        modifier = Modifier.fillMaxSize().padding(
            start = MeeshySpacing.xl,
            end = MeeshySpacing.xl,
            top = if (visual.compact) 60.dp else MeeshySpacing.xl,
            bottom = MeeshySpacing.xl,
        ),
        contentAlignment = if (visual.compact) Alignment.TopCenter else Alignment.Center,
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
                    Button(
                        onClick = if (cta == EmptyStateCopy.NewConversation) onNewConversation else onRetry,
                        modifier = Modifier.padding(top = MeeshySpacing.lg),
                    ) {
                        Text(stringResource(cta.resId()))
                    }
                }
            }
        }
    }
}

private fun EmptyStateGlyph.icon() = when (this) {
    EmptyStateGlyph.Error -> Icons.Filled.CloudOff
    EmptyStateGlyph.NoResults, EmptyStateGlyph.SearchNoResults -> Icons.Filled.SearchOff
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
    EmptyStateCopy.NewConversation -> R.string.empty_states_new_conversation
    EmptyStateCopy.SearchNoResultsTitle -> R.string.empty_states_search_no_results
    EmptyStateCopy.SearchNoResultsSubtitle -> R.string.empty_states_search_try_other_terms
}
