package me.meeshy.ui.sticker

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.model.sticker.StickerUsageEntry

/** Une section de la page Smileys : une catégorie Unicode et ses glyphes. */
@Immutable
public data class StickerEmojiCategory(
    public val id: String,
    public val title: String,
    public val emojis: List<String>,
)

/**
 * Ce que l'hôte injecte pour que la feuille montre ses onglets. La feuille ne charge rien et ne décide
 * de rien : une capacité ABSENTE retire l'onglet au lieu de le griser.
 *
 * - [emojiCategories] / [emojiSearch] : le catalogue d'emoji (les huit catégories) et la recherche par
 *   mots-clés, surplus assumé d'Android sur la recherche par titre.
 * - [installedPacks] : `null` tant qu'on ne sait pas ; [packContent] est la page d'un pack (slug donné).
 * - [custom] : l'onglet Personnalisés ; [shop] : la Boutique ; [onOpenShop] : le lien « Plus dans la boutique ».
 * - [entryContent] : le dessin d'une entrée non-emoji des Favoris/Récents ; sans lui, ces entrées sont des
 *   orphelines (ignorées à l'affichage, jamais purgées).
 */
@Immutable
public class StickerCapabilities(
    public val emojiCategories: List<StickerEmojiCategory>,
    public val emojiSearch: (String) -> List<String> = { emptyList() },
    public val installedPacks: List<StickerPackSummary>? = null,
    public val hasMee: Boolean = false,
    public val packContent: (@Composable (slug: String) -> Unit)? = null,
    public val custom: (@Composable () -> Unit)? = null,
    public val shop: (@Composable () -> Unit)? = null,
    public val onOpenShop: (() -> Unit)? = null,
    public val entryContent: (@Composable (entry: StickerUsageEntry, modifier: Modifier) -> Unit)? = null,
) {
    public fun knows(entry: StickerUsageEntry): Boolean =
        entry.kind == StickerUsageEntry.Kind.EMOJI || entryContent != null
}
