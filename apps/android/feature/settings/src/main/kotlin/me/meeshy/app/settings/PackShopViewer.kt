package me.meeshy.app.settings

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

private val ProposalSide = 72.dp
private val ActionTarget = 48.dp

/**
 * Un élément en plein écran (#16269) : posé sur ce qu'il décore, animé s'il est dynamique. Glisser horizontalement passe
 * d'un élément du pack à l'autre (n / N) ; pincer zoome de ×1 à ×4, le double toucher bascule entre l'ajustement et ×2,
 * et le pager ne défile pas tant que l'élément est zoomé. ✕, le retour système ou un glissement vers le bas ramènent là
 * d'où on l'a ouvert. « Équiper » applique l'élément en un geste ; « Autres propositions » montre les autres packs du
 * même domaine.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun PackShopViewer(
    route: ShopBrowseRoute.Viewer,
    pack: ShopPack?,
    packName: String,
    contents: ShopPackContents?,
    others: List<ShopItem>,
    me: ShopViewerMe,
    equipFailed: Boolean,
    busy: Boolean,
    onSettle: (Int) -> Unit,
    onClose: () -> Unit,
    onEquip: (ShopItem) -> Unit,
    onInstall: () -> Unit,
    onProposal: (ShopItem) -> Unit,
) {
    val items = (contents as? ShopPackContents.Ready)?.items.orEmpty()
    val count = items.size.coerceAtLeast(1)
    val pager = rememberPagerState(initialPage = ShopBrowseRules.clampedIndex(route.index, items.size)) { count }
    var zoom by remember(route.slug) { mutableStateOf(ShopItemZoom()) }
    var dragY by remember { mutableFloatStateOf(0f) }
    var height by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(route.slug, items.size, route.index) {
        val target = ShopBrowseRules.clampedIndex(route.index, items.size)
        if (pager.currentPage != target) pager.scrollToPage(target)
    }
    LaunchedEffect(pager.currentPage) {
        zoom = ShopItemZoom()
        if (items.isNotEmpty()) onSettle(pager.currentPage)
    }
    val current = items.getOrNull(pager.currentPage)

    Box(
        Modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .onSizeChanged { height = it.height.toFloat() },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .graphicsLayer { translationY = dragY.coerceAtLeast(0f) }
                .statusBarsPadding()
                .navigationBarsPadding(),
        ) {
            ViewerTopBar(current?.name ?: packName, packName, pager.currentPage, items.size, onClose)
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .draggable(
                        orientation = Orientation.Vertical,
                        enabled = zoom.pagerScrolls,
                        state = rememberDraggableState { delta -> dragY = (dragY + delta).coerceAtLeast(0f) },
                        onDragStopped = {
                            if (ShopViewerDismiss.shouldDismiss(dragY, height)) onClose()
                            dragY = 0f
                        },
                    ),
            ) {
                when {
                    contents == null -> Unit
                    items.isEmpty() -> ShopItemStage(null, me, compact = false, animates = false, modifier = Modifier.fillMaxSize().padding(MeeshySpacing.lg))
                    else -> ItemPager(pager, items, me, zoom, onZoom = { zoom = it })
                }
            }
            ViewerFooter(current, pack, me, equipFailed, busy, others, onEquip, onInstall, onProposal)
        }
    }
}

@Composable
private fun ViewerTopBar(title: String, packName: String, page: Int, count: Int, onClose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        CloseButton(onClose)
        Column(Modifier.weight(1f)) {
            Text(title, style = meeshyText(MeeshyFontSize.headline, FontWeight.SemiBold), color = MeeshyTheme.tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
            Text(packName, style = meeshyText(MeeshyFontSize.small), color = MeeshyTheme.tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (count > 0) {
            val (n, total) = ShopBrowseRules.position(page, count)
            Text(
                stringResource(R.string.pack_shop_viewer_position, n, total),
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier
                    .clip(RoundedCornerShape(percent = 50))
                    .background(MeeshyTheme.tokens.controlFill)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ItemPager(pager: PagerState, items: List<ShopItem>, me: ShopViewerMe, zoom: ShopItemZoom, onZoom: (ShopItemZoom) -> Unit) {
    val scope = rememberCoroutineScope()
    val next = stringResource(R.string.pack_shop_viewer_next)
    val previous = stringResource(R.string.pack_shop_viewer_previous)
    val current = items.getOrNull(pager.currentPage)
    val (n, total) = ShopBrowseRules.position(pager.currentPage, items.size)
    val spoken = current?.let { stringResource(R.string.pack_shop_viewer_item_a11y, it.name, n, total) }.orEmpty()
    HorizontalPager(
        state = pager,
        userScrollEnabled = zoom.pagerScrolls,
        key = { items.getOrNull(it)?.id ?: it },
        contentPadding = PaddingValues(MeeshySpacing.lg),
        pageSpacing = MeeshySpacing.lg,
        modifier = Modifier.fillMaxSize().semantics {
            contentDescription = spoken
            customActions = listOfNotNull(
                CustomAccessibilityAction(next) { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) }; true }
                    .takeIf { pager.currentPage < items.size - 1 },
                CustomAccessibilityAction(previous) { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) }; true }
                    .takeIf { pager.currentPage > 0 },
            )
        },
    ) { page ->
        val focused = page == pager.currentPage
        ZoomablePage(zoom.takeIf { focused } ?: ShopItemZoom(), onZoom = { if (focused) onZoom(it) }) {
            ShopItemStage(items[page], me, compact = false, animates = focused, modifier = Modifier.fillMaxSize())
        }
    }
}

/** Pincer zoome (×1 à ×4), le double toucher bascule ×1 ↔ ×2 ; à ×1 un seul doigt reste au pager et au glissement vers le bas. */
@Composable
private fun ZoomablePage(zoom: ShopItemZoom, onZoom: (ShopItemZoom) -> Unit, content: @Composable () -> Unit) {
    var size by remember { mutableStateOf(IntSize.Zero) }
    val latest by androidx.compose.runtime.rememberUpdatedState(zoom)
    val report by androidx.compose.runtime.rememberUpdatedState(onZoom)
    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .onSizeChanged { size = it }
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { report(latest.doubleTapped()) }) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        val fingers = event.changes.count { it.pressed }
                        if (fingers >= 2 || !latest.pagerScrolls) {
                            val pan = event.calculatePan()
                            report(latest.pinched(event.calculateZoom(), pan.x, pan.y, size.width.toFloat(), size.height.toFloat()))
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            }
            .graphicsLayer {
                scaleX = zoom.scale
                scaleY = zoom.scale
                translationX = zoom.offsetX
                translationY = zoom.offsetY
            },
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun ViewerFooter(
    item: ShopItem?,
    pack: ShopPack?,
    me: ShopViewerMe,
    equipFailed: Boolean,
    busy: Boolean,
    others: List<ShopItem>,
    onEquip: (ShopItem) -> Unit,
    onInstall: () -> Unit,
    onProposal: (ShopItem) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        if (item != null) {
            Box(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg), contentAlignment = Alignment.Center) {
                EquipControl(item, ShopBrowseRules.offer(item, pack, me.decor), busy, onEquip, onInstall)
            }
        }
        if (equipFailed) {
            Text(
                stringResource(R.string.pack_shop_equip_failed),
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
                color = MeeshyTheme.tokens.errorInk,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg).semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        if (others.isNotEmpty()) {
            Text(
                stringResource(R.string.pack_shop_viewer_others),
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg).semantics { heading() },
            )
            LazyRow(
                contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                items(others, key = { it.id }) { other ->
                    ItemTile(other, me, Modifier.width(ProposalSide)) { onProposal(other) }
                }
            }
        }
    }
}

