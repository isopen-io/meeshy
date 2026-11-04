package me.meeshy.app.chat

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.NumberFormat
import java.time.LocalDate
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.AnalysisSummaryView
import me.meeshy.sdk.model.ClientStatMessage
import me.meeshy.sdk.model.ConversationDashboardRules
import me.meeshy.sdk.model.DashboardRing
import me.meeshy.sdk.model.DashboardRingKind
import me.meeshy.ui.format.CompactCountLabel
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le tableau de bord unifié de la conversation (Stats + Analyse fusionnés, miroir de
 * `ConversationDashboardView` iOS) : UN seul défilement — jauge de santé IA, sept anneaux,
 * activité 7j/30j/Tout, participants (top 10), sentiment, types de contenu, profils.
 * Le serveur prime ; l'instantané client (calculé hors du fil principal par le view-model)
 * s'affiche d'abord et reste debout hors ligne. [header] précède le premier bloc.
 */
@Composable
internal fun ConversationDashboardContent(
    conversationId: String,
    accentColor: Color,
    clientMessages: List<ClientStatMessage>,
    modifier: Modifier = Modifier,
    statsViewModel: ConversationStatsViewModel = hiltViewModel(),
    analysisViewModel: ConversationAnalysisViewModel = hiltViewModel(),
    header: @Composable () -> Unit = {},
) {
    val stats by statsViewModel.state.collectAsStateWithLifecycle()
    val analysis by analysisViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(conversationId) {
        statsViewModel.load(conversationId, clientMessages)
        analysisViewModel.load(conversationId)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        header()
        val hasAnalysis = analysis.summary != null || analysis.profiles.isNotEmpty()
        when {
            stats.isLoading && !hasAnalysis -> CircularProgressIndicator(
                modifier = Modifier
                    .size(24.dp)
                    .padding(vertical = MeeshySpacing.lg),
                color = accentColor,
            )

            stats.hasError && !hasAnalysis -> ErrorState(
                accentColor,
                onRetry = {
                    statsViewModel.retry()
                    analysisViewModel.retry()
                },
            )

            stats.phase == StatsPhase.Empty && !hasAnalysis ->
                CenteredHint(stringResource(R.string.conversation_stats_empty))

            else -> DashboardSections(stats, analysis, accentColor, statsViewModel::selectPeriod)
        }
    }
}

@Composable
private fun DashboardSections(
    stats: ConversationStatsUiState,
    analysis: ConversationAnalysisUiState,
    accentColor: Color,
    onSelectPeriod: (me.meeshy.sdk.model.ActivityPeriod) -> Unit,
) {
    analysis.summary?.let { HealthHeroCard(it, accentColor) }

    if (stats.phase == StatsPhase.Loaded || stats.phase == StatsPhase.Empty) {
        DashboardCard(stringResource(R.string.dashboard_section_statistics)) {
            StatRings(
                ConversationDashboardRules.rings(stats.totalMessages, stats.totalWords, stats.contentCounts),
                accentColor,
            )
        }

        val activity = stats.activity(LocalDate.now())
        DashboardCard(stringResource(R.string.conversation_stats_activity)) {
            PeriodPicker(stats.period, accentColor, onSelectPeriod)
            if (activity.isEmpty()) {
                CenteredHint(stringResource(R.string.conversation_stats_activity_empty))
            } else {
                ActivityChart(activity.map { it.count }, accentColor)
            }
        }
    }

    if (analysis.profiles.isNotEmpty()) {
        DashboardSectionLabel(stringResource(R.string.conversation_analysis_personas))
        analysis.profiles.forEach { ParticipantPersonaCard(it, accentColor) }
    }

    val participants = ConversationDashboardRules.topParticipants(stats.participants)
    if (participants.isNotEmpty()) {
        DashboardCard(stringResource(R.string.dashboard_section_participant_activity)) {
            participants.forEach { ParticipantRow(it, accentColor) }
        }
    }

    stats.sentiment?.let { sentiment ->
        DashboardCard(stringResource(R.string.conversation_stats_sentiment)) {
            SentimentSummary(sentiment)
            SentimentBar(sentiment)
        }
    }

    if (stats.contentTypes.isNotEmpty()) {
        DashboardCard(stringResource(R.string.conversation_stats_content_types)) {
            stats.contentTypes.forEach { ContentTypeBar(it, accentColor) }
        }
    }

    if (stats.languages.isNotEmpty()) {
        DashboardCard(stringResource(R.string.conversation_stats_languages)) {
            stats.languages.take(LANGUAGE_ROW_LIMIT).forEach { LanguageRow(it, accentColor) }
        }
    }
}

