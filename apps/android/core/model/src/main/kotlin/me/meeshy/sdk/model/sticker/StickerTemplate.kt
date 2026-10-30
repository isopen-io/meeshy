package me.meeshy.sdk.model.sticker

import me.meeshy.sdk.model.StickerAnimation

/**
 * Le rangement de la palette — miroir de `StickerTemplateFamily` (iOS, #4716). Android sert les deux familles de
 * l'onglet Personnalisés qui se remplissent de la donnée de l'AUTEUR : ses mots, son heure. Ce n'est pas une famille
 * d'objet de scène : une décoration reste un sticker qui porte un gabarit.
 */
enum class StickerTemplateFamily { TEXT, TIME }

/** Un emplacement de donnée d'un gabarit. Sa nature tranche le Prisme : une VALEUR ne se traduit jamais, une PROSE suit. */
data class StickerTemplateSlot(val name: String, val nature: Nature) {
    enum class Nature { VALUE, PROSE }
}

/**
 * Ce qu'un sticker DÉCORÉ est : un cadre et des emplacements — miroir de `StickerTemplate` (iOS). Pur : le dessin vit
 * dans `:sdk-ui` (`StickerTemplateArtwork`), le même pour la feuille, la scène et le lecteur. [fallbackEmoji] est ce que
 * lit un client qui ne sait pas rendre ce gabarit ; [posedScale] l'échelle de pose (un gabarit MESURE son contenu, il ne
 * se pose pas à l'échelle d'un glyphe nu) ; [animation] le mouvement avec lequel il se pose.
 */
data class StickerTemplate(
    val id: String,
    val family: StickerTemplateFamily,
    val slots: List<StickerTemplateSlot>,
    val fallbackEmoji: String,
    val posedScale: Double,
    val animation: StickerAnimation? = null,
) {
    /** Le cadre attend les MOTS de l'auteur : sans eux, il ne se pose pas. */
    val takesProse: Boolean get() = slots.any { it.nature == StickerTemplateSlot.Nature.PROSE }
}
