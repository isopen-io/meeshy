package me.meeshy.sdk.model.sticker

/**
 * Ce que l'utilisateur a choisi dans la feuille — la destination décide ce que cela devient (une
 * décoration de la scène, un message). Miroir des sept natures d'iOS.
 */
sealed interface StickerSheetChoice {
    data class Emoji(val glyph: String) : StickerSheetChoice
    data class Library(val itemId: String) : StickerSheetChoice
    /** Un gabarit et ses emplacements FIGÉS à la pose (l'heure lue à l'ouverture, les mots tapés). */
    data class Template(val templateId: String, val slots: Map<String, String> = emptyMap()) : StickerSheetChoice
    data class LocationTemplate(val templateId: String) : StickerSheetChoice
    data class Mee(val stickerId: String) : StickerSheetChoice
    data class Instant(val instantId: String) : StickerSheetChoice
    data class PackItem(val packSlug: String, val itemId: String) : StickerSheetChoice

    /**
     * L'entrée que la pose laisse dans les récents, `null` pour ce que la mémoire ne retient pas (Instants, stickers de
     * tiers, cadres à mots — leurs mots ne se rejouent pas d'un tap).
     */
    val usageEntry: StickerUsageEntry?
        get() = when (this) {
            is Emoji -> StickerUsageEntry.emoji(glyph)
            is Library -> StickerUsageEntry.library(itemId)
            is Template -> StickerUsageEntry.template(templateId).takeUnless { StickerTemplateCatalog.template(templateId)?.takesProse == true }
            is LocationTemplate -> StickerUsageEntry.template(templateId)
            is Mee -> StickerUsageEntry.mee(stickerId)
            is Instant, is PackItem -> null
        }

    companion object {
        /** Le choix qu'une entrée des Favoris ou des Récents rejoue. */
        fun from(entry: StickerUsageEntry): StickerSheetChoice = when (entry.kind) {
            StickerUsageEntry.Kind.EMOJI -> Emoji(entry.value)
            StickerUsageEntry.Kind.TEMPLATE -> Template(entry.value)
            StickerUsageEntry.Kind.LIBRARY -> Library(entry.value)
            StickerUsageEntry.Kind.MEE -> Mee(entry.value)
        }
    }
}
