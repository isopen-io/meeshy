package me.meeshy.app.stories

import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerDisplayRank
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeSlot
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.messageSticker
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog

/**
 * La RECETTE qu'un sticker de conversation emporte à côté de son image (#14334) — miroir des fabriques d'iOS
 * (`MessageSticker.emoji`, `.template`, `MeeSticker.messageSticker`, `MeeInstant.messageSticker(slots:)`, `StickerPack.messageSticker(for:)`, `.library`) et
 * du contrat partagé (`packages/shared/types/message-sticker.ts`). `null` : l'image part seule, sans recette.
 */
internal object ConversationStickerRecipe {
    private const val PACK_TEMPLATE_PREFIX = "pack."
    private val SERVER_ID = Regex("^[0-9a-fA-F]{24}$")

    fun of(choice: StickerSheetChoice, route: StickerChoiceRoute): MessageSticker? = when (route) {
        is StickerChoiceRoute.Glyph -> MessageSticker(emoji = route.emoji)
        is StickerChoiceRoute.Template -> StickerTemplateCatalog.template(route.templateId)?.let { template ->
            MessageSticker(templateId = template.id, slots = route.slots, animation = template.animation, emoji = template.fallbackEmoji)
        }
        is StickerChoiceRoute.MeeImage -> MessageSticker(templateId = MeeStickerCatalog.templateId(route.stickerId), emoji = route.emoji)
        is StickerChoiceRoute.PackImage -> (choice as? StickerSheetChoice.PackItem)?.let { item ->
            MessageSticker(
                templateId = "$PACK_TEMPLATE_PREFIX${item.packSlug}.${item.itemId}",
                emoji = route.emoji.takeUnless { it == StickerDisplayRank.IMAGE_FALLBACK_EMOJI },
            )
        }
        is StickerChoiceRoute.InstantImage -> MeeInstantCatalog.byId(route.instantId)?.messageSticker(MeeSlot.slots(route.slots))
        is StickerChoiceRoute.LibraryImage -> route.itemId.trim().takeIf(SERVER_ID::matches)?.let { MessageSticker(stickerId = it.lowercase()) }
    }
}
