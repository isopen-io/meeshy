package me.meeshy.ui.sticker

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.StickerSheetPage
import me.meeshy.sdk.model.StickerSheetPageModel
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val TabHeight = 48.dp
private val ScrollingEntryWidth = 72.dp
private val CapsulePadding = MeeshySpacing.xs

/**
 * La barre d'onglets en capsule — le glyphe ET le mot. Jusqu'à six entrées elle se partage la largeur et
 * la pastille GLISSE vers l'onglet choisi ; au-delà elle défile (un onglet par pack installé en ajoute
 * autant que de packs). Un tap pose un haptique léger.
 */
@Composable
internal fun StickerSheetTabBar(
    entries: List<StickerSheetTabEntry>,
    selection: StickerSheetPage,
    onSelect: (StickerSheetPage) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val select: (StickerSheetPage) -> Unit = { page ->
        if (page != selection) haptics.light()
        onSelect(page)
    }
    val capsule = modifier
        .padding(horizontal = MeeshySpacing.lg)
        .fillMaxWidth()
        .clip(RoundedCornerShape(MeeshyRadius.pill))
        .background(MeeshyTheme.tokens.surfaceFill)
    if (StickerSheetPageModel.tabBarScrolls(entries.size)) {
        val scroll = rememberScrollState()
        val index = entries.indexOfFirst { it.page == selection }.coerceAtLeast(0)
        val entryWidthPx = with(LocalDensity.current) { ScrollingEntryWidth.roundToPx() }
        LaunchedEffect(index) { scroll.animateScrollTo(index * entryWidthPx) }
        Row(
            modifier = capsule.horizontalScroll(scroll).padding(CapsulePadding),
            horizontalArrangement = Arrangement.spacedBy(CapsulePadding),
        ) {
            entries.forEach { entry ->
                StickerTab(entry, entry.page == selection, Modifier.width(ScrollingEntryWidth), select, ownPill = true)
            }
        }
    } else {
        BoxWithConstraints(modifier = capsule.padding(CapsulePadding)) {
            val slot: Dp = maxWidth / entries.size
            val index = entries.indexOfFirst { it.page == selection }.coerceAtLeast(0)
            val spec: AnimationSpec<Dp> = if (LocalReduceMotion.current) snap() else MeeshyMotion.springDefault()
            val pillOffset by animateDpAsState(targetValue = slot * index, animationSpec = spec, label = "stickerTabPill")
            Box(
                Modifier
                    .offset(x = pillOffset)
                    .width(slot)
                    .height(TabHeight)
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(pillColor()),
            )
            Row {
                entries.forEach { entry ->
                    StickerTab(entry, entry.page == selection, Modifier.width(slot), select, ownPill = false)
                }
            }
        }
    }
}

@Composable
private fun pillColor(): Color =
    if (MeeshyTheme.isDark) Color.White.copy(alpha = 0.12f) else Color.White.copy(alpha = 0.85f)

@Composable
private fun StickerTab(
    entry: StickerSheetTabEntry,
    selected: Boolean,
    modifier: Modifier,
    onSelect: (StickerSheetPage) -> Unit,
    ownPill: Boolean,
) {
    val ink = if (selected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary
    val pill by animateColorAsState(
        targetValue = if (ownPill && selected) pillColor() else Color.Transparent,
        label = "stickerTabOwnPill",
    )
    Column(
        modifier = modifier
            .height(TabHeight)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(pill)
            .clickable { onSelect(entry.page) }
            .semantics(mergeDescendants = true) {
                role = Role.Tab
                this.selected = selected
                contentDescription = entry.title
            }
            .padding(horizontal = MeeshySpacing.xs),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(entry.icon, contentDescription = null, tint = ink, modifier = Modifier.size(18.dp))
        Text(
            text = entry.title,
            color = ink,
            fontSize = 10.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
