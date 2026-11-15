package me.meeshy.app.conversations.links

import android.graphics.Bitmap
import android.text.format.DateUtils
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkClick
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.links.BreakdownRow
import me.meeshy.sdk.model.links.ClickDeviceKind
import me.meeshy.sdk.model.links.RECENT_CLICKS_SHOWN
import me.meeshy.sdk.model.links.countryFlag
import me.meeshy.sdk.model.links.displayName
import me.meeshy.sdk.model.links.redirectConfirmed
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun TrackingHeaderCard(link: TrackingLink, accent: Color) {
    val tint = if (link.isActive) accent else MeeshyPalette.Neutral500
    Column(
        modifier = Modifier.fillMaxWidth().linkSurface(accent, radius = 20.dp).padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        LinkIconBadge(MeeshyIcons.ChartBar, tint, size = 60.dp)
        Text(link.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary)
        Text(link.shortUrl, style = MaterialTheme.typography.labelMedium, fontFamily = FontFamily.Monospace, color = MeeshyTheme.tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            link.campaign?.takeIf { it.isNotBlank() }?.let { UtmTag(it, accent) }
            link.source?.takeIf { it.isNotBlank() }?.let { UtmTag(it, MeeshyPalette.Indigo500) }
            link.medium?.takeIf { it.isNotBlank() }?.let { UtmTag(it, MeeshyPalette.Indigo300) }
        }
    }
}

@Composable
private fun UtmTag(text: String, color: Color) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        modifier = Modifier.clip(CircleShape).background(color.wash(0.15f)).padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
    )
}

@Composable
internal fun TrackingActionsBar(
    copied: Boolean,
    accent: Color,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onQr: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        LinkActionTile(
            label = stringResource(R.string.links_tracking_detail_copy),
            icon = if (copied) MeeshyIcons.Check else MeeshyIcons.Copy,
            color = if (copied) MeeshyTheme.tokens.success else accent,
            onClick = onCopy,
            modifier = Modifier.weight(1f),
        )
        LinkActionTile(stringResource(R.string.links_tracking_detail_share), MeeshyIcons.Share, accent, onShare, Modifier.weight(1f))
        LinkActionTile(stringResource(R.string.links_tracking_detail_qr), MeeshyIcons.QrCode, MeeshyPalette.Indigo500, onQr, Modifier.weight(1f))
        LinkActionTile(stringResource(R.string.links_tracking_detail_delete), MeeshyIcons.Delete, MeeshyTheme.tokens.error, onDelete, Modifier.weight(1f))
    }
}

@Composable
internal fun LinkActionTile(label: String, icon: ImageVector, color: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(
            Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)).background(color.wash(0.15f)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = color) }
        Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textSecondary, maxLines = 1)
    }
}

@Composable
internal fun TrackingMainStats(link: TrackingLink, accent: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        LinksSectionTitle(stringResource(R.string.links_tracking_detail_stats_title))
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            LinkStatTile(MeeshyIcons.Touch, link.totalClicks, stringResource(R.string.links_tracking_detail_stats_total_clicks), accent, Modifier.weight(1f))
            LinkStatTile(MeeshyIcons.Person, link.uniqueClicks, stringResource(R.string.links_tracking_detail_stats_unique_clicks), MeeshyPalette.Indigo500, Modifier.weight(1f))
        }
        isoToEpochMillisOrNull(link.lastClickedAt)?.takeIf { it > 0 }?.let { last ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
                Icon(MeeshyIcons.Schedule, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
                Text(
                    stringResource(R.string.links_tracking_detail_last_click, ShareLinkDateFormat.dayAndTime(last)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
    }
}

@Composable
internal fun BreakdownCard(titleRes: Int, rows: List<BreakdownRow>, accent: Color, showFlag: Boolean = false) {
    Column(
        modifier = Modifier.fillMaxWidth().linkSurface(accent, radius = 16.dp).padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        LinksSectionTitle(stringResource(titleRes))
        if (rows.isEmpty()) {
            Text(
                stringResource(R.string.links_tracking_detail_no_data),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
            )
        } else {
            rows.forEach { row -> BreakdownBar(row, accent, if (showFlag) countryFlag(row.label) else "") }
        }
    }
}

@Composable
private fun BreakdownBar(row: BreakdownRow, color: Color, flag: String) {
    val reduce = LocalReduceMotion.current
    val fraction by animateFloatAsState(row.fraction, tween(if (reduce) 0 else 600), label = "breakdownBar")
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = if (flag.isEmpty()) row.label else "$flag ${row.label}",
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(88.dp),
        )
        Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(color.wash(0.15f))) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(fraction).clip(RoundedCornerShape(4.dp)).background(color.copy(alpha = 0.8f)))
        }
        Text(
            row.count.toString(),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.width(32.dp),
        )
    }
}

