package me.meeshy.app.chat.export

import kotlin.math.floor

/**
 * **LE HÉROS DU SUPPORT** (#13922, miroir de `MessageCardHero.swift`) : le média d'un post, d'un réel ou d'une story ouvre
 * la carte de son commentaire — grand, pleine largeur dans ses marges, AVANT la ligne du support. Il n'est pas un média de
 * la réponse : il a sa place, sa hauteur, et ne compte pas dans la grille du dessous.
 */
object CardHero {
    /** La marge entre le bord de la carte et le héros, de chaque côté (la colonne de texte en a 96). */
    const val MARGIN = 48.0
    /** Le rapport hauteur / largeur permis : du 16:9 au 4:5 ; au-delà, le héros est recadré. */
    const val MIN_RATIO = 0.5625
    const val MAX_RATIO = 1.25
    /** Le rapport d'un héros dont on ne connaît pas les côtés : 4:3. */
    const val UNKNOWN_RATIO = 0.75
    /** La part du budget de hauteur qu'un héros ne dépasse jamais : le texte garde sa place. */
    const val MAX_SHARE = 0.45
    /** L'espace entre le héros et la ligne du support. */
    const val GAP = 40.0

    /** La hauteur d'un héros de [width] dont le rapport largeur / hauteur est [aspect] (`null` : inconnu), dans [budget]. */
    fun height(aspect: Double?, width: Double, budget: Double): Double {
        val ratio = aspect?.takeIf { it.isFinite() && it > 0 }?.let { (1 / it).coerceIn(MIN_RATIO, MAX_RATIO) } ?: UNKNOWN_RATIO
        return minOf(cardRound(width * ratio), floor(budget * MAX_SHARE))
    }
}
