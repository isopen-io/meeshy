package me.meeshy.sdk.model

import me.meeshy.sdk.model.sticker.StickerTemplateCatalog

/**
 * Le sticker qu'une bulle dessine, avec le PNG joint qui l'accompagne — miroir d'iOS
 * `BubbleContentBuilder.resolveSticker` (#4823, #10655) : `null` quand le message n'en porte pas, ou en porte un que
 * rien ne peint (ni gabarit, ni emoji, ni image jointe). Un `stickerId` de bibliothèque seul se dessine par son PNG.
 * [source] est ce qui est dessiné, par la priorité de [StickerRenderSource.resolve].
 */
data class BubbleStickerSpec(val sticker: MessageSticker, val picture: StickerPicture?) {
    val source: StickerRenderSource
        get() = sourceWith { it in StickerTemplateCatalog.composeDrawnIds }

    /** [drawn] : ce que l'hôte sait DESSINER ; un gabarit catalogué mais non dessiné retombe sur son emoji de repli. */
    fun sourceWith(drawn: (String) -> Boolean): StickerRenderSource = StickerRenderSource.resolve(
        sticker = sticker,
        picture = picture,
        registryKnows = drawn,
        templateFallbackEmoji = StickerTemplateCatalog::fallbackEmoji,
    )

    companion object {
        fun resolve(sticker: MessageSticker?, firstImage: StickerPicture?): BubbleStickerSpec? {
            val worthy = sticker?.ifWireWorthy ?: return null
            val picture = firstImage?.takeIf { it.fileUrl.isNotEmpty() }
            if (!worthy.isRenderable && picture == null) return null
            return BubbleStickerSpec(worthy, picture)
        }
    }
}
