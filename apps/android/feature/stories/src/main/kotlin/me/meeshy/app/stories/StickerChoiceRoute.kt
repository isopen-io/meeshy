package me.meeshy.app.stories

import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.StickerDisplayRank
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog

/**
 * Ce que le compositeur fait d'un choix de la feuille (#13847), décidé en pur avant tout octet : un emoji se pose en
 * glyphe, un gabarit avec ses emplacements (un gabarit d'heure rejoué depuis les Récents prend l'heure du moment), Mee,
 * un sticker de pack et une vignette de Mes stickers en IMAGE téléversée, comme iOS ; un Instant de Mee (#14345) en image
 * fixe du film avec ses mots, que seule la conversation envoie. `null` : rien ne se pose (gabarit
 * inconnu, cadre à mots sans mots, sticker disparu du pack, choix que la scène ne sert pas).
 */
internal sealed interface StickerChoiceRoute {
    data class Glyph(val emoji: String) : StickerChoiceRoute
    data class Template(val templateId: String, val slots: Map<String, String>) : StickerChoiceRoute
    data class MeeImage(val stickerId: String, val emoji: String) : StickerChoiceRoute
    data class PackImage(val fileUrl: String, val emoji: String) : StickerChoiceRoute
    data class LibraryImage(val itemId: String) : StickerChoiceRoute
    data class InstantImage(val instantId: String, val slots: Map<String, String>) : StickerChoiceRoute

    companion object {
        fun of(choice: StickerSheetChoice, packs: List<StickerPackSummary>?, now: Instant, zone: ZoneId, locale: Locale): StickerChoiceRoute? =
            when (choice) {
                is StickerSheetChoice.Emoji -> choice.glyph.takeIf { it.isNotBlank() }?.let(::Glyph)
                is StickerSheetChoice.Template -> template(choice, now, zone, locale)
                is StickerSheetChoice.Mee -> MeeStickerCatalog.stickerById(choice.stickerId)?.let { MeeImage(it.id, it.emoji) }
                is StickerSheetChoice.PackItem -> packs.orEmpty().firstOrNull { it.slug == choice.packSlug }
                    ?.sendableItems?.firstOrNull { it.key == choice.itemId && it.fileUrl.isNotBlank() }
                    ?.let { PackImage(it.fileUrl, it.emoji.ifBlank { StickerDisplayRank.IMAGE_FALLBACK_EMOJI }) }
                is StickerSheetChoice.Library -> LibraryImage(choice.itemId)
                is StickerSheetChoice.Instant -> MeeInstantCatalog.byId(choice.instantId)?.let { InstantImage(it.id, choice.slots) }
                is StickerSheetChoice.LocationTemplate -> null
            }

        private fun template(choice: StickerSheetChoice.Template, now: Instant, zone: ZoneId, locale: Locale): Template? {
            val template = StickerTemplateCatalog.template(choice.templateId) ?: return null
            val slots = choice.slots.ifEmpty { StickerSlotFiller.slotsFor(template, now, zone, locale, "") ?: return null }
            return Template(template.id, slots)
        }
    }
}
