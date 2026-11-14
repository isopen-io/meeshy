package me.meeshy.sdk.model.call

/**
 * Le fondu d'une rangée qui peut défiler (P2.8, P12.8, P14.9, U1.13, U3.3, C1.5, loi 17.9) : une rangée n'est jamais coupée
 * net, elle s'efface à ses DEUX bords physiques, qu'elle défile ou non — comme `ScrollEdgeFadeMask(start: true, end: true)`
 * sur iOS, posé sans condition. La loi ne lit donc aucun état de défilement : une rangée qui tient entière a le même
 * dessin que celle qui déborde, et ne change pas d'allure quand un contenu s'ajoute. Les bords sont ceux de l'écran, jamais
 * ceux de l'ordre de lecture : la droite-à-gauche ne change rien. L'écran ne fait que dessiner.
 */
object CallScrollEdgeFade {
    /** Les deux bords PHYSIQUES de la rangée : [first] est le haut (axe vertical) ou la gauche (axe horizontal). */
    data class Edges(val first: Boolean, val last: Boolean) {
        val any: Boolean get() = first || last
    }

    val edges: Edges = Edges(first = true, last = true)
}
