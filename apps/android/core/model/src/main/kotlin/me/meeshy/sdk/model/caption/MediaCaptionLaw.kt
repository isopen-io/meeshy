package me.meeshy.sdk.model.caption

import me.meeshy.sdk.model.MediaCaptionRule

/**
 * La loi de repli d'une légende de média (reel, story, galerie), miroir de
 * `MediaCaptionRule` iOS : au-delà de 30 mots on montre les 15 premiers, jamais une
 * boîte. UNE seule règle pour tous les lecteurs — [MediaCaptionRule] en porte les
 * nombres, cette loi y ajoute ce que l'écran affiche selon l'état déplié.
 */
object MediaCaptionLaw {
    const val WORD_THRESHOLD: Int = MediaCaptionRule.WORD_THRESHOLD
    const val WORD_HEAD: Int = MediaCaptionRule.WORD_HEAD
    const val ELLIPSIS: String = "…"

    fun collapse(text: String): MediaCaptionRule.Folded = MediaCaptionRule.collapse(text)

    /** Le texte à peindre : entier si déplié ou court, sinon la tête suivie de « … ». */
    fun shown(text: String, expanded: Boolean): String {
        if (expanded) return text
        val folded = collapse(text)
        return if (folded.isTruncated) folded.head + ELLIPSIS else text
    }
}
