package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EditHistoryProjection
import me.meeshy.sdk.model.EditHistoryRow
import me.meeshy.sdk.model.MessageSentimentGauge
import me.meeshy.sdk.model.MessageSentimentTier
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Fiche « Historique » : la version courante puis les versions antérieures gardées sur l'appareil. */
@Composable
internal fun MessageHistorySheet(
    bubble: BubbleContent,
    accentColor: Color,
    modifier: Modifier = Modifier,
    viewModel: MessageEditHistoryViewModel = hiltViewModel(),
) {
    val revisions by viewModel.revisions.collectAsStateWithLifecycle()
    androidx.compose.runtime.DisposableEffect(bubble.messageId) {
        viewModel.bind(bubble.messageId)
        onDispose { viewModel.unbind() }
    }
    val history = remember(revisions, bubble.text) {
        EditHistoryProjection.project(bubble.text, null, revisions.orEmpty())
    }
    val count = history.previousCount

    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg).padding(bottom = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
    ) {
        Text(
            stringResource(R.string.chat_action_history),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(vertical = MeeshySpacing.sm),
        )
        if (revisions == null) return@Column
        MessageDetailBanner(
            icon = MeeshyIcons.History,
            title = stringResource(if (history.isEmpty) R.string.message_detail_edits_none_title else R.string.message_detail_edits_history_title),
            detail = if (history.isEmpty) {
                stringResource(R.string.message_detail_edits_none_detail)
            } else {
                stringResource(if (count == 1) R.string.message_detail_edits_previous_one else R.string.message_detail_edits_previous_other, count)
            },
            accent = accentColor,
            count = count.takeIf { it > 0 }?.toString(),
        )
        if (history.isEmpty) {
            MessageDetailEmpty(MeeshyIcons.Edit, stringResource(R.string.message_detail_edits_empty))
            return@Column
        }
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            modifier = Modifier.heightIn(max = 480.dp),
        ) {
            itemsIndexed(history.rows, key = { index, row -> if (row is EditHistoryRow.Version) "v${row.number}" else "current$index" }) { index, row ->
                val isCurrent = row is EditHistoryRow.Current
                val header = when (row) {
                    is EditHistoryRow.Current -> stringResource(R.string.message_detail_edits_current)
                    is EditHistoryRow.Version -> stringResource(R.string.message_detail_edits_version_n, row.number)
                }
                RevisionRow(
                    header = header,
                    content = row.content,
                    timestamp = hourMinute(row.timestampMillis),
                    accent = accentColor,
                    isCurrent = isCurrent,
                    modifier = Modifier.animateItem().staggeredAppear(index),
                )
            }
        }
    }
}

@Composable
private fun RevisionRow(header: String, content: String, timestamp: String, accent: Color, isCurrent: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f))
            .padding(MeeshySpacing.smPlus)
            .semantics(mergeDescendants = true) { contentDescription = "$header, $timestamp, $content" },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Box(
            Modifier.width(3.dp).fillMaxHeight().heightIn(min = 24.dp).clip(RoundedCornerShape(3.dp))
                .background(accent.copy(alpha = if (isCurrent) 1f else 0.4f)),
        )
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    header.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isCurrent) accent else MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.weight(1f),
                )
                if (timestamp.isNotBlank()) {
                    Text(timestamp, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
                }
            }
            Text(content, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        }
    }
}

private fun MessageSentimentTier.labelRes(): Int = when (this) {
    MessageSentimentTier.VeryNegative -> R.string.sentiment_very_negative
    MessageSentimentTier.Negative -> R.string.conversation_stats_sentiment_negative
    MessageSentimentTier.Neutral -> R.string.conversation_stats_sentiment_neutral
    MessageSentimentTier.Positive -> R.string.conversation_stats_sentiment_positive
    MessageSentimentTier.VeryPositive -> R.string.sentiment_very_positive
}

/** Fiche « Sentiment » : analyse faite sur l'appareil, rien ne part au serveur. */
@Composable
internal fun MessageSentimentSheet(bubble: BubbleContent, accentColor: Color, modifier: Modifier = Modifier) {
    val gauge = remember(bubble.text) { MessageSentimentGauge.of(bubble.text) }
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(bubble.messageId) { haptics.light() }
    val label = stringResource(gauge.tier.labelRes())
    val a11yValue = stringResource(R.string.message_detail_sentiment_a11y_value, label, gauge.score)
    val a11yLabel = stringResource(R.string.message_detail_sentiment_a11y_label)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.xl)
            .semantics(mergeDescendants = true) { contentDescription = a11yLabel; stateDescription = a11yValue },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Text(
            stringResource(R.string.chat_action_sentiment),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.align(Alignment.Start).padding(vertical = MeeshySpacing.sm),
        )
        AnimatedContent(
            targetState = gauge.tier,
            transitionSpec = {
                (fadeIn() + scaleIn(spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessLow), initialScale = 0.6f)) togetherWith
                    (fadeOut() + scaleOut(targetScale = 0.6f))
            },
            label = "sentiment-emoji",
            modifier = Modifier.clearAndSetSemantics { },
        ) { tier -> Text(tier.emoji, fontSize = 56.sp) }
        Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        SentimentGaugeBar(gauge.position, Modifier.clearAndSetSemantics { })
        Text(
            stringResource(R.string.message_detail_sentiment_score, gauge.score),
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun SentimentGaugeBar(position: Float, modifier: Modifier = Modifier) {
    val animated by animateFloatAsState(position, spring(Spring.DampingRatioLowBouncy, Spring.StiffnessLow), label = "sentiment-cursor")
    var widthPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val knob = 18.dp
    Box(modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl).height(knob).onSizeChanged { widthPx = it.width }) {
        Box(
            Modifier.fillMaxWidth().height(12.dp).align(Alignment.CenterStart).clip(RoundedCornerShape(MeeshyRadius.xxs))
                .background(Brush.horizontalGradient(listOf(MeeshyPalette.Error, MeeshyPalette.Warning, MeeshyPalette.Warning, MeeshyPalette.Success))),
        )
        val travel = with(density) { (widthPx - knob.toPx()).coerceAtLeast(0f) }
        Box(
            Modifier
                .offset(x = with(density) { (animated * travel).toDp() })
                .size(knob)
                .shadow(2.dp, CircleShape)
                .background(Color.White, CircleShape),
        )
    }
}
