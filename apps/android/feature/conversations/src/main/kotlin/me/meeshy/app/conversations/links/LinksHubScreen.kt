package me.meeshy.app.conversations.links

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.links.LinksHubEntry
import me.meeshy.sdk.model.links.LinksHubFigures
import me.meeshy.sdk.model.links.LinksHubSummary
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le hub « Mes liens » (iOS `LinksHubView`, entrée du menu flottant) : une bannière et quatre cartes —
 * partage, suivi, communautés, parrainage — chacune avec son « + » de création (sauf communautés) et
 * ses deux chiffres, chargés en parallèle et animés.
 */
@Composable
fun LinksHubScreen(
    onBack: () -> Unit,
    onOpen: (LinksHubEntry) -> Unit,
    onCreate: (LinksHubEntry) -> Unit,
    viewModel: LinksHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val bannerAccent = linkAccent(LinksHubEntry.COMMUNITY.accentHex)

    LinksPage(
        title = stringResource(R.string.links_hub_title),
        accent = bannerAccent,
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
    ) {
        item(key = "banner", contentType = "banner") { HubBanner(bannerAccent) }
        itemsIndexed(LinksHubEntry.entries, key = { _, entry -> entry.name }, contentType = { _, _ -> "card" }) { index, entry ->
            HubCard(
                entry = entry,
                figures = LinksHubSummary.figures(entry, state.figures),
                onOpen = { onOpen(entry) },
                onCreate = { onCreate(entry) },
                modifier = Modifier.staggeredAppear(index),
            )
        }
    }
}

@Composable
private fun HubBanner(accent: androidx.compose.ui.graphics.Color) {
    Row(
        modifier = Modifier.fillMaxWidth().linkSurface(accent, radius = 16.dp).padding(MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.AddLink, contentDescription = null, tint = accent, modifier = Modifier.size(32.dp))
        Column {
            Text(
                stringResource(R.string.links_hub_banner_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                stringResource(R.string.links_hub_banner_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun HubCard(
    entry: LinksHubEntry,
    figures: LinksHubFigures?,
    onOpen: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = linkAccent(entry.accentHex)
    val haptics = rememberMeeshyHaptics()
    val title = stringResource(entry.titleRes())
    val createLabel = entry.createLabelRes()?.let { stringResource(it) }
    val openCard = { haptics.light(); onOpen() }
    val createCard = { haptics.medium(); onCreate() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .linkSurface(accent)
            .clickable(onClickLabel = title, onClick = openCard)
            .semantics {
                if (createLabel != null) customActions = listOf(CustomAccessibilityAction(createLabel) { createCard(); true })
            }
            .padding(MeeshySpacing.mdPlus)
            .animateContentSize(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LinkIconBadge(icon = entry.icon(), accent = accent)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
            Text(
                stringResource(entry.descriptionRes()),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 2,
            )
            figures?.let { FiguresLine(entry, it, accent) }
        }
        if (entry.canCreate) {
            IconButton(onClick = createCard) {
                Icon(MeeshyIcons.AddCircleFilled, contentDescription = null, tint = accent, modifier = Modifier.size(28.dp))
            }
        }
        Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun FiguresLine(entry: LinksHubEntry, figures: LinksHubFigures, accent: androidx.compose.ui.graphics.Color) {
    val (firstLabel, secondLabel) = entry.figureLabels()
    Text(
        text = "${animatedCount(figures.count)} ${stringResource(firstLabel)} · ${animatedCount(figures.engagement)} ${stringResource(secondLabel)}",
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = accent,
        maxLines = 1,
    )
}

private fun LinksHubEntry.icon(): ImageVector = when (this) {
    LinksHubEntry.SHARE -> MeeshyIcons.Link
    LinksHubEntry.TRACKING -> MeeshyIcons.ChartLine
    LinksHubEntry.COMMUNITY -> MeeshyIcons.Groups
    LinksHubEntry.AFFILIATE -> MeeshyIcons.Gift
}

private fun LinksHubEntry.titleRes(): Int = when (this) {
    LinksHubEntry.SHARE -> R.string.links_hub_share_title
    LinksHubEntry.TRACKING -> R.string.links_hub_tracking_title
    LinksHubEntry.COMMUNITY -> R.string.links_hub_community_title
    LinksHubEntry.AFFILIATE -> R.string.links_hub_affiliate_title
}

private fun LinksHubEntry.descriptionRes(): Int = when (this) {
    LinksHubEntry.SHARE -> R.string.links_hub_share_description
    LinksHubEntry.TRACKING -> R.string.links_hub_tracking_description
    LinksHubEntry.COMMUNITY -> R.string.links_hub_community_description
    LinksHubEntry.AFFILIATE -> R.string.links_hub_affiliate_description
}

private fun LinksHubEntry.createLabelRes(): Int? = when (this) {
    LinksHubEntry.SHARE -> R.string.links_hub_share_create_a11y
    LinksHubEntry.TRACKING -> R.string.links_hub_tracking_create_a11y
    LinksHubEntry.COMMUNITY -> null
    LinksHubEntry.AFFILIATE -> R.string.links_hub_affiliate_create_a11y
}

private fun LinksHubEntry.figureLabels(): Pair<Int, Int> = when (this) {
    LinksHubEntry.SHARE -> R.string.my_share_links_stats_total to R.string.my_share_links_stats_uses
    LinksHubEntry.TRACKING -> R.string.links_tracking_stats_links to R.string.links_tracking_stats_clicks
    LinksHubEntry.COMMUNITY -> R.string.links_community_stat_groups to R.string.links_community_stat_members
    LinksHubEntry.AFFILIATE -> R.string.links_affiliate_stat_links to R.string.links_affiliate_stat_signups
}
