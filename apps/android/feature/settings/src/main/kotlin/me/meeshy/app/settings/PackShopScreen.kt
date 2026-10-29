package me.meeshy.app.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Locale
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

private val TargetSize = 48.dp
private val CoverSide = 56.dp
private const val SKELETON_ROWS = 3

/**
 * Réglages › Packs et téléchargements — la Boutique (iOS `PacksSettingsView` + `UnifiedShopView`) : des puces par
 * domaine, le solde de Meeshes, puis les packs avec leur prix, leur possession et le geste « Acheter ».
 *
 * Cache d'abord : à froid des rangées fantômes, jamais un indicateur sur un cache non vide. **Rien n'est affiché qui ne
 * vienne du serveur** — le solde et la possession sont ceux de sa dernière réponse, l'achat ne change rien avant elle.
 */
@Composable
fun PackShopScreen(
    onBack: () -> Unit,
    viewModel: PackShopViewModel = hiltViewModel(),
) {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val language = remember { Locale.getDefault().language }
    val insufficient = stringResource(R.string.pack_shop_error_insufficient)
    val generic = stringResource(R.string.pack_shop_failed)
    val failureText = when (ui.failure) {
        PackShopFailure.INSUFFICIENT_MEESHES -> insufficient
        PackShopFailure.GENERIC -> generic
        null -> null
    }

    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(R.string.settings_packs_title),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                DomainChips(ui.domains, ui.selected) { domain ->
                    haptics.light()
                    viewModel.select(domain)
                }
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    ui.balance?.let { Balance(it) }
                    failureText?.let { FailureLine(it) }
                    Shelf(ui, language, onRetry = { haptics.light(); viewModel.retry() }) { slug ->
                        haptics.light()
                        viewModel.buy(slug)
                    }
                }
            }
        }
    }
}

@Composable
private fun Balance(balance: Int) {
    Text(
        text = stringResource(R.string.pack_shop_balance, balance),
        style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
        color = MeeshyTheme.tokens.textSecondary,
    )
}

@Composable
private fun FailureLine(text: String) {
    Text(
        text = text,
        style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
        color = MeeshyTheme.tokens.errorInk,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun DomainChips(
    domains: List<AppearancePackDomain>,
    selected: AppearancePackDomain,
    onSelect: (AppearancePackDomain) -> Unit,
) {
    val label = stringResource(R.string.settings_packs_domain)
    Row(
        modifier = Modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        domains.forEach { domain ->
            val isSelected = domain == selected
            Box(
                modifier = Modifier
                    .sizeIn(minHeight = TargetSize, minWidth = TargetSize)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(if (isSelected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.controlFill)
                    .clickable(role = Role.Tab) { onSelect(domain) }
                    .padding(horizontal = 14.dp)
                    .semantics { this.selected = isSelected },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(domain.titleRes()),
                    style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
                    color = if (isSelected) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary,
                )
            }
        }
    }
}

private fun AppearancePackDomain.titleRes(): Int = when (this) {
    AppearancePackDomain.WALLPAPER -> R.string.pack_shop_domain_wallpaper
    AppearancePackDomain.AVATAR_RING -> R.string.pack_shop_domain_avatar_ring
    AppearancePackDomain.BANNER -> R.string.pack_shop_domain_banner
    AppearancePackDomain.BANNER_FRAME -> R.string.pack_shop_domain_banner_frame
}

@Composable
private fun Shelf(ui: PackShopUiState, language: String, onRetry: () -> Unit, onBuy: (String) -> Unit) {
    val packs = ui.packs
    when {
        ui.loadFailed -> LoadFailure(onRetry)
        packs == null -> repeat(SKELETON_ROWS) { Skeleton() }
        packs.isEmpty() -> Text(
            text = stringResource(R.string.pack_shop_empty),
            style = meeshyText(MeeshyFontSize.subhead),
            color = MeeshyTheme.tokens.textSecondary,
        )
        else -> packs.forEach { pack ->
            PackRow(
                pack = pack,
                language = language,
                busy = pack.slug in ui.pendingSlugs,
                focused = pack.slug == ui.focusTarget,
                onBuy = { onBuy(pack.slug) },
            )
        }
    }
}

@Composable
private fun LoadFailure(onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = stringResource(R.string.pack_shop_error_load),
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
            color = MeeshyTheme.tokens.errorInk,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        Box(
            modifier = Modifier
                .sizeIn(minHeight = TargetSize, minWidth = TargetSize)
                .clip(RoundedCornerShape(percent = 50))
                .background(MeeshyTheme.tokens.controlFill)
                .clickable(role = Role.Button, onClick = onRetry)
                .padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.pack_shop_retry),
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}

/** Cache vide au premier lancement : des rangées fantômes, jamais un indicateur au milieu d'un écran vide. */
@Composable
private fun Skeleton() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(CoverSide + 16.dp)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.surfaceFill)
            .clearAndSetSemantics { },
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PackRow(pack: ShopPack, language: String, busy: Boolean, focused: Boolean, onBuy: () -> Unit) {
    val requester = remember { BringIntoViewRequester() }
    LaunchedEffect(focused) { if (focused) requester.bringIntoView() }
    val name = pack.localizedName(language)
    val description = pack.localizedDescription(language)
    val outline = if (focused) Modifier.border(BorderStroke(2.dp, MeeshyPalette.Indigo500), RoundedCornerShape(MeeshyRadius.md)).padding(6.dp) else Modifier
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .bringIntoViewRequester(requester)
            .then(outline)
            .semantics { this.selected = focused },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(CoverSide)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(MeeshyTheme.tokens.surfaceFill)
                .clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Shopping, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(24.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = name,
                style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold),
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            pack.author?.takeIf { it.isNotBlank() }?.let {
                Text(stringResource(R.string.pack_shop_by, it), style = meeshyText(MeeshyFontSize.small), color = MeeshyTheme.tokens.textSecondary)
            }
            if (pack.meeshes != null && pack.isOwned) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
                    Text(stringResource(R.string.pack_shop_owned), style = meeshyText(MeeshyFontSize.small, FontWeight.Medium), color = MeeshyTheme.tokens.textSecondary)
                }
            }
            if (description.isNotBlank()) {
                Text(
                    text = description,
                    style = meeshyText(MeeshyFontSize.small),
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        when {
            pack.isLocked && !pack.isOwned -> LockedBadge()
            pack.canBuy -> BuyButton(name, pack.meeshes ?: 0, busy, onBuy)
        }
    }
}

@Composable
private fun LockedBadge() {
    Row(
        modifier = Modifier.heightIn(min = TargetSize).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(MeeshyIcons.LockFilled, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
        Text(stringResource(R.string.pack_shop_locked), style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold), color = MeeshyTheme.tokens.textSecondary)
    }
}

/** « Acheter · 90 » : le prix est celui que le serveur sert, le débit n'a lieu qu'à sa réponse. */
@Composable
private fun BuyButton(name: String, price: Int, busy: Boolean, onBuy: () -> Unit) {
    val spoken = stringResource(R.string.pack_shop_buy_a11y, name, price)
    Box(
        modifier = Modifier
            .sizeIn(minHeight = TargetSize, minWidth = TargetSize)
            .alpha(if (busy) 0.6f else 1f)
            .clip(RoundedCornerShape(percent = 50))
            .background(MeeshyPalette.Indigo500)
            .clickable(enabled = !busy, role = Role.Button, onClick = onBuy)
            .padding(horizontal = 14.dp)
            .semantics { contentDescription = spoken; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.pack_shop_buy_price, price),
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
            color = MeeshyPalette.White,
        )
    }
}
