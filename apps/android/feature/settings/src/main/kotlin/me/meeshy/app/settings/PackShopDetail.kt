package me.meeshy.app.settings

import android.text.format.Formatter
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.packs.PackRowPresentation
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

private const val GRID_COLUMNS = 3
private val CloseTarget = 48.dp

/**
 * Ce qui recouvre la boutique (#16269) : la fiche d'un pack ou un élément en plein écran. La boutique reste composée
 * dessous — refermer la retrouve à la même position de défilement.
 */
@Composable
internal fun PackShopBrowseLayer(
    shop: PackShopUiState,
    browsing: PackShopBrowseUiState,
    language: String,
    browse: PackShopBrowseViewModel,
    onToggleInstall: (String) -> Unit,
    onBuy: (String) -> Unit,
) {
    AnimatedContent(
        targetState = browsing.stack.top,
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        contentKey = { route -> route?.let { "${if (it is ShopBrowseRoute.Detail) "detail" else "viewer"}.${it.domain.wire}.${it.slug}" } },
        label = "shop-browse",
    ) { route ->
        val packs = route?.let { shop.shop?.packs(it.domain) }.orEmpty()
        val pack = route?.let { r -> packs.firstOrNull { it.slug == r.slug } }
        when (route) {
            null -> Unit
            is ShopBrowseRoute.Detail -> PackShopDetail(
                pack = pack ?: ShopPack(slug = route.slug),
                language = language,
                contents = browsing.contentsOf(route.domain, route.slug),
                me = browsing.me,
                busy = route.slug in shop.pendingSlugs,
                onClose = { browse.back() },
                onToggleInstall = { onToggleInstall(route.slug) },
                onBuy = { onBuy(route.slug) },
                onOpenItem = { index -> browse.openViewer(route.domain, route.slug, index) },
            )
            is ShopBrowseRoute.Viewer -> PackShopViewer(
                route = route,
                pack = pack,
                packName = pack?.localizedName(language) ?: route.slug,
                contents = browsing.contentsOf(route.domain, route.slug),
                others = ShopBrowseRules.otherProposals(packs, route.slug, browsing.contents[route.domain].orEmpty()),
                me = browsing.me,
                equipFailed = browsing.equipFailed,
                busy = route.slug in shop.pendingSlugs,
                onSettle = browse::settle,
                onClose = { browse.back() },
                onEquip = browse::equip,
                onInstall = { onToggleInstall(route.slug) },
                onProposal = browse::showProposal,
            )
        }
    }
}

/** La fiche d'un pack : sa couverture, son éditeur, son poids, son état, son geste, puis ses éléments en grille. */
@Composable
internal fun PackShopDetail(
    pack: ShopPack,
    language: String,
    contents: ShopPackContents?,
    me: ShopViewerMe,
    busy: Boolean,
    onClose: () -> Unit,
    onToggleInstall: () -> Unit,
    onBuy: () -> Unit,
    onOpenItem: (Int) -> Unit,
) {
    val name = pack.localizedName(language)
    val presentation = remember(pack) { PackRowPresentation.of(pack) }
    Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary)) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            CloseButton(onClose)
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
                Cover(pack, side = 96.dp)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(name, style = meeshyText(MeeshyFontSize.title3, FontWeight.Bold), color = MeeshyTheme.tokens.textPrimary, modifier = Modifier.semantics { heading() })
                    pack.author?.takeIf { it.isNotBlank() }?.let {
                        Text(stringResource(R.string.pack_shop_by, it), style = meeshyText(MeeshyFontSize.subhead), color = MeeshyTheme.tokens.textSecondary)
                    }
                    PackFacts(pack, contents)
                }
            }
            pack.localizedDescription(language).takeIf { it.isNotBlank() }?.let {
                Text(it, style = meeshyText(MeeshyFontSize.subhead), color = MeeshyTheme.tokens.textSecondary)
            }
            PackAction(presentation.action, name, busy, onBuy, onToggleInstall)
            Text(
                stringResource(R.string.pack_shop_detail_items),
                style = meeshyText(MeeshyFontSize.headline, FontWeight.SemiBold),
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            ItemGrid(contents, me, onOpenItem)
        }
    }
}

/** L'état, le poids et — s'il existe — le prix. */
@Composable
private fun PackFacts(pack: ShopPack, contents: ShopPackContents?) {
    val context = LocalContext.current
    val state = when (ShopBrowseRules.packState(pack, contents)) {
        ShopPackState.INSTALLED -> R.string.pack_shop_state_installed
        ShopPackState.EMBEDDED -> R.string.pack_shop_state_embedded
        ShopPackState.TO_DOWNLOAD -> R.string.pack_shop_state_to_download
    }
    val ready = contents as? ShopPackContents.Ready
    val weight = when {
        ready?.embedded == true && (ready.bytes ?: 0L) == 0L -> null
        (ready?.bytes ?: 0L) > 0L -> Formatter.formatShortFileSize(context, ready?.bytes ?: 0L)
        else -> null
    }
    val facts = listOfNotNull(
        stringResource(state),
        weight,
        pack.meeshes?.let { stringResource(R.string.pack_shop_detail_price, it) },
    )
    Text(facts.joinToString(" · "), style = meeshyText(MeeshyFontSize.small, FontWeight.Medium), color = MeeshyTheme.tokens.textSecondary)
}

@Composable
private fun ItemGrid(contents: ShopPackContents?, me: ShopViewerMe, onOpenItem: (Int) -> Unit) {
    when (contents) {
        null -> Box(Modifier.fillMaxWidth().aspectRatio(GRID_COLUMNS.toFloat()).clip(RoundedCornerShape(MeeshyRadius.md)).background(MeeshyTheme.tokens.surfaceFill))
        ShopPackContents.DownloadRequired -> ShopItemStage(null, me, compact = false, animates = false, modifier = Modifier.fillMaxWidth().aspectRatio(2f))
        is ShopPackContents.Ready -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            contents.items.withIndex().chunked(GRID_COLUMNS).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    row.forEach { (index, item) -> ItemTile(item, me, Modifier.weight(1f)) { onOpenItem(index) } }
                    repeat(GRID_COLUMNS - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

/** Une vignette de la grille : l'élément posé sur ce qu'il décore, son nom ; un toucher l'ouvre en plein écran. */
@Composable
internal fun ItemTile(item: ShopItem, me: ShopViewerMe, modifier: Modifier, onOpen: () -> Unit) {
    val spoken = stringResource(R.string.pack_shop_open_item_a11y, item.name)
    Column(
        modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onOpen)
            .semantics(mergeDescendants = true) { contentDescription = spoken; role = Role.Button }
            .padding(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        ShopItemStage(
            item, me, compact = true, animates = false,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .background(MeeshyTheme.tokens.surfaceFill),
        )
        Text(item.name, style = meeshyText(MeeshyFontSize.small, FontWeight.Medium), color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
    }
}

@Composable
internal fun CloseButton(onClose: () -> Unit, tint: androidx.compose.ui.graphics.Color = MeeshyTheme.tokens.textPrimary) {
    val label = stringResource(R.string.pack_shop_close)
    Box(
        Modifier
            .size(CloseTarget)
            .clip(RoundedCornerShape(percent = 50))
            .background(MeeshyTheme.tokens.controlFill)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClose)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.Close, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
    }
}
