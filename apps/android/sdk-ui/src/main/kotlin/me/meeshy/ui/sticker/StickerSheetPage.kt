package me.meeshy.ui.sticker

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.StickerSheetPage
import me.meeshy.sdk.model.StickerSheetTab
import me.meeshy.ui.R

/** Une entrée de la barre d'onglets : la page, son mot et son glyphe. */
@Immutable
internal class StickerSheetTabEntry(
    val page: StickerSheetPage,
    val title: String,
    val icon: ImageVector,
)

/** Le mot d'une page fixe ; un pack porte le nom que le serveur lui donne. */
@Composable
internal fun stickerSheetTabEntries(
    pages: List<StickerSheetPage>,
    capabilities: StickerCapabilities,
): List<StickerSheetTabEntry> {
    val searchTitle = stringResource(R.string.sticker_sheet_tab_search)
    val favoritesTitle = stringResource(R.string.sticker_sheet_tab_favorites)
    val recentsTitle = stringResource(R.string.sticker_sheet_tab_recents)
    val customTitle = stringResource(R.string.sticker_sheet_tab_custom)
    val smileysTitle = stringResource(R.string.sticker_sheet_tab_smileys)
    val shopTitle = stringResource(R.string.sticker_sheet_tab_shop)
    return pages.map { page ->
        when (page) {
            is StickerSheetPage.Fixed -> when (page.tab) {
                StickerSheetTab.SEARCH -> StickerSheetTabEntry(page, searchTitle, Icons.Filled.Search)
                StickerSheetTab.FAVORITES -> StickerSheetTabEntry(page, favoritesTitle, Icons.Filled.Star)
                StickerSheetTab.RECENTS -> StickerSheetTabEntry(page, recentsTitle, Icons.Filled.Schedule)
                StickerSheetTab.CUSTOM -> StickerSheetTabEntry(page, customTitle, Icons.Filled.Brush)
                StickerSheetTab.SMILEYS -> StickerSheetTabEntry(page, smileysTitle, Icons.Filled.EmojiEmotions)
            }
            is StickerSheetPage.Pack -> StickerSheetTabEntry(
                page,
                capabilities.installedPacks?.firstOrNull { it.slug == page.slug }?.title ?: page.slug,
                Icons.Filled.Inventory2,
            )
            StickerSheetPage.Shop -> StickerSheetTabEntry(page, shopTitle, Icons.Filled.Storefront)
        }
    }
}
