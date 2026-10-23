package me.meeshy.sdk.model

import java.text.Normalizer

/** Les onglets FIXES de la feuille (miroir de `StickerSheetTab` d'iOS). */
enum class StickerSheetTab { SEARCH, FAVORITES, RECENTS, CUSTOM, SMILEYS }

/** Un pack de stickers installé, tel que la feuille en a besoin : son slug, son nom et ce qu'on peut en poser. */
data class StickerPackInfo(val slug: String, val title: String, val sendableItemCount: Int)

/**
 * Les pages de la feuille : onglets fixes, un par pack installé, la Boutique — miroir de
 * `StickerSheetPage` d'iOS. Un pack est une DONNÉE (son slug), pas un cas d'énumération.
 */
sealed interface StickerSheetPage {
    val id: String

    data class Fixed(val tab: StickerSheetTab) : StickerSheetPage {
        override val id: String get() = "tab.${tab.name.lowercase()}"
    }

    data class Pack(val slug: String) : StickerSheetPage {
        override val id: String get() = "pack.$slug"
    }

    data object Shop : StickerSheetPage {
        override val id: String get() = "shop"
    }

    val isPack: Boolean get() = this is Pack
}

/** Les trois packs intégrés, dans LEUR ordre (Mee, Meo, Mee & Meo). */
val BUILTIN_STICKER_PACK_SLUGS: List<String> = listOf("mee", "meo", "mee-et-meo")

object StickerSheetPageModel {

    /**
     * Les pages servies, dans l'ordre — la règle PURE.
     *
     * - [hasMee] : l'hôte sait poser un film Mee ; sans lui, aucun pack intégré n'a d'onglet.
     * - [installed] : les packs installés, `null` tant qu'on ne sait pas — les trois intégrés le sont
     *   alors par défaut.
     * - [hasPackPick] : l'hôte sait poser un sticker de tiers.
     * - [hasShop] : l'hôte sert la Boutique ; [hasCustom] : il sert l'onglet Personnalisés.
     *   Une capacité absente RETIRE l'onglet, elle ne le grise pas.
     */
    fun offered(
        hasMee: Boolean,
        installed: List<StickerPackInfo>?,
        hasPackPick: Boolean,
        hasShop: Boolean,
        hasCustom: Boolean = true,
    ): List<StickerSheetPage> {
        val installedSlugs = installed?.map { it.slug }?.toSet()
        val builtins = if (hasMee) {
            BUILTIN_STICKER_PACK_SLUGS
                .filter { installedSlugs?.contains(it) ?: true }
                .map(StickerSheetPage::Pack)
        } else {
            emptyList()
        }
        val thirdParty = if (hasPackPick) {
            installed.orEmpty()
                .filter { it.slug !in BUILTIN_STICKER_PACK_SLUGS && it.sendableItemCount > 0 }
                .map { StickerSheetPage.Pack(it.slug) }
        } else {
            emptyList()
        }
        val lead = listOf(StickerSheetTab.SEARCH, StickerSheetTab.FAVORITES, StickerSheetTab.RECENTS)
            .map(StickerSheetPage::Fixed)
        val tail = (if (hasCustom) listOf<StickerSheetPage>(StickerSheetPage.Fixed(StickerSheetTab.CUSTOM)) else emptyList()) +
            StickerSheetPage.Fixed(StickerSheetTab.SMILEYS) +
            (if (hasShop) listOf(StickerSheetPage.Shop) else emptyList())
        return lead + builtins + thirdParty + tail
    }

    /** La page choisie si elle est encore servie, sinon la première : un pack retiré ne laisse pas la feuille sur une page disparue. */
    fun resolved(chosen: StickerSheetPage, among: List<StickerSheetPage>): StickerSheetPage =
        if (chosen in among) chosen else among.firstOrNull() ?: StickerSheetPage.Fixed(StickerSheetTab.SEARCH)

    /** Au-delà de six entrées, la capsule défile. */
    const val FIXED_WIDTH_LIMIT: Int = 6

    fun tabBarScrolls(entryCount: Int): Boolean = entryCount > FIXED_WIDTH_LIMIT

    /** Sans casse ni accents : « ÉCOLE » trouve « ecole ». */
    fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()

    /** Filtre par titre, sans casse ni accents ; requête vide = tout. Ordre conservé. */
    fun <T> filterByTitle(items: List<T>, query: String, title: (T) -> String): List<T> {
        val needle = fold(query)
        return if (needle.isEmpty()) items else items.filter { fold(title(it)).contains(needle) }
    }
}
