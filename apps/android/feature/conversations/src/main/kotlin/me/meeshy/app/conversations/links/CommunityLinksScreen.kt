package me.meeshy.app.conversations.links

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val ACCENT_HEX = "FBBF24"

/**
 * Les liens de communauté (iOS `CommunityLinksView`) : les communautés que l'utilisateur administre,
 * chacune avec son lien de partage ; le « + » de l'en-tête ouvre la création d'une communauté.
 */
@Composable
fun CommunityLinksScreen(
    onBack: () -> Unit,
    onOpenLink: (CommunityLink) -> Unit,
    onCreateCommunity: () -> Unit,
    viewModel: CommunityLinksViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val accent = linkAccent(ACCENT_HEX)
    val actions = rememberLinkActions()
    val haptics = rememberMeeshyHaptics()
    val stats = state.stats

    LinksPage(
        title = stringResource(R.string.links_community_title),
        accent = accent,
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        actions = {
            IconButton(onClick = { haptics.light(); onCreateCommunity() }) {
                Icon(MeeshyIcons.AddCircleFilled, stringResource(R.string.links_community_create_a11y), tint = accent)
            }
        },
    ) {
        if (state.refreshFailed && state.hasLoaded) item(key = "failed", contentType = "banner") { LinkRefreshFailedBanner(viewModel::refresh) }
        item(key = "stats", contentType = "stats") {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                LinkStatTile(MeeshyIcons.Groups, stats.totalCommunities, R.plurals.links_count_groups, accent, Modifier.weight(1f))
                LinkStatTile(MeeshyIcons.CheckCircleFilled, stats.activeCommunities, stringResource(R.string.links_community_stat_active), accent, Modifier.weight(1f))
                LinkStatTile(MeeshyIcons.PersonFilled, stats.totalMembers, R.plurals.links_count_members, accent, Modifier.weight(1f))
            }
        }
        item(key = "section", contentType = "section") { LinksSectionTitle(stringResource(R.string.links_community_section_mine)) }
        when {
            !state.hasLoaded -> item(key = "skeleton", contentType = "skeleton") { LinkSkeletonRows(accent) }
            state.links.isEmpty() -> item(key = "empty", contentType = "empty") {
                LinkEmptyState(
                    MeeshyIcons.Groups,
                    stringResource(R.string.links_community_empty_title),
                    stringResource(R.string.links_community_empty_subtitle),
                    accent,
                )
            }
            else -> items(state.links, key = { it.id }, contentType = { "community" }) { link ->
                CommunityRow(
                    link = link,
                    accent = accent,
                    onOpen = { onOpenLink(link) },
                    onCopy = { actions.copy(link.joinUrl) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

@Composable
private fun CommunityRow(link: CommunityLink, accent: Color, onOpen: () -> Unit, onCopy: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().linkSurface(accent).clickable(onClick = onOpen).padding(MeeshySpacing.mdPlus),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LinkIconBadge(MeeshyIcons.Groups, accent, size = 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(link.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
            Text(
                pluralStringResource(R.plurals.links_community_row_subtitle, link.memberCount, link.memberCount, link.identifier),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
        IconButton(onClick = onCopy) {
            Icon(MeeshyIcons.Copy, stringResource(R.string.links_common_copy_link), tint = accent, modifier = Modifier.size(20.dp))
        }
        Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(20.dp))
    }
}
