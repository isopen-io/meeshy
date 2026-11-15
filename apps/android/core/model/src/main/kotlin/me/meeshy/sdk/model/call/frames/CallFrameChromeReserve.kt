package me.meeshy.sdk.model.call.frames

import kotlin.math.ceil
import kotlin.math.min

/**
 * LES BANDES QUE DES CONTRÔLES COUVRENT (#9777) — en part de la hauteur de la toile, en haut et en bas.
 * Un texte du cadre (titre, sous-titre, signature, noms) ne s'y pose jamais : les réserves de texte
 * descendent sous la bande haute et remontent au-dessus de la bande basse. Le fond et la bordure restent
 * bord à bord. [NONE] ⇒ la géométrie canonique (parité web et iOS).
 *
 * Une bande ne dépasse jamais la moitié de la toile ; elle est arrondie au millième SUPÉRIEUR, pour qu'une
 * mesure voisine ne repeigne pas le cadre et que l'arrondi ne rende jamais une bande plus courte que le contrôle.
 */
public class CallFrameChromeReserve(top: Double, bottom: Double) {
    public val top: Double = share(top)
    public val bottom: Double = share(bottom)

    /** Les deux bandes dans une toile de [width] × [height]. */
    public fun bands(width: Double, height: Double): Pair<CallFrameRect, CallFrameRect> {
        val topHeight = top * height
        val bottomHeight = bottom * height
        return CallFrameRect(0.0, 0.0, width, topHeight) to
            CallFrameRect(0.0, height - bottomHeight, width, bottomHeight)
    }

    override fun equals(other: Any?): Boolean =
        other is CallFrameChromeReserve && other.top == top && other.bottom == bottom

    override fun hashCode(): Int = 31 * top.hashCode() + bottom.hashCode()

    override fun toString(): String = "CallFrameChromeReserve(top=$top, bottom=$bottom)"

    public companion object {
        public val NONE: CallFrameChromeReserve = CallFrameChromeReserve(0.0, 0.0)

        private fun share(value: Double): Double =
            if (value.isFinite() && value > 0) min(0.5, ceil(value * 1000) / 1000) else 0.0

        /** Les bandes de contrôles mesurées en points sur une vue de [height] points. */
        public fun covering(top: Double, bottom: Double, height: Double): CallFrameChromeReserve =
            if (height > 0) CallFrameChromeReserve(top / height, bottom / height) else NONE
    }
}
