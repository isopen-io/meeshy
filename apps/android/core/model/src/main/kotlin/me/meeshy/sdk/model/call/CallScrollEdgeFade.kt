package me.meeshy.sdk.model.call

/**
 * Le fondu d'une rangée qui défile (P12.8, P14.9) : une rangée n'est jamais coupée net, elle s'efface à ses deux bords.
 * La loi dit QUELS bords physiques s'effacent ; l'écran ne fait que dessiner.
 */
object CallScrollEdgeFade {
    /** Les deux bords PHYSIQUES de la rangée : [first] est le haut (axe vertical) ou la gauche (axe horizontal). */
    data class Edges(val first: Boolean, val last: Boolean) {
        val any: Boolean get() = first || last
    }

    /**
     * Une rangée qui tient entière n'est coupée nulle part : aucun fondu. Une rangée qui défile s'efface à ses DEUX
     * bords quand [symmetric] ; sinon (les rails verticaux) seul le bord derrière lequel des boutons attendent s'efface,
     * et le fondu se retire dès que ce bord est atteint. En lecture droite-à-gauche, l'axe horizontal part de la droite :
     * « derrière » est alors le bord physique de DROITE, jamais celui de gauche.
     */
    fun edges(
        canScrollBackward: Boolean,
        canScrollForward: Boolean,
        horizontal: Boolean,
        isRtl: Boolean,
        symmetric: Boolean,
    ): Edges = when {
        !canScrollBackward && !canScrollForward -> Edges(first = false, last = false)
        symmetric -> Edges(first = true, last = true)
        horizontal && isRtl -> Edges(first = canScrollForward, last = canScrollBackward)
        else -> Edges(first = canScrollBackward, last = canScrollForward)
    }
}
