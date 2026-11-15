package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.util.Locale
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallNetworkJournalPresentation
import me.meeshy.sdk.model.call.CallNetworkLink
import me.meeshy.sdk.model.call.CallNetworkMoment
import me.meeshy.sdk.model.call.CallNetworkMomentKind
import me.meeshy.sdk.model.call.CallNetworkSummaryRow
import me.meeshy.sdk.model.call.VideoQualityLevel
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Qualité et réseau » — port of iOS `CallNetworkJournalSection` (#8698, #13676): the summary of the link (averages,
 * peaks, reconnections, route, profiles, incidents) then the timeline of its milestones, each with its elapsed clock
 * and a dot that turns amber on an alert. Everything it says is decided by [CallNetworkJournalPresentation].
 */
@Composable
internal fun CallDetailNetworkJournalSection(presentation: CallNetworkJournalPresentation, accent: Color) {
    val locale = Locale.getDefault()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshyRadius.md))
            .padding(bottom = MeeshySpacing.sm),
    ) {
        NetworkSectionTitle(stringResource(R.string.call_network_title))
        presentation.summary.forEach { row ->
            val (title, value) = summaryText(row, locale)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                    .clearAndSetSemantics { contentDescription = "$title, $value" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(title, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textMuted)
                Spacer(Modifier.weight(1f).defaultMinSize(minWidth = MeeshySpacing.sm))
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textPrimary,
                    textAlign = TextAlign.End,
                )
            }
        }
        if (presentation.timeline.isNotEmpty()) {
            NetworkSectionTitle(stringResource(R.string.call_network_timeline))
            presentation.timeline.forEach { moment -> MomentRow(moment, accent) }
        }
    }
}

@Composable
private fun NetworkSectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textMuted,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.md)
            .padding(top = MeeshySpacing.md, bottom = MeeshySpacing.xs)
            .semantics { heading() },
    )
}

@Composable
private fun MomentRow(moment: CallNetworkMoment, accent: Color) {
    val text = momentText(moment.kind)
    val spoken = listOfNotNull(moment.elapsedLabel, text, moment.detail).joinToString(", ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus)
            .clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Text(
            text = moment.elapsedLabel,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.width(44.dp),
        )
        Box(
            modifier = Modifier
                .padding(top = MeeshySpacing.xsPlus)
                .size(6.dp)
                .background(if (moment.isAlert) MeeshyPalette.Warning else accent, CircleShape),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
            moment.detail?.let { detail ->
                Text(detail, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
    }
}

@Composable
private fun summaryText(row: CallNetworkSummaryRow, locale: Locale): Pair<String, String> = when (row) {
    is CallNetworkSummaryRow.PacketLoss -> stringResource(R.string.call_network_packet_loss) to
        stringResource(R.string.call_network_peak, percent(row.meanPercent, locale), percent(row.peakPercent, locale))
    is CallNetworkSummaryRow.Latency -> stringResource(R.string.call_network_latency) to
        stringResource(R.string.call_network_peak, millis(row.meanMs, locale), millis(row.peakMs, locale))
    is CallNetworkSummaryRow.Jitter -> stringResource(R.string.call_network_jitter) to millis(row.meanMs, locale)
    is CallNetworkSummaryRow.Reconnections ->
        stringResource(R.string.call_network_reconnections) to NumberFormat.getIntegerInstance(locale).format(row.count)
    is CallNetworkSummaryRow.Route -> stringResource(R.string.call_network_route) to routeLabel(row.relayed)
    is CallNetworkSummaryRow.Profiles -> stringResource(R.string.call_network_profiles) to row.names.joinToString(" → ")
    is CallNetworkSummaryRow.Faults ->
        stringResource(R.string.call_network_faults) to NumberFormat.getIntegerInstance(locale).format(row.count)
}

@Composable
private fun momentText(kind: CallNetworkMomentKind): String = when (kind) {
    is CallNetworkMomentKind.Link -> stringResource(
        when (kind.link) {
            CallNetworkLink.CONNECTING -> R.string.call_network_event_link_connecting
            CallNetworkLink.CONNECTED -> R.string.call_network_event_link_connected
            CallNetworkLink.DISCONNECTED -> R.string.call_network_event_link_disconnected
            CallNetworkLink.FAILED -> R.string.call_network_event_link_failed
        },
    )
    is CallNetworkMomentKind.Reconnecting -> stringResource(R.string.call_network_event_reconnecting, kind.attempt)
    CallNetworkMomentKind.Reconnected -> stringResource(R.string.call_network_event_reconnected)
    is CallNetworkMomentKind.Route -> stringResource(R.string.call_network_event_route, routeLabel(kind.relayed))
    is CallNetworkMomentKind.Tier -> stringResource(R.string.call_network_event_tier, tierLabel(kind.level))
    is CallNetworkMomentKind.Profile -> stringResource(R.string.call_network_event_profile, kind.name)
    CallNetworkMomentKind.MediaFault -> stringResource(R.string.call_network_event_fault)
    CallNetworkMomentKind.Ended -> stringResource(R.string.call_network_event_ended)
}

@Composable
private fun routeLabel(relayed: Boolean): String =
    stringResource(if (relayed) R.string.call_network_route_relayed else R.string.call_network_route_direct)

@Composable
private fun tierLabel(level: VideoQualityLevel): String = stringResource(
    when (level) {
        VideoQualityLevel.EXCELLENT -> R.string.call_network_tier_excellent
        VideoQualityLevel.GOOD -> R.string.call_network_tier_good
        VideoQualityLevel.FAIR -> R.string.call_network_tier_fair
        VideoQualityLevel.POOR, VideoQualityLevel.CRITICAL -> R.string.call_network_tier_poor
    },
)

private fun percent(value: Double, locale: Locale): String =
    NumberFormat.getPercentInstance(locale).apply { maximumFractionDigits = 1 }.format(value / PERCENT)

@Composable
private fun millis(value: Double, locale: Locale): String =
    stringResource(R.string.call_network_ms, NumberFormat.getIntegerInstance(locale).format(Math.round(value)))

private const val PERCENT = 100.0
