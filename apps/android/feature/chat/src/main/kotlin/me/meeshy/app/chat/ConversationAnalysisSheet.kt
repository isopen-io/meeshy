package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.AnalysisSummaryView
import me.meeshy.sdk.model.ConflictTier
import me.meeshy.sdk.model.HealthTier
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * AI conversation-analysis bottom sheet (feature-parity §Chat — "AI conversation
 * analysis: health / tone / topics / emotions"). Presented from the chat header,
 * this is the Android arm of iOS's `ConversationDashboardView.heroHealthCard`. Every
 * derivation lives in the tested [ConversationAnalysisViewModel] +
 * `ConversationAnalysisProjection`, so this is coverage-exempt Compose glue: a health
 * badge, engagement/conflict chips, topics + emotions chip rows, tone, and the summary
 * narrative.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationAnalysisSheet(
    conversationId: String,
    accentColor: Color,
    onDismiss: () -> Unit,
    viewModel: ConversationAnalysisViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(conversationId) { viewModel.load(conversationId) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                stringResource(R.string.conversation_analysis_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            )

            when {
                state.isLoading -> CircularProgressIndicator(
                    modifier = Modifier
                        .size(24.dp)
                        .padding(vertical = MeeshySpacing.lg),
                    color = accentColor,
                )

                state.hasError -> ErrorState(accentColor, onRetry = viewModel::retry)

                state.phase == AnalysisPhase.Empty || state.summary == null ->
                    CenteredHint(stringResource(R.string.conversation_analysis_empty))

                else -> LoadedContent(state.summary!!, accentColor)
            }
        }
    }
}

@Composable
private fun LoadedContent(summary: AnalysisSummaryView, accentColor: Color) {
    summary.healthScore?.let { score ->
        HealthBadge(score, healthTierColor(summary.healthTier))
    }

    if (summary.engagementLevel != null || summary.conflictLevel != null) {
        FlowChips {
            summary.engagementLevel?.let {
                LevelChip(stringResource(R.string.conversation_analysis_engagement, it), accentColor)
            }
            summary.conflictLevel?.let {
                LevelChip(
                    stringResource(R.string.conversation_analysis_conflict, it),
                    conflictTierColor(summary.conflictTier),
                )
            }
        }
    }

    if (summary.overallTone.isNotEmpty()) {
        SectionLabel(stringResource(R.string.conversation_analysis_tone))
        Text(
            summary.overallTone,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }

    if (summary.topics.isNotEmpty()) {
        SectionLabel(stringResource(R.string.conversation_analysis_topics))
        FlowChips { summary.topics.forEach { LabelChip(it, accentColor) } }
    }

    if (summary.emotions.isNotEmpty()) {
        SectionLabel(stringResource(R.string.conversation_analysis_emotions))
        FlowChips { summary.emotions.forEach { LabelChip(it, MeeshyPalette.Info) } }
    }

    if (summary.text.isNotEmpty()) {
        SectionLabel(stringResource(R.string.conversation_analysis_summary))
        Text(
            summary.text,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }

    summary.dynamique?.let {
        SectionLabel(stringResource(R.string.conversation_analysis_dynamic))
        Text(it, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun HealthBadge(score: Int, tint: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tint.copy(alpha = 0.12f))
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            "$score",
            style = MaterialTheme.typography.headlineMedium,
            color = tint,
            fontWeight = FontWeight.Bold,
        )
        Text(
            stringResource(R.string.conversation_analysis_health),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowChips(content: @Composable () -> Unit) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        content()
    }
}

@Composable
private fun LabelChip(text: String, tint: Color) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textPrimary,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint.copy(alpha = 0.14f))
            .padding(horizontal = MeeshySpacing.md, vertical = 6.dp),
    )
}

@Composable
private fun LevelChip(text: String, tint: Color) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = tint,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = MeeshySpacing.md, vertical = 6.dp),
    )
}

@Composable
private fun ErrorState(accentColor: Color, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            stringResource(R.string.conversation_analysis_error),
            color = MeeshyPalette.Error,
            textAlign = TextAlign.Center,
        )
        TextButton(onClick = onRetry) {
            Text(stringResource(R.string.conversation_stats_retry), color = accentColor)
        }
    }
}

@Composable
private fun CenteredHint(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textMuted,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg),
    )
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textSecondary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = MeeshySpacing.md),
    )
}

private fun healthTierColor(tier: HealthTier?): Color = when (tier) {
    HealthTier.GOOD -> MeeshyPalette.Success
    HealthTier.FAIR -> MeeshyPalette.Warning
    HealthTier.POOR -> MeeshyPalette.Error
    null -> MeeshyPalette.Info
}

private fun conflictTierColor(tier: ConflictTier?): Color = when (tier) {
    ConflictTier.HIGH -> MeeshyPalette.Error
    ConflictTier.MEDIUM -> MeeshyPalette.Warning
    ConflictTier.LOW -> MeeshyPalette.Success
    null -> MeeshyPalette.Info
}
