package me.meeshy.app.conversations.links

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val ACCENT_HEX = "FBBF24"
private const val COPIED_FEEDBACK_MS = 2_000L

/** La fiche d'un lien de communauté (iOS `CommunityLinkDetailView`) : carte d'identité, copier / partager / identifier, membres et statut, informations. */
@Composable
fun CommunityLinkDetailScreen(
    onBack: () -> Unit,
    viewModel: CommunityLinkDetailViewModel = hiltViewModel(),
) {
    val link by viewModel.link.collectAsStateWithLifecycle()
    val notFound by viewModel.notFound.collectAsStateWithLifecycle()
    val accent = linkAccent(ACCENT_HEX)
    val actions = rememberLinkActions()
    val haptics = rememberMeeshyHaptics()
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(COPIED_FEEDBACK_MS); copied = false } }

    LinksPage(
        title = link?.name.orEmpty(),
        accent = accent,
        onBack = onBack,
        isRefreshing = false,
        onRefresh = {},
    ) {
        val current = link
        if (current == null) {
            item(key = "loading", contentType = "loading") {
                Column(Modifier.fillMaxWidth().padding(MeeshySpacing.xxxl), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (notFound) Text(stringResource(R.string.links_community_empty_title), color = MeeshyTheme.tokens.textSecondary)
                    else CircularProgressIndicator(color = accent)
                }
            }
            return@LinksPage
        }
        item(key = "header", contentType = "header") { CommunityHeader(current, accent) }
        item(key = "actions", contentType = "actions") {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                LinkActionTile(
                    label = stringResource(R.string.links_common_copy),
                    icon = if (copied) MeeshyIcons.Check else MeeshyIcons.Copy,
                    color = if (copied) MeeshyTheme.tokens.success else accent,
                    onClick = { actions.copy(current.joinUrl); copied = true },
                    modifier = Modifier.weight(1f),
                )
                LinkActionTile(stringResource(R.string.links_common_share), MeeshyIcons.Share, accent, { actions.share(current.joinUrl) }, Modifier.weight(1f))
                LinkActionTile(
                    label = stringResource(R.string.links_community_identify),
                    icon = MeeshyIcons.Document,
                    color = MeeshyPalette.Indigo500,
                    onClick = { actions.copy(current.identifier); haptics.light() },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        item(key = "stats", contentType = "stats") {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                LinkStatTile(MeeshyIcons.PersonFilled, current.memberCount, stringResource(R.string.links_community_detail_members), accent, Modifier.weight(1f))
                StatusTile(current.isActive, accent, Modifier.weight(1f))
            }
        }
        item(key = "info", contentType = "info") { CommunityInfo(current, accent) }
    }
}

@Composable
private fun CommunityHeader(link: CommunityLink, accent: androidx.compose.ui.graphics.Color) {
    Column(
        modifier = Modifier.fillMaxWidth().linkSurface(accent, radius = 20.dp).padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        LinkIconBadge(MeeshyIcons.Groups, accent, size = 60.dp)
        Text(link.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary)
        Text(link.joinUrl, style = MaterialTheme.typography.labelMedium, fontFamily = FontFamily.Monospace, color = MeeshyTheme.tokens.textSecondary, textAlign = TextAlign.Center, maxLines = 2)
    }
}

@Composable
private fun StatusTile(active: Boolean, accent: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    val tint = if (active) MeeshyTheme.tokens.success else MeeshyPalette.Neutral500
    Column(
        modifier = modifier.linkSurface(tint).padding(vertical = MeeshySpacing.mdPlus, horizontal = MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        androidx.compose.material3.Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = tint, modifier = Modifier.padding(2.dp))
        Text(
            stringResource(if (active) R.string.links_common_active else R.string.links_common_inactive),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(stringResource(R.string.links_community_detail_status), style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun CommunityInfo(link: CommunityLink, accent: androidx.compose.ui.graphics.Color) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        LinksSectionTitle(stringResource(R.string.links_community_detail_informations))
        Column(Modifier.fillMaxWidth().linkSurface(accent, radius = 14.dp)) {
            InfoRow(stringResource(R.string.links_community_detail_identifier), link.identifier)
            HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.15f))
            InfoRow(stringResource(R.string.links_community_detail_full_link), link.joinUrl)
            isoToEpochMillisOrNull(link.createdAt)?.takeIf { it > 0 }?.let {
                HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = 0.15f))
                InfoRow(stringResource(R.string.links_community_detail_created_at), ShareLinkDateFormat.dayAndTime(it))
            }
        }
    }
}