@Composable
private fun DashboardCard(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
            fontWeight = FontWeight.SemiBold,
        )
        content()
    }
}

@Composable
private fun HealthHeroCard(summary: AnalysisSummaryView, accentColor: Color) {
    DashboardCard(stringResource(R.string.conversation_analysis_title)) {
        summary.healthScore?.let { score ->
            val tint = healthTierColor(summary.healthTier)
            DashboardArcGauge(
                score = score,
                accentColor = accentColor,
                scoreColor = tint,
                label = stringResource(R.string.dashboard_health),
            )
            Text(
                stringResource(R.string.dashboard_health).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textMuted,
                fontWeight = FontWeight.ExtraBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
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
        if (summary.text.isNotEmpty()) {
            Text(
                summary.text,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                fontStyle = FontStyle.Italic,
            )
        }
        if (summary.topics.isNotEmpty()) {
            FlowChips { summary.topics.forEach { LabelChip(it, accentColor) } }
        }
        if (summary.emotions.isNotEmpty()) {
            FlowChips { summary.emotions.forEach { LabelChip(it, MeeshyPalette.Info) } }
        }
        if (summary.overallTone.isNotEmpty()) {
            Text(
                stringResource(R.string.dashboard_tone, summary.overallTone),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textPrimary,
                fontWeight = FontWeight.SemiBold,
            )
        }
        summary.dynamique?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                fontStyle = FontStyle.Italic,
            )
        }
    }
}

@Composable
private fun StatRings(rings: List<DashboardRing>, accentColor: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        rings.chunked(RINGS_PER_ROW).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                row.forEach { StatRing(it, accentColor, Modifier.weight(1f)) }
                repeat(RINGS_PER_ROW - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun StatRing(ring: DashboardRing, accentColor: Color, modifier: Modifier = Modifier) {
    val label = stringResource(ringLabel(ring.kind))
    val locale = rememberReaderLocale()
    val exact = NumberFormat.getIntegerInstance(locale).format(ring.value)
    Column(
        modifier = modifier.clearAndSetSemantics {
            contentDescription = label
            stateDescription = exact
        },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(modifier = Modifier.size(RING_SIZE), contentAlignment = Alignment.Center) {
            val track = accentColor.copy(alpha = 0.14f)
            Canvas(modifier = Modifier.size(RING_SIZE)) {
                val stroke = RING_STROKE.toPx()
                val inset = stroke / 2f
                val arcSize = Size(size.width - stroke, size.height - stroke)
                val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
                drawArc(track, 0f, 360f, false, topLeft, arcSize, style = Stroke(stroke))
                drawArc(
                    accentColor,
                    -90f,
                    360f * ring.progress,
                    false,
                    topLeft,
                    arcSize,
                    style = Stroke(stroke, cap = StrokeCap.Round),
                )
            }
            CompactCountLabel(
                count = ring.value,
                color = MeeshyTheme.tokens.textPrimary,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
            )
        }
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
            maxLines = 1,
        )
    }
}

private fun ringLabel(kind: DashboardRingKind): Int = when (kind) {
    DashboardRingKind.MESSAGES -> R.string.conversation_stats_messages
    DashboardRingKind.WORDS -> R.string.conversation_stats_words
    DashboardRingKind.PHOTOS -> R.string.conversation_stats_type_image
    DashboardRingKind.AUDIO -> R.string.conversation_stats_type_audio
    DashboardRingKind.VIDEOS -> R.string.conversation_stats_type_video
    DashboardRingKind.LINKS -> R.string.dashboard_stat_links
    DashboardRingKind.DOCUMENTS -> R.string.dashboard_stat_documents
}

private const val RINGS_PER_ROW = 3
private const val LANGUAGE_ROW_LIMIT = 6
private val RING_SIZE = 60.dp
private val RING_STROKE = 5.dp
