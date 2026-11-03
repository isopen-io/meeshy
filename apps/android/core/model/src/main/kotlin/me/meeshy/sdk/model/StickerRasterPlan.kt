package me.meeshy.sdk.model

import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import kotlin.math.floor
import kotlin.math.max

/**
 * Ce qu'on rastérise pour envoyer un sticker, décidé en PUR — miroir de `ConversationStickerRendering` (iOS, #4823).
 * Le fil porte une image ORDINAIRE (la seule que voit un lecteur qui ne sait pas dessiner un gabarit) et, à côté, le
 * descripteur [MessageSticker] qui dit ce qu'elle représente. Ce plan choisit la forme et le descripteur ; le peintre
 * (sdk-ui) n'a plus qu'à exécuter.
 */
object StickerRasterPlan {
    /** Côté du carré emoji, en pixels logiques. */
    const val EMOJI_SIDE: Float = 256f
    /** Corps du glyphe : il remplit le carré en laissant de l'air. */
    const val EMOJI_FONT_SIZE: Float = 200f
    /** Côté maximal d'un gabarit rendu. */
    const val TEMPLATE_MAX_SIDE: Float = 512f
    /** Échelle FIXE : le PNG voyage vers d'autres appareils, elle ne dépend pas de l'écran de l'auteur. */
    const val RENDER_SCALE: Float = 2f

    sealed interface Plan {
        val sticker: MessageSticker

        /** Un glyphe centré dans un carré transparent. */
        data class Emoji(val glyph: String, override val sticker: MessageSticker) : Plan

        /** Un gabarit du catalogue, avec ses emplacements figés. */
        data class Template(val templateId: String, val slots: Map<String, String>, override val sticker: MessageSticker) : Plan

        /** Un sticker animé : le fichier d'origine part tel quel, l'image fixe ne sert qu'à peindre la bulle. */
        data class Original(val mimeType: String, override val sticker: MessageSticker) : Plan
    }

    /** `null` pour une chaîne vide : rien à peindre, donc rien à envoyer. */
    fun emoji(glyph: String): Plan.Emoji? {
        val trimmed = glyph.trim()
        return if (trimmed.isEmpty()) null else Plan.Emoji(trimmed, MessageSticker(emoji = glyph))
    }

    /**
     * Un gabarit du catalogue ; [drawable] dit si CE binaire sait le dessiner. Gabarit inconnu du catalogue : `null`.
     * Gabarit connu mais non dessinable : l'EMOJI de repli part à sa place, le même que verrait un lecteur ancien.
     */
    fun template(templateId: String, slots: Map<String, String>, drawable: (String) -> Boolean): Plan? {
        val template = StickerTemplateCatalog.template(templateId) ?: return null
        if (!drawable(templateId)) return emoji(template.fallbackEmoji)
        return Plan.Template(
            templateId = template.id,
            slots = slots,
            sticker = MessageSticker(templateId = template.id, slots = slots, animation = template.animation, emoji = template.fallbackEmoji),
        )
    }

    /** Lieu décoré : le sticker EST le message, le lieu n'est que le texte du cartouche. */
    fun location(templateId: String, placeName: String?, placeDetail: String?, hereLabel: String, drawable: (String) -> Boolean): Plan? =
        template(templateId, locationSlots(placeName, placeDetail, hereLabel), drawable)

    fun locationSlots(placeName: String?, placeDetail: String?, hereLabel: String): Map<String, String> = buildMap {
        put(StickerSlotFiller.PLACE_NAME, placeName?.takeIf { it.isNotBlank() } ?: placeDetail?.takeIf { it.isNotBlank() } ?: hereLabel)
        put(StickerSlotFiller.PLACE_DETAIL, if (placeName.isNullOrBlank()) "" else placeDetail.orEmpty())
    }

    /** Cinématique : l'image du film porte son fichier d'origine (octets et type du pack), écrit tel quel. */
    fun original(mimeType: String, sticker: MessageSticker): Plan.Original = Plan.Original(mimeType, sticker)

    /** Corps à donner au gabarit : si sa mesure dépasse le plafond, on ramène le corps du même rapport. */
    fun templateSide(measuredWidth: Float, measuredHeight: Float): Float? {
        if (measuredWidth <= 0f || measuredHeight <= 0f) return null
        val longest = max(measuredWidth, measuredHeight)
        return if (longest > TEMPLATE_MAX_SIDE) TEMPLATE_MAX_SIDE * (TEMPLATE_MAX_SIDE / longest) else TEMPLATE_MAX_SIDE
    }

    /** Le plafond se GARANTIT sur l'image rendue : réduction proportionnelle finale, jamais d'agrandissement. */
    fun fitted(width: Float, height: Float, maxSide: Float = TEMPLATE_MAX_SIDE): StickerBoxLaw.Size {
        val longest = max(width, height)
        if (width <= 0f || height <= 0f || longest <= maxSide) return StickerBoxLaw.Size(width, height)
        val ratio = maxSide / longest
        return StickerBoxLaw.Size(floor(width * ratio), floor(height * ratio))
    }

    /** L'extension du fichier écrit : celle de son type. */
    fun fileExtension(mimeType: String): String = when (mimeType.lowercase()) {
        "image/gif" -> "gif"
        "image/webp" -> "webp"
        "image/apng" -> "png"
        "image/jpeg" -> "jpg"
        else -> "png"
    }
}
