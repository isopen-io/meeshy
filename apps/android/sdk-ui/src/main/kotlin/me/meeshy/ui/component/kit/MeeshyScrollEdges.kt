package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/**
 * **Ce qu'une rangée qui défile cache encore, de chaque côté.** La loi vaut pour les deux axes et les deux sens de
 * lecture : [start] est le côté où le contenu commence (à gauche en LTR, à droite en RTL, en haut en vertical), [end]
 * celui où il finit. Un demi-point d'arrondi n'est pas un débord. Miroir de `MeeshyScrollEdges` (iOS), mêmes vecteurs.
 */
@Immutable
public data class MeeshyScrollEdges(val start: Boolean, val end: Boolean) {
    public val hasOverflow: Boolean get() = start || end

    /**
     * Les bords vus du côté PHYSIQUE : le côté des petites coordonnées, puis celui des grandes. Miroite [start] et [end]
     * en RTL horizontal.
     */
    public fun physicalSides(isRightToLeft: Boolean): Pair<Boolean, Boolean> =
        if (isRightToLeft) end to start else start to end

    public companion object {
        public val None: MeeshyScrollEdges = MeeshyScrollEdges(start = false, end = false)

        public const val TOLERANCE: Float = 0.5f

        /**
         * La loi, en distances le long de l'axe. [offset] : de combien le début du contenu a passé le début de la
         * fenêtre (négatif au rebond). Tout tient ⇒ aucun bord, quel que soit le décalage.
         */
        public fun of(content: Float, viewport: Float, offset: Float): MeeshyScrollEdges {
            if (content <= viewport + TOLERANCE) return None
            return MeeshyScrollEdges(start = offset > TOLERANCE, end = content - offset > viewport + TOLERANCE)
        }
    }
}
