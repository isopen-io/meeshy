package me.meeshy.sdk.model

/** Ce qu'un sticker de story est — miroir de `StoryStickerKind` (iOS). */
enum class StickerKind { EMOJI, IMAGE, TEMPLATE }

/**
 * La règle de RANG d'affichage d'un sticker : gabarit, puis image intégrée, puis emoji.
 * Miroir de `StorySticker.kind` et `wireEmoji` (iOS, `StorySticker.swift`).
 */
object StickerDisplayRank {
    /** Repli quand ni emoji ni gabarit connu ne disent quoi afficher (`imageFallbackEmoji`). */
    const val IMAGE_FALLBACK_EMOJI: String = "🖼️"

    fun kindOf(templateId: String, postMediaId: String): StickerKind = when {
        templateId.isNotEmpty() -> StickerKind.TEMPLATE
        postMediaId.isNotEmpty() -> StickerKind.IMAGE
        else -> StickerKind.EMOJI
    }

    /**
     * L'emoji écrit sur le fil : le sien s'il en a un, sinon le repli déclaré par son gabarit
     * ([templateFallback], `null` si ce binaire ne connaît pas le gabarit), sinon [IMAGE_FALLBACK_EMOJI].
     */
    fun wireEmoji(
        emoji: String,
        templateId: String,
        templateFallback: (String) -> String? = { null },
    ): String = when {
        emoji.isNotEmpty() -> emoji
        templateId.isNotEmpty() -> templateFallback(templateId) ?: IMAGE_FALLBACK_EMOJI
        else -> IMAGE_FALLBACK_EMOJI
    }
}
