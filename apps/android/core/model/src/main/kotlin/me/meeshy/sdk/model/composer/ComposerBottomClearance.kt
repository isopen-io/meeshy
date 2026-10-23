package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min

/**
 * L'air que la barre de composition laisse sous elle, clavier fermé — miroir d'iOS
 * `ComposerBottomClearance` (#11565).
 *
 * L'air exigé vaut `max(encart bas, diamètre d'une porte)`, jamais leur somme. La règle part
 * de l'air que l'hôte laisse DÉJÀ sous la barre (barre système, multi-fenêtre comprise) et ne
 * rend que le complément ; un clavier ou un panneau qui prend la place garde l'espacement.
 */
object ComposerBottomClearance {
    const val DOOR_DIAMETER_DP: Float = 44f

    fun required(safeAreaBottomDp: Float, doorDiameterDp: Float = DOOR_DIAMETER_DP): Float =
        max(safeAreaBottomDp, doorDiameterDp)

    /**
     * Le relèvement à ajouter sous la barre. [spaceBelowDp] est l'air mesuré au repos (`null`
     * tant que rien n'est mesuré : rien ne bouge) ; [inputSurfaceShown] vaut vrai quand un
     * clavier ou un panneau est ouvert sous la barre.
     */
    fun lift(
        spaceBelowDp: Float?,
        safeAreaBottomDp: Float,
        inputSurfaceShown: Boolean,
        doorDiameterDp: Float = DOOR_DIAMETER_DP,
    ): Float {
        if (inputSurfaceShown || spaceBelowDp == null) return 0f
        val needed = required(safeAreaBottomDp, doorDiameterDp)
        return min(max(needed - max(spaceBelowDp, 0f), 0f), needed)
    }
}
