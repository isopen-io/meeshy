package me.meeshy.ui.sticker

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.StickerSheetPage
import me.meeshy.sdk.model.StickerSheetPageModel
import me.meeshy.sdk.model.StickerSheetTab
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import me.meeshy.sdk.sticker.StickerUsageStore
import me.meeshy.ui.R
import me.meeshy.ui.component.BrandLogo
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le contenu de la feuille de stickers — poignée exclue (la pose [StickerSheetHost]) : fond dégradé indigo,
 * en-tête (marque, « Stickers », croix), barre d'onglets capsule, puis UNE liste paresseuse à en-têtes de
 * section. Changer d'onglet repart du haut ; l'onglet choisi retombe sur le premier s'il disparaît (un pack
 * retiré). La [destination] décide ce que devient un choix ; poser alimente les récents.
 *
 * [accent] est l'accent du contexte (celui de la conversation, passé en paramètre — jamais calculé ici).
 */
@Composable
public fun StickerSheet(
    capabilities: StickerCapabilities,
    usage: StickerUsageStore,
    destination: StickerPlacementDestination,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accountId: String? = null,
    accent: Color = MeeshyPalette.Indigo500,
) {
    remember(accountId) { usage.adopt(accountId) }
    val haptics = rememberMeeshyHaptics()
    val recents by usage.recents.collectAsState()
    val favorites by usage.favorites.collectAsState()

    val pages = remember(capabilities) {
        StickerSheetPageModel.offered(
            hasMee = capabilities.hasMee,
            installed = capabilities.installedPacks?.map { it.toInfo() },
            hasPackPick = capabilities.packContent != null,
            hasShop = capabilities.shop != null,
            hasCustom = capabilities.custom != null,
        )
    }
    var chosenId by rememberSaveable { mutableStateOf(StickerSheetPage.Fixed(StickerSheetTab.SEARCH).id) }
    val selected = StickerSheetPageModel.resolved(pages.firstOrNull { it.id == chosenId } ?: pages.first(), pages)
    val entries = stickerSheetTabEntries(pages, capabilities)
    var query by rememberSaveable { mutableStateOf("") }

    val actions = remember(usage, destination, haptics) {
        StickerCellActions(
            onPick = { entry ->
                usage.noteUse(entry)
                destination.place(StickerSheetChoice.from(entry))
                onDismiss()
            },
            isFavorite = usage::isFavorite,
            onToggleFavorite = usage::toggleFavorite,
            haptics = haptics,
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MeeshyGradients.mainBackground(MeeshyTheme.isDark)),
    ) {
        StickerSheetHeader(onDismiss)
        StickerSheetTabBar(entries, selected, onSelect = { chosenId = it.id })
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val packContent = capabilities.packContent
            when {
                selected is StickerSheetPage.Pack && packContent != null -> packContent(selected.slug)
                selected == StickerSheetPage.Fixed(StickerSheetTab.CUSTOM) && capabilities.custom != null -> capabilities.custom.invoke()
                selected == StickerSheetPage.Shop && capabilities.shop != null -> capabilities.shop.invoke()
                else -> StickerSheetGrid(
                    page = selected,
                    capabilities = capabilities,
                    actions = actions,
                    recents = recents,
                    favorites = favorites,
                    query = query,
                    onQueryChange = { query = it },
                    packEntries = entries.filter { it.page.isPack },
                    onSelectPage = { chosenId = it.id },
                    accent = accent,
                )
            }
        }
    }
}

@Composable
private fun StickerSheetHeader(onDismiss: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        BrandLogo(size = 28.dp)
        Text(
            text = stringResource(R.string.story_sticker_title),
            color = MeeshyTheme.tokens.textPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.sticker_sheet_close),
                tint = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun StickerSheetGrid(
    page: StickerSheetPage,
    capabilities: StickerCapabilities,
    actions: StickerCellActions,
    recents: List<StickerUsageEntry>,
    favorites: List<StickerUsageEntry>,
    query: String,
    onQueryChange: (String) -> Unit,
    packEntries: List<StickerSheetTabEntry>,
    onSelectPage: (StickerSheetPage) -> Unit,
    accent: Color,
) {
    val smileysTitle = stringResource(R.string.sticker_sheet_tab_smileys)
    val noResult = stringResource(R.string.sticker_sheet_search_empty)
    // `key(page)` : changer d'onglet reconstruit la grille, donc repart du haut.
    androidx.compose.runtime.key(page.id) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(STICKER_EMOJI_COLUMNS),
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = MeeshySpacing.xl, end = MeeshySpacing.xl, top = MeeshySpacing.xs, bottom = MeeshySpacing.xxxl,
            ),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            when ((page as? StickerSheetPage.Fixed)?.tab) {
                StickerSheetTab.FAVORITES -> usageSection(
                    "favorites", favorites, capabilities, actions,
                    Icons.Filled.Star, R.string.sticker_sheet_tab_favorites, R.string.sticker_sheet_favorites_empty, accent,
                )
                StickerSheetTab.RECENTS -> usageSection(
                    "recents", recents, capabilities, actions,
                    Icons.Filled.Schedule, R.string.sticker_sheet_tab_recents, R.string.sticker_sheet_recents_empty, accent,
                )
                StickerSheetTab.SMILEYS -> capabilities.emojiCategories.forEach { category ->
                    stickerSectionHeader("cat:${category.id}", category.title)
                    stickerEmojiCells("cat:${category.id}", category.emojis, actions)
                }
                else -> stickerSearchContent(
                    query, onQueryChange, capabilities, packEntries, onSelectPage, actions, smileysTitle, noResult,
                )
            }
            stickerShopLink(capabilities)
        }
    }
}

/** Favoris et Récents : les entrées que l'hôte sait dessiner (une orpheline disparaît sans être purgée), ou l'état vide. */
private fun LazyGridScope.usageSection(
    prefix: String,
    entries: List<StickerUsageEntry>,
    capabilities: StickerCapabilities,
    actions: StickerCellActions,
    emptyIcon: androidx.compose.ui.graphics.vector.ImageVector,
    titleRes: Int,
    emptyRes: Int,
    accent: Color,
) {
    val shown = entries.filter(capabilities::knows)
    if (shown.isEmpty()) {
        item(key = "$prefix:empty", span = { GridItemSpan(maxLineSpan) }, contentType = "empty") {
            Box(Modifier.fillMaxWidth().heightIn(min = 240.dp)) {
                MeeshyEmptyState(
                    icon = emptyIcon,
                    title = stringResource(titleRes),
                    subtitle = stringResource(emptyRes),
                    accent = accent,
                    compact = true,
                )
            }
        }
        return
    }
    items(shown.size, key = { "$prefix:${shown[it].id}" }, contentType = { shown[it].kind }) { index ->
        val entry = shown[index]
        if (entry.kind == StickerUsageEntry.Kind.EMOJI) {
            StickerEmojiCell(entry.value, actions)
        } else {
            StickerEntryCell(entry, entry.value, actions) {
                capabilities.entryContent?.invoke(entry, Modifier)
            }
        }
    }
}

private fun LazyGridScope.stickerShopLink(capabilities: StickerCapabilities) {
    val open = capabilities.onOpenShop ?: return
    item(key = "shop:more", span = { GridItemSpan(maxLineSpan) }, contentType = "shopMore") {
        TextButton(onClick = open, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(stringResource(R.string.sticker_sheet_shopMore), color = MeeshyPalette.Indigo500)
        }
    }
}
