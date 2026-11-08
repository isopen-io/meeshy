package me.meeshy.sdk.model.composer

/**
 * Ce que la ZONE BASSE de la scène porte — un seul des quatre, jamais deux (miroir de `ComposerLowZone` iOS, #4579).
 * `toolIsOpen` vient du mode du rail, seule source qui SAIT qu'un outil est ouvert — jamais de la présence d'une vue,
 * qui peut être montée vide.
 */
sealed interface ComposerLowZone {
    /** Les propriétés de l'objet édité : elles passent avant tout, la scène se réduisant au-dessus d'elles. */
    data object Properties : ComposerLowZone

    /** Un outil est déplié : ses options prennent tout le bas. */
    data object ToolOptions : ComposerLowZone

    /** Aucun outil : la bande demandée ET servie. */
    data class Band(val band: ComposerSceneBand) : ComposerLowZone

    /** Ni l'un ni l'autre : le bas ne porte que le socle. */
    data object Nothing : ComposerLowZone

    companion object {
        fun resolve(toolIsOpen: Boolean, band: ComposerSceneBand?, properties: Boolean = false): ComposerLowZone = when {
            properties -> Properties
            toolIsOpen -> ToolOptions
            band != null -> Band(band)
            else -> Nothing
        }
    }
}

/**
 * La ZONE CANONIQUE : ce que le bas peint hors outil et qui s'efface quand un outil s'ouvre (#5010). Le `when` de
 * [yieldsToTool] est exhaustif : un nouvel élément doit dire s'il cède la place.
 */
object ComposerCanonicalZone {
    enum class Element {
        /** Le pied des hashtags et mentions référencés. */
        REFERENCES,

        /** Les jetons de l'objet sélectionné. */
        OBJECT_CHIPS,
    }

    fun yieldsToTool(element: Element): Boolean = when (element) {
        Element.REFERENCES -> true
        Element.OBJECT_CHIPS -> true
    }

    fun isServed(element: Element, toolIsOpen: Boolean): Boolean = !(toolIsOpen && yieldsToTool(element))
}

/**
 * L'invite d'une scène vide : « Ceci est votre scène — ajoutez-y un texte, un dessin, une image ou une vidéo ». Elle ne
 * paraît que sur une scène nue, sans outil ouvert, sans sélection et sans viseur armé (elle ne couvre jamais un geste).
 */
object ComposerSceneInvite {
    fun shown(sceneIsEmpty: Boolean, toolIsOpen: Boolean, selecting: Boolean, viewfinderArmed: Boolean): Boolean =
        sceneIsEmpty && !toolIsOpen && !selecting && !viewfinderArmed
}
