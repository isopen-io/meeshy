package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ActivityPeriod
import me.meeshy.sdk.model.ClientStatMessage
import me.meeshy.sdk.model.ContentTypeKind
import me.meeshy.sdk.model.ContentTypeShare
import me.meeshy.sdk.model.LanguageShare
import me.meeshy.sdk.model.ParticipantShare
import me.meeshy.sdk.model.SentimentBreakdown
import me.meeshy.sdk.model.SentimentTone
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import kotlin.math.roundToInt

/**
 * La feuille du tableau de bord unifié (Stats + Analyse), présentée depuis l'en-tête du fil.
 * Le contenu vit dans [ConversationDashboardContent] ; ce fichier garde les atomes de
 * section partagés (barres, sélecteur de période, sentiment, états vide et erreur).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationStatsSheet(
    conversationId: String,
    accentColor: Color,
    clientMessages: List<ClientStatMessage>,
    onDismiss: () -> Unit,
    viewModel: ConversationStatsViewModel = hiltViewModel(),
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        ConversationDashboardContent(conversationId, accentColor, clientMessages, statsViewModel = viewModel)
    }
}

@Composable
internal fun SentimentSummary(sentiment: SentimentBreakdown) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm),
    ) {
        SentimentColumn(
            SentimentTone.POSITIVE,
            "😄",
            stringResource(R.string.conversation_stats_sentiment_positive),
            sentiment,
            Modifier.weight(1f),
        )
        SentimentColumn(
            SentimentTone.NEUTRAL,
            "😐",
            stringResource(R.string.conversation_stats_sentiment_neutral),
            sentiment,
            Modifier.weight(1f),
        )
        SentimentColumn(
            SentimentTone.NEGATIVE,
            "😔",
            stringResource(R.string.conversation_stats_sentiment_negative),
            sentiment,
            Modifier.weight(1f),
        )
    }
}

@Composable
private fun SentimentColumn(
    tone: SentimentTone,
    emoji: String,
    label: String,
    sentiment: SentimentBreakdown,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(emoji, style = MaterialTheme.typography.titleMedium)
        Text(
            "${sentiment.percent(tone)}%",
            style = MaterialTheme.typography.bodyMedium,
            color = toneColor(tone),
            fontWeight = FontWeight.Bold,
        )
        Text(label, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
internal fun SentimentBar(sentiment: SentimentBreakdown) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm)
            .height(12.dp)
            .clip(CircleShape),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        sentiment.segments().forEach { segment ->
            Box(
                modifier = Modifier
                    .weight(segment.fraction.toFloat().coerceAtLeast(0.01f))
                    .fillMaxHeight()
                    .clip(CircleShape)
                    .background(toneColor(segment.tone)),
            )
        }
    }
}

private fun toneColor(tone: SentimentTone): Color = when (tone) {
    SentimentTone.POSITIVE -> MeeshyPalette.Success
    SentimentTone.NEUTRAL -> MeeshyPalette.Warning
    SentimentTone.NEGATIVE -> MeeshyPalette.Error
}

@Composable
private fun TotalPill(value: Int, label: String, tint: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tint.copy(alpha = 0.12f))
            .padding(MeeshySpacing.md),
    ) {
        Text(
            value.toString(),
            style = MaterialTheme.typography.headlineSmall,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = FontWeight.Bold,
        )
        Text(label, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
internal fun ContentTypeBar(share: ContentTypeShare, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            contentTypeLabel(share.kind),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.width(64.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(10.dp)
                .clip(CircleShape)
                .background(MeeshyTheme.tokens.textMuted.copy(alpha = 0.12f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(share.fraction.toFloat().coerceIn(0f, 1f))
                    .height(10.dp)
                    .clip(CircleShape)
                    .background(accentColor),
            )
        }
        Text(
            share.count.toString(),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.width(40.dp),
            textAlign = TextAlign.End,
        )
    }
}

@Composable
internal fun ActivityChart(counts: List<Int>, accentColor: Color) {
    val max = (counts.maxOrNull() ?: 1).coerceAtLeast(1)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp)
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        counts.forEach { count ->
            val fraction = (count.toFloat() / max).coerceIn(0.04f, 1f)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(fraction)
                    .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                    .background(accentColor),
            )
        }
    }
}

@Composable
internal fun PeriodPicker(current: ActivityPeriod, accentColor: Color, onSelect: (ActivityPeriod) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        ActivityPeriod.entries.forEach { period ->
            val active = period == current
            val a11y = periodDescription(period)
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(if (active) accentColor else MeeshyTheme.tokens.textMuted.copy(alpha = 0.10f))
                    .semantics(mergeDescendants = true) {
                        contentDescription = a11y
                        selected = active
                        role = Role.Tab
                    }
                    .clickable { onSelect(period) }
                    .defaultMinSize(minHeight = 48.dp)
                    .padding(horizontal = MeeshySpacing.md, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    periodLabel(period),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (active) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
internal fun ParticipantRow(share: ParticipantShare, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            share.name ?: share.userId,
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        Text(
            "${(share.fraction * 100).roundToInt()}%",
            style = MaterialTheme.typography.bodySmall,
            color = accentColor,
            fontWeight = FontWeight.Bold,
        )
        Text(
            share.messageCount.toString(),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.width(40.dp),
            textAlign = TextAlign.End,
        )
    }
}

@Composable
internal fun LanguageRow(share: LanguageShare, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            share.language.uppercase(),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.width(48.dp),
        )
        Text(
            "${(share.fraction * 100).roundToInt()}%",
            style = MaterialTheme.typography.bodySmall,
            color = accentColor,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        Text(
            share.count.toString(),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.width(40.dp),
            textAlign = TextAlign.End,
        )
    }
}

@Composable
internal fun ErrorState(accentColor: Color, onRetry: () -> Unit, message: String = stringResource(R.string.conversation_stats_error)) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            message,
            color = MeeshyPalette.Error,
            textAlign = TextAlign.Center,
        )
        TextButton(onClick = onRetry) {
            Text(stringResource(R.string.conversation_stats_retry), color = accentColor)
        }
    }
}

@Composable
internal fun CenteredHint(text: String) {
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
internal fun DashboardSectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textSecondary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = MeeshySpacing.md),
    )
}

@Composable
private fun contentTypeLabel(kind: ContentTypeKind): String = stringResource(
    when (kind) {
        ContentTypeKind.TEXT -> R.string.conversation_stats_type_text
        ContentTypeKind.IMAGE -> R.string.conversation_stats_type_image
        ContentTypeKind.AUDIO -> R.string.conversation_stats_type_audio
        ContentTypeKind.VIDEO -> R.string.conversation_stats_type_video
        ContentTypeKind.FILE -> R.string.conversation_stats_type_file
        ContentTypeKind.LOCATION -> R.string.conversation_stats_type_location
    },
)

@Composable
private fun periodDescription(period: ActivityPeriod): String = stringResource(
    when (period) {
        ActivityPeriod.WEEK -> R.string.dashboard_period_week
        ActivityPeriod.MONTH -> R.string.dashboard_period_month
        ActivityPeriod.ALL -> R.string.dashboard_period_all
    },
)

@Composable
private fun periodLabel(period: ActivityPeriod): String = stringResource(
    when (period) {
        ActivityPeriod.WEEK -> R.string.conversation_stats_period_week
        ActivityPeriod.MONTH -> R.string.conversation_stats_period_month
        ActivityPeriod.ALL -> R.string.conversation_stats_period_all
    },
)

