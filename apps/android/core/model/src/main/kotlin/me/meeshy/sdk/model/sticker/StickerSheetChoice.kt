package me.meeshy.sdk.model.sticker

/**
 * Ce que l'utilisateur a choisi dans la feuille — la destination décide ce que cela devient (une
 * décoration de la scène, un message). Miroir des sept natures d'iOS.
 */
sealed interface StickerSheetChoice {
    data class Emoji(val glyph: String) : StickerSheetChoice
    data class Library(val itemId: String) : StickerSheetChoice
    data class Template(val templateId: String) : StickerSheetChoice
    data class LocationTemplate(val templateId: String) : StickerSheetChoice
    data class Mee(val stickerId: String) : StickerSheetChoice
    data class Instant(val instantId: String) : StickerSheetChoice
    data class PackItem(val packSlug: String, val itemId: String) : StickerSheetChoice

    /** L'entrée que la pose laisse dans les récents, `null` pour ce que la mémoire ne retient pas (Instants, stickers de tiers). */
    val usageEntry: StickerUsageEntry?
        get() = when (this) {
            is Emoji -> StickerUsageEntry.emoji(glyph)
            is Library -> StickerUsageEntry.library(itemId)
            is Template -> StickerUsageEntry.template(templateId)
            is LocationTemplate -> StickerUsageEntry.template(templateId)
            is Mee -> StickerUsageEntry.mee(stickerId)
            is Instant, is PackItem -> null
        }
}
