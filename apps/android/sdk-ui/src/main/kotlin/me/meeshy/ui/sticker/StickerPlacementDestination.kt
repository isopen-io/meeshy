package me.meeshy.ui.sticker

import me.meeshy.sdk.model.sticker.StickerSheetChoice

/**
 * La destination décide ce que devient le choix : la feuille ne pose rien elle-même. La scène d'une
 * story pose une décoration ; plus tard la conversation enverra un message sticker — une seule feuille
 * sert les deux.
 */
public fun interface StickerPlacementDestination {
    public fun place(choice: StickerSheetChoice)
}
