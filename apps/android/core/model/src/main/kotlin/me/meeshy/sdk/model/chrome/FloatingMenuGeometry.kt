package me.meeshy.sdk.model.chrome

/**
 * Geometrie PURE du menu deploye par le bouton flottant droit.
 *
 * Le menu suit deux regles, toutes deux derivees de la position du bouton et non
 * d'un cote fixe — un bouton deplacable rend chaque hypothese de bord fausse un
 * jour ou l'autre :
 *  - il se deploie du cote ou il reste de la place (haut/bas) ;
 *  - il s'etend vers l'interieur de l'ecran (jamais au-dela du bord d'ancrage).
 *
 * Unites : [FloatingButtonPosition] est normalisee, le reste est en pixels — la
 * conversion appartient a l'appelant Compose, la REGLE vit ici ou elle se teste
 * en JVM pur.
 */

/** Vers le haut si le bouton est dans la moitie basse : c'est la qu'est la place. */
public fun menuUnfoldsUpward(anchor: FloatingButtonPosition): Boolean = !anchor.isTop

/** Les items s'etendent vers l'interieur : bouton a gauche -> le menu pousse a droite. */
public fun menuGrowsRightward(anchor: FloatingButtonPosition): Boolean = anchor.isLeft

/** Rectangle de l'ancre (le bouton flottant), en pixels fenetre. */
public data class MenuAnchorBounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
) {
    public val centerX: Int get() = (left + right) / 2
    public val centerY: Int get() = (top + bottom) / 2
}

/** Position finale du menu, en pixels fenetre. */
public data class MenuPopupOffset(val xPx: Int, val yPx: Int)

/**
 * Place le menu contre son ancre puis le RAMENE entierement dans la fenetre.
 *
 * Alignement : sur le bord de l'ancre cote ecran (ancre a droite -> bords droits
 * alignes), au-dessus ou en dessous selon la moitie d'ecran de l'ancre. Le clamp
 * final prime sur tout le reste : un menu partiellement hors viewport est un menu
 * dont des destinations de navigation n'existent plus.
 */
public fun menuPopupOffset(
    anchor: MenuAnchorBounds,
    menuWidthPx: Int,
    menuHeightPx: Int,
    windowWidthPx: Int,
    windowHeightPx: Int,
    spacingPx: Int,
): MenuPopupOffset {
    val anchoredLeft = anchor.centerX < windowWidthPx / 2
    val x = if (anchoredLeft) anchor.left else anchor.right - menuWidthPx

    val unfoldsUpward = anchor.centerY >= windowHeightPx / 2
    val y = if (unfoldsUpward) anchor.top - spacingPx - menuHeightPx else anchor.bottom + spacingPx

    return MenuPopupOffset(
        xPx = x.coerceIn(0, maxOf(0, windowWidthPx - menuWidthPx)),
        yPx = y.coerceIn(0, maxOf(0, windowHeightPx - menuHeightPx)),
    )
}
