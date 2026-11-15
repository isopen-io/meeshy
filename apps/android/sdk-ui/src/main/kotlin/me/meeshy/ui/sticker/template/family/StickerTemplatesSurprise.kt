package me.meeshy.ui.sticker.template.family

import me.meeshy.sdk.model.sticker.StickerTemplateFamily
import me.meeshy.ui.sticker.template.StickerTemplateDrawer
import me.meeshy.ui.sticker.template.StickerTemplateFamilyDrawing

/**
 * La famille surprise du catalogue. Squelette posé par le socle : le lot de la famille déclare ici ses dessinateurs (un par
 * gabarit, à côté de son dessin) et passe `hasDrawers` à vrai — il ne touche ni la table ni le registre. Tant que la
 * liste est vide, ses gabarits se rendent par leur emoji de repli.
 */
internal object SurpriseStickerTemplates : StickerTemplateFamilyDrawing {
    override val family: StickerTemplateFamily = StickerTemplateFamily.SURPRISE
    override val drawers: List<StickerTemplateDrawer> = emptyList()
}
