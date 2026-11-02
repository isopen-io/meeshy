package me.meeshy.sdk.model

import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeStickerCatalog

/** Le PNG que l'expéditeur a joint à son sticker — le repli d'un gabarit inconnu de ce binaire. */
data class StickerPicture(
    val fileUrl: String,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val thumbnailColor: String? = null,
)

/**
 * Ce qui est dessiné pour un sticker de conversation, par PRIORITÉ — miroir de
 * `BubbleSticker.RenderSource.resolve` (iOS, #4823) :
 * film Mee/Meo embarqué, Instant embarqué, gabarit vectoriel connu, emoji sans gabarit,
 * PNG joint, sinon emoji de repli. Fonction pure, déterministe.
 */
sealed interface StickerRenderSource {
    data class Mee(val id: String) : StickerRenderSource
    data class MeeInstant(val id: String) : StickerRenderSource
    data class Template(val id: String) : StickerRenderSource
    data class Picture(val picture: StickerPicture) : StickerRenderSource
    data class Emoji(val emoji: String) : StickerRenderSource

    companion object {
        fun resolve(
            sticker: MessageSticker,
            picture: StickerPicture?,
            registryKnows: (String) -> Boolean,
            templateFallbackEmoji: (String) -> String? = { null },
        ): StickerRenderSource {
            MeeStickerCatalog.sticker(sticker.templateId)?.let { return Mee(it.id) }
            MeeInstantCatalog.instant(sticker.templateId)?.let { return MeeInstant(it.id) }
            val templateId = sticker.templateId
            if (!templateId.isNullOrEmpty() && registryKnows(templateId)) return Template(templateId)
            if (templateId == null && !sticker.emoji.isNullOrEmpty()) return Emoji(sticker.emoji)
            if (picture != null && picture.fileUrl.isNotEmpty()) return Picture(picture)
            return Emoji(fallbackEmoji(sticker, templateFallbackEmoji))
        }

        fun fallbackEmoji(
            sticker: MessageSticker,
            templateFallbackEmoji: (String) -> String? = { null },
        ): String {
            if (!sticker.emoji.isNullOrEmpty()) return sticker.emoji
            val templateId = sticker.templateId
            if (!templateId.isNullOrEmpty()) templateFallbackEmoji(templateId)?.let { return it }
            return StickerDisplayRank.IMAGE_FALLBACK_EMOJI
        }
    }
}