@Composable
internal fun ClicksTimeline(clicks: List<TrackingLinkClick>, accent: Color, isLoading: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            LinksSectionTitle(stringResource(R.string.links_tracking_detail_recent_clicks))
            Box(Modifier.weight(1f))
            if (isLoading) CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = accent)
        }
        Column(Modifier.fillMaxWidth().linkSurface(accent, radius = 14.dp)) {
            val shown = clicks.take(RECENT_CLICKS_SHOWN)
            shown.forEachIndexed { index, click ->
                ClickRow(click)
                if (index < shown.lastIndex) HorizontalDivider(Modifier.padding(start = 52.dp), color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.15f))
            }
        }
    }
}

@Composable
private fun ClickRow(click: TrackingLinkClick) {
    val kind = ClickDeviceKind.of(click.device)
    val tint = when (kind) {
        ClickDeviceKind.MOBILE -> MeeshyPalette.TrackingAccent
        ClickDeviceKind.TABLET -> MeeshyPalette.Indigo500
        ClickDeviceKind.DESKTOP -> MeeshyPalette.Indigo300
        ClickDeviceKind.OTHER -> MeeshyPalette.Neutral500
    }
    val confirmed = click.redirectConfirmed
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LinkIconBadge(if (kind == ClickDeviceKind.OTHER) MeeshyIcons.Globe else if (kind == ClickDeviceKind.DESKTOP) MeeshyIcons.Devices else MeeshyIcons.Smartphone, tint, size = 36.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            val place = click.city ?: click.country ?: stringResource(R.string.links_tracking_detail_unknown)
            val flag = click.country?.let(::countryFlag).orEmpty()
            val social = click.socialSource?.let { " · $it" }.orEmpty()
            Text("${if (flag.isEmpty()) "" else "$flag "}$place$social", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(click.browser, click.os).joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted, maxLines = 1)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            isoToEpochMillisOrNull(click.clickedAt)?.takeIf { it > 0 }?.let { millis ->
                Text(
                    DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (confirmed) MeeshyTheme.tokens.success else MeeshyTheme.tokens.error))
        }
    }
}

@Composable
internal fun UtmInfoCard(link: TrackingLink, accent: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        LinksSectionTitle(stringResource(R.string.links_tracking_detail_utm_title))
        Column(Modifier.fillMaxWidth().linkSurface(accent, radius = 14.dp)) {
            val rows = buildList {
                link.campaign?.takeIf { it.isNotBlank() }?.let { add("Campaign" to it) }
                link.source?.takeIf { it.isNotBlank() }?.let { add("Source" to it) }
                link.medium?.takeIf { it.isNotBlank() }?.let { add("Medium" to it) }
            }
            rows.forEach { (label, value) -> InfoRow(label, value); HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.15f)) }
            InfoRow(stringResource(R.string.links_tracking_detail_destination_url), link.originalUrl)
            isoToEpochMillisOrNull(link.createdAt)?.takeIf { it > 0 }?.let {
                HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.15f))
                InfoRow(stringResource(R.string.links_tracking_detail_created_at), ShareLinkDateFormat.dayAndTime(it))
            }
        }
    }
}

@Composable
internal fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.End)
    }
}

@Composable
internal fun QrDialog(bitmap: Bitmap, onShare: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.links_tracking_detail_qr), fontWeight = FontWeight.SemiBold) },
        text = {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = stringResource(R.string.links_tracking_detail_qr),
                modifier = Modifier.fillMaxWidth().height(260.dp),
            )
        },
        confirmButton = { TextButton(onClick = onShare) { Text(stringResource(R.string.links_tracking_detail_share)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_common_cancel)) } },
    )
}
