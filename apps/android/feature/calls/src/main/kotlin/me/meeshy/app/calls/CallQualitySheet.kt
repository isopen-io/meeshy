package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallQualityGrade
import me.meeshy.sdk.model.call.CallQualityMetric
import me.meeshy.sdk.model.call.CallQualityNetworkContext
import me.meeshy.sdk.model.call.CallQualityRow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.NumberFormat
import java.util.Locale

private val CLOSE_TARGET = 44.dp
private val ROW_MIN_HEIGHT = 44.dp
private val GRADE_DOT = 8.dp
private const val GRADE_CHIP_ALPHA = 0.15f

/**
 * La feuille « Qualité de l'appel » (miroir de iOS `CallQualitySheet`) : la note globale, cinq rangées (perte,
 * latence, gigue, débits audio et vidéo) dont les trois premières portent un point vert, ambre ou rouge, puis le
 * chemin réseau (Relais ou Direct). Avant la première lecture : « Mesure en cours… ». Les valeurs suivent le flux
 * en direct tant que la feuille est ouverte, et chaque rangée est annoncée à TalkBack quand elle change.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallQualitySheet(onDismiss: () -> Unit, viewModel: CallQualityDetailViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    DisposableEffect(viewModel) {
        viewModel.onEvent(CallQualityDetailUiEvent.Start)
        onDispose { viewModel.onEvent(CallQualityDetailUiEvent.Stop) }
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        CallQualitySheetContent(state, onDismiss)
    }
}

@Composable
internal fun CallQualitySheetContent(state: CallQualityDetailUiState, onClose: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = MeeshySpacing.xl).padding(bottom = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        SheetHeader(state.overall, onClose)
        if (state.isWaitingForFirstReading) {
            Box(Modifier.fillMaxWidth().height(88.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.call_quality_waiting),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        } else {
            val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
            state.rows.forEachIndexed { index, row ->
                if (index > 0) HorizontalDivider()
                MetricRow(row, locale)
            }
            state.network?.let { NetworkRows(it) }
        }
    }
}

@Composable
private fun SheetHeader(overall: CallQualityGrade?, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = stringResource(R.string.call_quality_detail),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.semantics { heading() },
        )
        overall?.let { grade ->
            val tint = grade.tint()
            Text(
                text = grade.label(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = tint,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(tint.copy(alpha = GRADE_CHIP_ALPHA), CircleShape)
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
            )
        }
        Box(Modifier.weight(1f))
        val closeLabel = stringResource(R.string.call_quality_close)
        Box(
            modifier = Modifier
                .size(CLOSE_TARGET)
                .clickable(role = Role.Button, onClick = onClose)
                .semantics { contentDescription = closeLabel },
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun MetricRow(row: CallQualityRow, locale: Locale) {
    val title = row.metric.title()
    val value = row.formatted(locale)
    val grade = row.grade?.label()
    val spoken = listOfNotNull(value, grade).joinToString(", ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = ROW_MIN_HEIGHT)
            .semantics(mergeDescendants = true) {
                contentDescription = title
                stateDescription = spoken
                liveRegion = LiveRegionMode.Polite
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Text(title, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"), fontWeight = FontWeight.SemiBold)
        Box(
            Modifier
                .size(GRADE_DOT)
                .background(row.grade?.tint() ?: Color.Transparent, CircleShape)
                .clearAndSetSemantics { },
        )
    }
}

@Composable
private fun NetworkRows(context: CallQualityNetworkContext) {
    val relayed = context.relayed ?: return
    HorizontalDivider()
    val title = stringResource(R.string.call_quality_route)
    val value = stringResource(if (relayed) R.string.call_quality_route_relayed else R.string.call_quality_route_direct)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = ROW_MIN_HEIGHT)
            .semantics(mergeDescendants = true) {
                contentDescription = title
                stateDescription = value
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Text(title, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun CallQualityGrade.tint(): Color = when (this) {
    CallQualityGrade.GOOD -> MeeshyPalette.Success
    CallQualityGrade.MEDIUM -> MeeshyTheme.tokens.warning
    CallQualityGrade.POOR -> MeeshyPalette.Error
}

@Composable
private fun CallQualityGrade.label(): String = stringResource(
    when (this) {
        CallQualityGrade.GOOD -> R.string.call_quality_grade_good
        CallQualityGrade.MEDIUM -> R.string.call_quality_grade_medium
        CallQualityGrade.POOR -> R.string.call_quality_grade_poor
    },
)

@Composable
private fun CallQualityMetric.title(): String = stringResource(
    when (this) {
        CallQualityMetric.PACKET_LOSS -> R.string.call_quality_loss
        CallQualityMetric.LATENCY -> R.string.call_quality_latency
        CallQualityMetric.JITTER -> R.string.call_quality_jitter
        CallQualityMetric.AUDIO_RATE -> R.string.call_quality_audio_rate
        CallQualityMetric.VIDEO_RATE -> R.string.call_quality_video_rate
    },
)

@Composable
private fun CallQualityRow.formatted(locale: Locale): String = when (metric) {
    CallQualityMetric.PACKET_LOSS -> NumberFormat.getPercentInstance(locale)
        .apply { minimumFractionDigits = 0; maximumFractionDigits = 1 }
        .format(value / 100)
    CallQualityMetric.LATENCY, CallQualityMetric.JITTER ->
        stringResource(R.string.call_quality_unit_ms, wholeNumber(value, locale))
    CallQualityMetric.AUDIO_RATE, CallQualityMetric.VIDEO_RATE ->
        stringResource(R.string.call_quality_rate_kbps, wholeNumber(value, locale))
}

private fun wholeNumber(value: Double, locale: Locale): String =
    NumberFormat.getIntegerInstance(locale).format(Math.round(value))
