package me.meeshy.app.conversations.links

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.links.displayName
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val ACCENT_HEX = "4F46E5"

/**
 * Les liens de suivi (iOS `TrackingLinksView`) : quatre chiffres animés, la liste (copie en un geste,
 * fiche au toucher) et la feuille de création. [openCreate] ouvre la feuille dès l'arrivée (le « + »
 * de la carte du hub).
 */
@Composable
fun TrackingLinksScreen(
    onBack: () -> Unit,
    onOpenLink: (TrackingLink) -> Unit,
    openCreate: Boolean = false,
    viewModel: TrackingLinksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val accent = linkAccent(ACCENT_HEX)
    val actions = rememberLinkActions()
    val haptics = rememberMeeshyHaptics()

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.onResumed() }
    var pendingCreate by rememberSaveable { mutableStateOf(openCreate) }
    LaunchedEffect(pendingCreate) {
        if (pendingCreate) { viewModel.openCreate(); pendingCreate = false }
    }
    LaunchedEffect(viewModel) {
        viewModel.events.collect { if (it == LinkEvent.Created) haptics.success() }
    }

    LinksPage(
        title = stringResource(R.string.links_tracking_title),
        accent = accent,
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        actions = {
            IconButton(onClick = { haptics.light(); viewModel.openCreate() }) {
                Icon(MeeshyIcons.AddCircleFilled, stringResource(R.string.links_tracking_create_a11y), tint = accent)
            }
        },
    ) {
        if (state.refreshFailed && state.hasLoaded) item(key = "failed", contentType = "banner") { LinkRefreshFailedBanner(viewModel::refresh) }
        state.stats?.let { stats -> item(key = "stats", contentType = "stats") { StatsRow(stats, accent) } }
        item(key = "section", contentType = "section") { LinksSectionTitle(stringResource(R.string.links_tracking_section_my_links)) }
        when {
            !state.hasLoaded -> item(key = "skeleton", contentType = "skeleton") { LinkSkeletonRows(accent) }
            state.links.links.isEmpty() -> item(key = "empty", contentType = "empty") {
                LinkEmptyState(
                    MeeshyIcons.ChartBar,
                    stringResource(R.string.links_tracking_empty_title),
                    stringResource(R.string.links_tracking_empty_subtitle),
                    accent,
                )
            }
            else -> items(state.links.links, key = { it.id }, contentType = { "link" }) { link ->
                TrackingRow(
                    link = link,
                    accent = accent,
                    onOpen = { onOpenLink(link) },
                    onCopy = { actions.copy(link.shortUrl) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }

    state.createSheet?.let { sheet -> CreateTrackingLinkSheet(sheet, accent, viewModel) }
}

@Composable
private fun StatsRow(stats: TrackingLinkStats, accent: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        LinkStatTile(MeeshyIcons.Link, stats.totalLinks, R.plurals.links_count_links, accent, Modifier.weight(1f))
        LinkStatTile(MeeshyIcons.Touch, stats.totalClicks, R.plurals.links_count_clicks, accent, Modifier.weight(1f))
        LinkStatTile(MeeshyIcons.Person, stats.uniqueClicks, stringResource(R.string.links_tracking_stats_uniques), accent, Modifier.weight(1f))
        LinkStatTile(MeeshyIcons.CheckCircle, stats.activeLinks, stringResource(R.string.links_tracking_stats_active), accent, Modifier.weight(1f))
    }
}

@Composable
private fun TrackingRow(link: TrackingLink, accent: Color, onOpen: () -> Unit, onCopy: () -> Unit, modifier: Modifier = Modifier) {
    val tint = if (link.isActive) accent else MeeshyPalette.Neutral500
    Row(
        modifier = modifier
            .fillMaxWidth()
            .linkSurface(accent)
            .clickable(onClick = onOpen)
            .padding(MeeshySpacing.mdPlus),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LinkIconBadge(icon = MeeshyIcons.ChartBar, accent = tint, size = 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(link.displayName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
            val campaign = link.campaign?.takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty()
            Text(
                text = pluralStringResource(R.plurals.links_tracking_row_clicks, link.totalClicks, link.totalClicks) + " " +
                    pluralStringResource(R.plurals.links_tracking_row_uniques, link.uniqueClicks, link.uniqueClicks) + campaign,
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
        IconButton(onClick = onCopy) {
            Icon(MeeshyIcons.Copy, stringResource(R.string.links_common_copy_link), tint = accent, modifier = Modifier.size(20.dp))
        }
        Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(20.dp).padding(end = MeeshySpacing.xxs))
    }
}
