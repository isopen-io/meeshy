package me.meeshy.app.conversations.links

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val ACCENT_HEX = "6366F1"

/**
 * Le parrainage (iOS `AffiliateView`) : trois chiffres animés, la liste des liens de parrainage avec
 * copie, partage système et suppression optimiste, et la feuille « Nouveau lien ». [openCreate] ouvre la
 * feuille dès l'arrivée (le « + » de la carte du hub).
 */
@Composable
fun AffiliateScreen(
    onBack: () -> Unit,
    openCreate: Boolean = false,
    viewModel: AffiliateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val accent = linkAccent(ACCENT_HEX)
    val actions = rememberLinkActions()
    val haptics = rememberMeeshyHaptics()

    var pendingCreate by rememberSaveable { mutableStateOf(openCreate) }
    LaunchedEffect(pendingCreate) {
        if (pendingCreate) { viewModel.openCreate(); pendingCreate = false }
    }
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                LinkEvent.Created, LinkEvent.Removed -> haptics.success()
                LinkEvent.RemoveFailed -> haptics.error()
            }
        }
    }

    LinksPage(
        title = stringResource(R.string.links_affiliate_title),
        accent = accent,
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        actions = {
            IconButton(onClick = { haptics.light(); viewModel.openCreate() }) {
                Icon(
                    MeeshyIcons.Add,
                    contentDescription = stringResource(R.string.links_affiliate_action_create),
                    tint = accent,
                )
            }
        },
    ) {
        if (state.refreshFailed) item(key = "failed", contentType = "banner") { LinkRefreshFailedBanner(viewModel::refresh) }
        item(key = "stats", contentType = "stats") {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                LinkStatTile(MeeshyIcons.Link, state.tokens.linkCount, R.plurals.links_count_links, accent, Modifier.weight(1f))
                LinkStatTile(MeeshyIcons.PersonVerified, state.tokens.signupCount, R.plurals.links_count_signups, accent, Modifier.weight(1f))
                LinkStatTile(MeeshyIcons.Touch, state.tokens.clickCount, stringResource(R.string.links_affiliate_stat_clicks), accent, Modifier.weight(1f))
            }
        }
        item(key = "section", contentType = "section") {
            LinksSectionTitle(stringResource(R.string.links_affiliate_section_my_links), accent)
        }
        when {
            !state.hasLoaded -> item(key = "skeleton", contentType = "skeleton") { LinkSkeletonRows(accent) }
            state.tokens.tokens.isEmpty() -> item(key = "empty", contentType = "empty") {
                LinkEmptyState(
                    MeeshyIcons.Link,
                    stringResource(R.string.links_affiliate_empty_title),
                    stringResource(R.string.links_affiliate_empty_subtitle),
                    accent,
                )
            }
            else -> items(state.tokens.tokens, key = { it.id }, contentType = { "token" }) { token ->
                TokenRow(
                    token = token,
                    accent = accent,
                    onCopy = { token.affiliateLink?.let(actions::copy) },
                    onShare = { token.affiliateLink?.let(actions::share) },
                    onDelete = { viewModel.delete(token.id) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }

    state.createSheet?.let { sheet ->
        AffiliateCreateSheet(sheet = sheet, accent = accent, viewModel = viewModel)
    }
}

@Composable
private fun TokenRow(
    token: AffiliateToken,
    accent: Color,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasLink = token.affiliateLink != null
    Row(
        modifier = modifier.fillMaxWidth().linkSurface(accent).padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(token.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
            Text(
                text = pluralStringResource(R.plurals.links_affiliate_token_clicks, token.clickCount, token.clickCount) + " · " +
                    pluralStringResource(R.plurals.links_affiliate_token_signups, token.referralCount, token.referralCount),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
        IconButton(onClick = onCopy, enabled = hasLink) {
            Icon(MeeshyIcons.Copy, stringResource(R.string.links_affiliate_action_copy), tint = accent, modifier = Modifier.size(20.dp).alpha(if (hasLink) 1f else 0.4f))
        }
        IconButton(onClick = onShare, enabled = hasLink) {
            Icon(MeeshyIcons.Share, stringResource(R.string.links_affiliate_action_share), tint = accent, modifier = Modifier.size(20.dp).alpha(if (hasLink) 1f else 0.4f))
        }
        IconButton(onClick = onDelete) {
            Icon(MeeshyIcons.Delete, stringResource(R.string.links_affiliate_action_delete), tint = MeeshyTheme.tokens.error, modifier = Modifier.size(20.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AffiliateCreateSheet(sheet: AffiliateCreateSheet, accent: Color, viewModel: AffiliateViewModel) {
    ModalBottomSheet(
        onDismissRequest = viewModel::dismissCreate,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = MeeshySpacing.lg).padding(bottom = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Text(
                stringResource(R.string.links_affiliate_create_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            LinkField(
                label = stringResource(R.string.links_affiliate_create_name_label),
                value = sheet.form.name,
                onValueChange = { value -> viewModel.editForm { it.copy(name = value) } },
                accent = accent,
                placeholder = stringResource(R.string.links_affiliate_create_name_placeholder),
            )
            LinkField(
                label = stringResource(R.string.links_affiliate_create_max_uses_label),
                value = sheet.form.maxUses,
                onValueChange = { value -> viewModel.editForm { it.withMaxUses(value) } },
                accent = accent,
                placeholder = stringResource(R.string.links_affiliate_create_max_uses_placeholder),
                keyboardType = KeyboardType.Number,
            )
            if (sheet.failed) LinkFormError(stringResource(R.string.links_affiliate_create_error))
            LinkPrimaryButton(
                text = stringResource(R.string.links_affiliate_create_button),
                enabled = sheet.form.isSubmittable,
                isLoading = sheet.isCreating,
                accent = accent,
                inProgressDescription = stringResource(R.string.links_tracking_create_in_progress),
                onClick = viewModel::create,
            )
        }
    }
}