@Composable
private fun EquipControl(item: ShopItem, offer: ShopEquipOffer, busy: Boolean, onEquip: (ShopItem) -> Unit, onInstall: () -> Unit) {
    when (offer) {
        ShopEquipOffer.Equip -> PrimaryAction(stringResource(R.string.pack_shop_equip), stringResource(R.string.pack_shop_equip_a11y, item.name), enabled = true) { onEquip(item) }
        ShopEquipOffer.Equipped -> Row(
            Modifier.heightIn(min = ActionTarget),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
            Text(stringResource(R.string.pack_shop_equipped), style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold), color = MeeshyTheme.tokens.textPrimary)
        }
        ShopEquipOffer.InstallFirst -> InstallButton(item.name, installed = false, busy = busy, onClick = onInstall)
        ShopEquipOffer.PerConversation -> Text(
            stringResource(R.string.pack_shop_wallpaper_hint),
            style = meeshyText(MeeshyFontSize.subhead),
            color = MeeshyTheme.tokens.textSecondary,
        )
        ShopEquipOffer.Unavailable -> Unit
    }
}

@Composable
private fun PrimaryAction(label: String, spoken: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .sizeIn(minHeight = ActionTarget, minWidth = 160.dp)
            .clip(RoundedCornerShape(percent = 50))
            .background(MeeshyPalette.Indigo500)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 24.dp)
            .semantics { contentDescription = spoken; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold), color = MeeshyPalette.White)
    }
}
